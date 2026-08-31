const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  createCartHash,
  createOrderRecord
} = require('../lib/checkout');
const JsonOrderStore = require('../lib/order-store');

function createOrder() {
  return {
    lineItems: [
      {
        book: { id: '1', title: 'Book One', amount: 2300 },
        quantity: 1,
        lineTotal: 2300
      }
    ],
    itemCount: 1,
    amount: 2300,
    currency: 'usd'
  };
}

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'stripe-orders-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const storePath = path.join(directory, 'orders.json');
  const store = new JsonOrderStore(storePath);
  await store.initialize();
  return { store, storePath };
}

test('creates and reuses an order for the same checkout token', async (t) => {
  const { store } = await createStore(t);
  const order = createOrder();
  const record = createOrderRecord(
    '123e4567-e89b-42d3-a456-426614174000',
    createCartHash(order, 'cus_test'),
    order,
    'cus_test'
  );

  const created = await store.createOrGet(record);
  const reused = await store.createOrGet(record);

  assert.equal(created.created, true);
  assert.equal(reused.created, false);
  assert.equal(reused.conflict, false);
  assert.equal(created.order.id, reused.order.id);
});

test('rejects reuse of a checkout token for a changed cart', async (t) => {
  const { store } = await createStore(t);
  const order = createOrder();
  const record = createOrderRecord(
    '123e4567-e89b-42d3-a456-426614174000',
    createCartHash(order, 'cus_test'),
    order,
    'cus_test'
  );

  await store.createOrGet(record);
  const conflicting = await store.createOrGet({
    ...record,
    cartHash: 'different-cart-hash'
  });

  assert.equal(conflicting.conflict, true);
});

test('rejects reuse of a checkout token for another customer', async (t) => {
  const { store } = await createStore(t);
  const order = createOrder();
  const record = createOrderRecord(
    '123e4567-e89b-42d3-a456-426614174000',
    createCartHash(order, 'cus_first'),
    order,
    'cus_first'
  );

  await store.createOrGet(record);
  const conflicting = await store.createOrGet({
    ...record,
    customerId: 'cus_second',
    cartHash: createCartHash(order, 'cus_second')
  });

  assert.equal(conflicting.conflict, true);
});

test('persists a PaymentIntent association across store instances', async (t) => {
  const { store, storePath } = await createStore(t);
  const order = createOrder();
  const record = createOrderRecord(
    '123e4567-e89b-42d3-a456-426614174000',
    createCartHash(order, 'cus_test'),
    order,
    'cus_test'
  );

  await store.createOrGet(record);
  await store.attachPaymentIntent(record.id, {
    id: 'pi_test_123',
    status: 'requires_payment_method'
  });

  const reloadedStore = new JsonOrderStore(storePath);
  await reloadedStore.initialize();
  const reloaded = await reloadedStore.findByPaymentIntentId('pi_test_123');

  assert.equal(reloaded.id, record.id);
  assert.equal(reloaded.customerId, 'cus_test');
  assert.equal(reloaded.paymentStatus, 'requires_payment_method');
});

test('deduplicates webhook events and protects succeeded orders from stale events', async (t) => {
  const { store } = await createStore(t);
  const order = createOrder();
  const record = createOrderRecord(
    '123e4567-e89b-42d3-a456-426614174000',
    createCartHash(order, 'cus_test'),
    order,
    'cus_test'
  );

  await store.createOrGet(record);
  await store.attachPaymentIntent(record.id, {
    id: 'pi_test_123',
    status: 'processing'
  });

  const succeeded = await store.applyStripeEvent({
    eventId: 'evt_success',
    eventCreated: 200,
    paymentIntentId: 'pi_test_123',
    paymentStatus: 'succeeded'
  });
  const duplicate = await store.applyStripeEvent({
    eventId: 'evt_success',
    eventCreated: 200,
    paymentIntentId: 'pi_test_123',
    paymentStatus: 'succeeded'
  });
  const stale = await store.applyStripeEvent({
    eventId: 'evt_processing_old',
    eventCreated: 100,
    paymentIntentId: 'pi_test_123',
    paymentStatus: 'processing'
  });

  assert.equal(succeeded.order.paymentStatus, 'succeeded');
  assert.equal(succeeded.order.fulfillmentStatus, 'ready_for_fulfillment');
  assert.equal(duplicate.duplicate, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.order.paymentStatus, 'succeeded');
});

test('reconciles an early webhook using order metadata', async (t) => {
  const { store } = await createStore(t);
  const order = createOrder();
  const record = createOrderRecord(
    'b84b6f62-22d0-44f7-bf4c-d5f746fe5361',
    createCartHash(order, 'cus_test'),
    order,
    'cus_test'
  );

  await store.createOrGet(record);
  const result = await store.applyStripeEvent({
    eventId: 'evt_early',
    eventCreated: 1700000000,
    orderId: record.id,
    paymentIntentId: 'pi_early',
    paymentStatus: 'succeeded'
  });

  assert.equal(result.found, true);
  assert.equal(result.order.paymentIntentId, 'pi_early');
  assert.equal(result.order.paymentStatus, 'succeeded');
  assert.equal(result.order.fulfillmentStatus, 'ready_for_fulfillment');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCartHash,
  createOrderRecord,
  validateCheckoutToken
} = require('../lib/checkout');

function createOrder() {
  return {
    lineItems: [
      {
        book: { id: '1', title: 'Book One', amount: 2300 },
        quantity: 2,
        lineTotal: 4600
      }
    ],
    itemCount: 2,
    amount: 4600,
    currency: 'usd'
  };
}

test('accepts only version 4 UUID checkout tokens', () => {
  assert.equal(
    validateCheckoutToken('123e4567-e89b-42d3-a456-426614174000'),
    true
  );
  assert.equal(validateCheckoutToken('not-a-checkout-token'), false);
});

test('creates a stable cart hash independent of line order', () => {
  const order = createOrder();
  const reversedOrder = {
    ...order,
    lineItems: [...order.lineItems].reverse()
  };

  assert.equal(createCartHash(order), createCartHash(reversedOrder));
});

test('creates an order record without storing payment credentials', () => {
  const checkoutToken = '123e4567-e89b-42d3-a456-426614174000';
  const order = createOrder();
  const record = createOrderRecord(
    checkoutToken,
    createCartHash(order),
    order
  );

  assert.match(record.id, /^ord_/);
  assert.equal(record.amount, 4600);
  assert.equal(record.paymentIntentId, null);
  assert.equal(record.fulfillmentStatus, 'unfulfilled');
});

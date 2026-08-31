'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findCustomerByEmail,
  findOrCreateCustomer,
  normalizeCustomerEmail
} = require('../lib/customer');

test('normalizes a valid customer email', () => {
  assert.equal(
    normalizeCustomerEmail('  Customer@Example.COM  '),
    'customer@example.com'
  );
});

test('rejects invalid customer emails', () => {
  assert.equal(normalizeCustomerEmail('not-an-email'), null);
  assert.equal(normalizeCustomerEmail(''), null);
  assert.equal(normalizeCustomerEmail(null), null);
});

test('finds the most recent exact-match customer', async () => {
  const expectedCustomer = {
    id: 'cus_existing',
    email: 'customer@example.com'
  };
  const stripe = {
    customers: {
      list: async (parameters) => {
        assert.deepEqual(parameters, {
          email: 'customer@example.com',
          limit: 1
        });
        return { data: [expectedCustomer] };
      }
    }
  };

  const customer = await findCustomerByEmail(
    stripe,
    'customer@example.com'
  );

  assert.equal(customer, expectedCustomer);
});

test('reuses an existing customer instead of creating another', async () => {
  let createCalled = false;
  const expectedCustomer = { id: 'cus_existing' };
  const stripe = {
    customers: {
      list: async () => ({ data: [expectedCustomer] }),
      create: async () => {
        createCalled = true;
      }
    }
  };

  const customer = await findOrCreateCustomer(
    stripe,
    'customer@example.com'
  );

  assert.equal(customer, expectedCustomer);
  assert.equal(createCalled, false);
});

test('creates a customer idempotently when no customer exists', async () => {
  const stripe = {
    customers: {
      list: async () => ({ data: [] }),
      create: async (parameters, options) => {
        assert.deepEqual(parameters, {
          email: 'customer@example.com',
          metadata: {
            source: 'stripe_press_checkout'
          }
        });
        assert.match(options.idempotencyKey, /^customer_email_[0-9a-f]{64}$/);
        return {
          id: 'cus_new',
          email: parameters.email
        };
      }
    }
  };

  const customer = await findOrCreateCustomer(
    stripe,
    'customer@example.com'
  );

  assert.equal(customer.id, 'cus_new');
});

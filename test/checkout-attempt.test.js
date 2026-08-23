const test = require('node:test');
const assert = require('node:assert/strict');
const CheckoutAttemptManager = require('../public/js/checkout-attempt');

function createStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

test('reuses a checkout token when the cart is unchanged', () => {
  const storage = createStorage();
  const cryptoProvider = {
    randomUUID() {
      return '123e4567-e89b-42d3-a456-426614174000';
    }
  };
  const manager = new CheckoutAttemptManager(storage, cryptoProvider);
  const first = manager.getOrCreate([{ bookId: '1', quantity: 2 }]);
  const second = manager.getOrCreate([{ bookId: '1', quantity: 2 }]);

  assert.equal(first, second);
});

test('creates a new checkout token when the cart changes', () => {
  const storage = createStorage();
  const tokens = [
    '123e4567-e89b-42d3-a456-426614174000',
    '223e4567-e89b-42d3-a456-426614174000'
  ];
  const cryptoProvider = {
    randomUUID() {
      return tokens.shift();
    }
  };
  const manager = new CheckoutAttemptManager(storage, cryptoProvider);
  const first = manager.getOrCreate([{ bookId: '1', quantity: 1 }]);
  const second = manager.getOrCreate([{ bookId: '1', quantity: 2 }]);

  assert.notEqual(first, second);
});

test('clears a completed checkout attempt', () => {
  const storage = createStorage();
  const manager = new CheckoutAttemptManager(storage, {
    randomUUID() {
      return '123e4567-e89b-42d3-a456-426614174000';
    }
  });

  manager.getOrCreate([{ bookId: '1', quantity: 1 }]);
  manager.clear();

  assert.equal(storage.getItem('stripePressCheckoutAttempt'), null);
});

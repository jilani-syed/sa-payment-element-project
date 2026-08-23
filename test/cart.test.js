const test = require('node:test');
const assert = require('node:assert/strict');
const Cart = require('../public/js/cart');

function createStorage(initialValue) {
  let value = initialValue || null;

  return {
    getItem() {
      return value;
    },
    setItem(key, nextValue) {
      value = nextValue;
    }
  };
}

test('starts with an empty cart', () => {
  const cart = new Cart(createStorage());

  assert.deepEqual(cart.getItems(), []);
  assert.equal(cart.getItemCount(), 0);
});

test('adds books and increments their quantities', () => {
  const cart = new Cart(createStorage());

  cart.add('1');
  cart.add('1', 2);
  cart.add('2');

  assert.deepEqual(cart.getItems(), [
    { bookId: '1', quantity: 3 },
    { bookId: '2', quantity: 1 }
  ]);
  assert.equal(cart.getItemCount(), 4);
});

test('caps a book at the maximum quantity', () => {
  const cart = new Cart(createStorage());

  cart.add('1', 8);
  const quantity = cart.add('1', 5);

  assert.equal(quantity, 10);
  assert.equal(cart.getQuantity('1'), 10);
});

test('updates and removes a cart line', () => {
  const cart = new Cart(createStorage());

  cart.add('3');
  cart.setQuantity('3', 4);
  assert.equal(cart.getQuantity('3'), 4);

  cart.remove('3');
  assert.deepEqual(cart.getItems(), []);
});

test('ignores invalid persisted quantities', () => {
  const storage = createStorage(JSON.stringify({
    version: 1,
    items: {
      '1': 2,
      '2': 0,
      '3': 99
    }
  }));
  const cart = new Cart(storage);

  assert.deepEqual(cart.getItems(), [
    { bookId: '1', quantity: 2 }
  ]);
});

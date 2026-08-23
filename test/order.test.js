const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrder } = require('../lib/order');

test('calculates line totals and the authoritative order amount', () => {
  const order = buildOrder([
    { bookId: '1', quantity: 2 },
    { bookId: '3', quantity: 1 }
  ]);

  assert.equal(order.itemCount, 3);
  assert.equal(order.amount, 7400);
  assert.equal(order.currency, 'usd');
  assert.equal(order.lineItems[0].lineTotal, 4600);
  assert.equal(order.lineItems[1].lineTotal, 2800);
});

test('rejects an empty cart', () => {
  assert.throws(() => buildOrder([]), /cart is empty/i);
});

test('rejects unknown books instead of accepting client prices', () => {
  assert.throws(
    () => buildOrder([{ bookId: '999', quantity: 1, amount: 1 }]),
    /invalid book/i
  );
});

test('rejects invalid quantities', () => {
  assert.throws(
    () => buildOrder([{ bookId: '1', quantity: 11 }]),
    /between 1 and 10/i
  );
});

test('rejects duplicate book entries', () => {
  assert.throws(
    () => buildOrder([
      { bookId: '2', quantity: 1 },
      { bookId: '2', quantity: 1 }
    ]),
    /duplicate book/i
  );
});

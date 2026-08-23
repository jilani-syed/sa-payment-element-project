'use strict';

const { getBook } = require('./catalog');

const MAX_QUANTITY = 10;

function buildOrder(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Your cart is empty.');
  }

  const seenBookIds = new Set();
  const lineItems = cartItems.map((cartItem) => {
    const book = getBook(cartItem && cartItem.bookId);
    const quantity = Number(cartItem && cartItem.quantity);

    if (!book) {
      throw new Error('Your cart contains an invalid book.');
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new Error(`Book quantity must be between 1 and ${MAX_QUANTITY}.`);
    }

    if (seenBookIds.has(book.id)) {
      throw new Error('Your cart contains a duplicate book entry.');
    }

    seenBookIds.add(book.id);

    return {
      book,
      quantity,
      lineTotal: book.amount * quantity
    };
  });

  return {
    lineItems,
    itemCount: lineItems.reduce((total, lineItem) => total + lineItem.quantity, 0),
    amount: lineItems.reduce((total, lineItem) => total + lineItem.lineTotal, 0),
    currency: 'usd'
  };
}

module.exports = {
  buildOrder
};

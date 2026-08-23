'use strict';

const crypto = require('crypto');

const CHECKOUT_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateCheckoutToken(checkoutToken) {
  return typeof checkoutToken === 'string' &&
    CHECKOUT_TOKEN_PATTERN.test(checkoutToken);
}

function createCartHash(order) {
  const normalizedLines = order.lineItems
    .map((lineItem) => ({
      bookId: lineItem.book.id,
      quantity: lineItem.quantity,
      unitAmount: lineItem.book.amount
    }))
    .sort((left, right) => left.bookId.localeCompare(right.bookId));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizedLines))
    .digest('hex');
}

function createOrderRecord(checkoutToken, cartHash, order) {
  const timestamp = new Date().toISOString();

  return {
    id: `ord_${crypto.randomUUID()}`,
    checkoutToken,
    cartHash,
    lineItems: order.lineItems.map((lineItem) => ({
      bookId: lineItem.book.id,
      title: lineItem.book.title,
      quantity: lineItem.quantity,
      unitAmount: lineItem.book.amount,
      lineTotal: lineItem.lineTotal
    })),
    itemCount: order.itemCount,
    amount: order.amount,
    currency: order.currency,
    paymentIntentId: null,
    paymentStatus: 'not_started',
    fulfillmentStatus: 'unfulfilled',
    processedEventIds: [],
    lastStripeEventCreated: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

module.exports = {
  createCartHash,
  createOrderRecord,
  validateCheckoutToken
};

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatCurrency,
  getPaymentStatusPresentation
} = require('../lib/payment-status');

test('formats Stripe minor units as currency', () => {
  assert.equal(formatCurrency(7400, 'usd'), '$74.00');
});

test('presents a successful PaymentIntent as confirmed', () => {
  const presentation = getPaymentStatusPresentation('succeeded');

  assert.equal(presentation.heading, 'Payment successful');
  assert.equal(presentation.httpStatus, 200);
});

test('presents a processing PaymentIntent without claiming success', () => {
  const presentation = getPaymentStatusPresentation('processing');

  assert.equal(presentation.heading, 'Payment processing');
  assert.equal(presentation.httpStatus, 202);
});

test('presents a PaymentIntent requiring a new payment method as unsuccessful', () => {
  const presentation = getPaymentStatusPresentation('requires_payment_method');

  assert.equal(presentation.heading, 'Payment unsuccessful');
  assert.equal(presentation.httpStatus, 402);
});

'use strict';

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase()
  }).format(Number(amount || 0) / 100);
}

function getPaymentStatusPresentation(status) {
  switch (status) {
    case 'succeeded':
      return {
        heading: 'Payment successful',
        message: 'Thank you. Your Stripe Press order has been confirmed.',
        headingClass: 'text-success',
        httpStatus: 200
      };
    case 'processing':
      return {
        heading: 'Payment processing',
        message: 'Your payment is still processing. Please check again shortly.',
        headingClass: 'text-info',
        httpStatus: 202
      };
    case 'requires_payment_method':
      return {
        heading: 'Payment unsuccessful',
        message: 'Your payment was not completed. Please return to checkout and try another payment method.',
        headingClass: 'text-danger',
        httpStatus: 402
      };
    default:
      return {
        heading: 'Payment not completed',
        message: 'Your payment requires another step or was not completed.',
        headingClass: 'text-warning',
        httpStatus: 202
      };
  }
}

module.exports = {
  formatCurrency,
  getPaymentStatusPresentation
};

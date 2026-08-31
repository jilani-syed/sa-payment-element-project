'use strict';

const crypto = require('crypto');

function normalizeCustomerEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email.length === 0 || email.length > 254 || !emailPattern.test(email)) {
    return null;
  }

  return email;
}

async function findCustomerByEmail(stripe, email) {
  const customers = await stripe.customers.list({
    email,
    limit: 1
  });

  return customers.data[0] || null;
}

async function findOrCreateCustomer(stripe, email) {
  const existingCustomer = await findCustomerByEmail(stripe, email);

  if (existingCustomer) {
    return existingCustomer;
  }

  const emailHash = crypto
    .createHash('sha256')
    .update(email)
    .digest('hex');

  return stripe.customers.create(
    {
      email,
      metadata: {
        source: 'stripe_press_checkout'
      }
    },
    {
      idempotencyKey: `customer_email_${emailHash}`
    }
  );
}

module.exports = {
  findCustomerByEmail,
  findOrCreateCustomer,
  normalizeCustomerEmail
};

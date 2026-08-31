# Run the sample eCommerce bookstore locally

This guide gets the application running from a downloaded ZIP. For the architecture, Stripe API usage, security decisions, and extension ideas, see [README.md](README.md).

## What you need

- Node.js 18 or later with npm
- A Stripe account in test mode
- Stripe test API keys from the Stripe Dashboard
- The Stripe CLI for local webhook forwarding

The application runs directly in Node.js. There is no compilation or separate frontend build step.

## 1. Download and extract the project

If you downloaded the project from GitHub, select **Code**, then **Download ZIP**. Extract the archive and open a terminal in the extracted project directory.

For the packaged archive:

```bash
unzip stripe-press-cart-payment-element-local.zip
cd stripe-press-cart-payment-element
```

## 2. Install dependencies

```bash
npm ci
```

`npm ci` installs the exact dependency versions recorded in `package-lock.json`.

## 3. Configure test-mode credentials

Create a local environment file:

```bash
cp sample.env .env
```

Edit `.env` and set your own Stripe test keys:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ORDER_STORE_PATH=data/orders.json
NODE_ENV=development
TRUST_PROXY=0
PORT=3000
```

Never commit `.env` or use live-mode keys for this local test.

## 4. Start webhook forwarding

Authenticate the Stripe CLI if needed:

```bash
stripe login
```

Start the listener in its own terminal:

```bash
stripe listen --forward-to localhost:3000/webhook
```

The CLI prints a webhook signing secret beginning with `whsec_`. Copy that value into `STRIPE_WEBHOOK_SECRET` in `.env`. Keep the listener running.

The forwarding port must match the application port. The default application port is `3000`, not `4242`.

## 5. Start the application

In another terminal, from the project directory:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Confirm the health endpoint separately if needed:

```bash
curl http://localhost:3000/health
```

## 6. Complete a test payment

1. Add one or more books to the cart.
2. Change a quantity and confirm the subtotal updates.
3. Proceed to checkout.
4. Enter an order email and select **Continue to payment**.
5. Wait for the Payment Element to finish loading and complete every required field.
6. Submit the payment using Stripe test data.

| Scenario | Card number |
| --- | --- |
| Successful payment | `4242 4242 4242 4242` |
| Insufficient funds | `4000 0000 0000 9995` |
| Authentication required | `4000 0025 0000 3155` |

Use any future expiration date, any three-digit CVC, and any valid postal code.

After a successful payment, confirm:

- The confirmation page shows `succeeded`.
- The charged amount matches the cart total.
- The PaymentIntent ID begins with `pi_`.
- The cart is cleared.
- The Stripe CLI reports a successful `POST /webhook` response.
- `data/orders.json` records `"paymentStatus": "succeeded"` and `"fulfillmentStatus": "ready_for_fulfillment"`.
- The Stripe PaymentIntent contains a Customer ID beginning with `cus_`.

List recent test-mode Charges for the email:

```bash
curl -G http://localhost:3000/api/charges \
  --data-urlencode "email=customer@example.com" \
  --data-urlencode "limit=10"
```

## 7. Run automated tests

```bash
npm test
```

The test suite does not require a live Stripe payment.

## Troubleshooting

### The application reports missing Stripe API keys

Confirm `.env` exists in the project root and contains both `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.

### The Payment Element stays in a loading state

Confirm the publishable and secret keys are both test-mode keys from the same Stripe account. Check the browser console and the application terminal for the underlying request error.

### The Pay button remains disabled

Complete every required Payment Element field. Card security code and postal code validation must be complete before payment submission is enabled.

### The Stripe CLI reports connection refused

The application and listener must use the same port:

```bash
stripe listen --forward-to localhost:3000/webhook
```

Also confirm `npm start` is still running.

### Payment succeeds but the order does not update

Confirm `STRIPE_WEBHOOK_SECRET` is the signing secret printed by the currently running Stripe CLI listener. Restart the application after changing `.env`, then make a new test payment.

## Local data

The sample creates `data/orders.json` automatically. It is a local, single-process demonstration store and is intentionally excluded from source control and packaged distributions. A production deployment should use a transactional database and durable fulfillment processing.

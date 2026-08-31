# Accept Payments with Stripe Payment Element

This is a sample bookstore built to demonstrate how to handle one-time payments with Stripe. A customer can add books to a cart, review the order, pay with Stripe Payment Element, and see the verified payment result.

The catalog, cart, and local order storage are intentionally simple so the Stripe payment flow is easy to follow. This is not a complete ecommerce platform or a production-ready storefront.

The sample uses the Payment Intents API directly. It does not use Stripe Checkout or Checkout Sessions.

## Run the sample locally

You need:

- Node.js 18 or later and npm
- A Stripe account in test mode
- Stripe test API keys
- [Stripe CLI](https://docs.stripe.com/stripe-cli)

Clone the repository and install its dependencies:

```bash
git clone https://github.com/jilani-syed/sa-payment-element-project.git
cd sa-payment-element-project
npm ci
```

There is no build step. The application runs directly in Node.js.

Create a local environment file:

```bash
cp sample.env .env
```

Add your Stripe test credentials:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ORDER_STORE_PATH=data/orders.json
NODE_ENV=development
TRUST_PROXY=0
PORT=3000
```

Never commit `.env`. The secret key and webhook secret must remain on the server.

In one terminal, start webhook forwarding:

```bash
stripe login
stripe listen --forward-to localhost:3000/webhook
```

The Stripe CLI prints a signing secret beginning with `whsec_`. Copy it into `STRIPE_WEBHOOK_SECRET` in `.env`.

In another terminal, start the application:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). The health endpoint is available at [http://localhost:3000/health](http://localhost:3000/health).

## Try a payment

Add one or more books to the cart and proceed to checkout.

| Scenario | Test card |
| --- | --- |
| Successful payment | `4242 4242 4242 4242` |
| Insufficient funds | `4000 0000 0000 9995` |
| Authentication required | `4000 0025 0000 3155` |

Use any future expiration date, any three-digit CVC, and any valid postal code.

After a successful payment:

- The confirmation page should show `succeeded` and a `pi_` PaymentIntent ID.
- The charged amount should match the cart total.
- The cart should be empty.
- The Stripe CLI should show a successful request to `/webhook`.
- `data/orders.json` should show `paymentStatus: "succeeded"` and `fulfillmentStatus: "ready_for_fulfillment"`.

Run the automated tests with:

```bash
npm test
```

## How the Stripe payment flow works

1. `lib/catalog.js` provides the book catalog and trusted prices.
2. The browser stores book IDs and quantities in `localStorage`. It never supplies the price used for payment.
3. The checkout page collects an order email, then sends the email, cart, and checkout token to `POST /create-payment-intent`.
4. The server validates the email and cart, calculates the total, and finds or creates the Stripe Customer.
5. The server stores the Customer ID with the order and creates one PaymentIntent with `customer: cus_...`. If the request is retried, the existing Customer and PaymentIntent are reused.
6. The browser receives the client secret and mounts Stripe Payment Element.
7. `stripe.confirmPayment()` submits the payment and handles additional authentication when required.
8. Stripe returns the customer to `/success`, where the server retrieves the PaymentIntent before displaying the result.
9. Stripe also sends PaymentIntent events to `/webhook`. After verifying the Stripe signature, the server updates the order and marks successful payments ready for fulfillment.

The success page provides immediate customer feedback. The webhook is the reliable path for updating the order for fulfillment.

## Stripe APIs used

| Stripe API or SDK | Use in this sample |
| --- | --- |
| [Stripe.js](https://docs.stripe.com/js) | Initializes Stripe in the browser with the publishable key |
| [Payment Element](https://docs.stripe.com/payments/payment-element) | Collects and validates payment details on the checkout page |
| [Create a PaymentIntent](https://docs.stripe.com/api/payment_intents/create) | Creates a payment for the server-calculated order amount |
| [Customers API](https://docs.stripe.com/api/customers) | Finds or creates the Customer associated with the order email |
| [List Charges](https://docs.stripe.com/api/charges/list) | Returns recent test-mode Charges for a Customer |
| [Retrieve a PaymentIntent](https://docs.stripe.com/api/payment_intents/retrieve) | Verifies the payment before showing the confirmation page |
| [`stripe.confirmPayment()`](https://docs.stripe.com/js/payment_intents/confirm_payment) | Confirms the payment from the browser |
| [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | Prevents retries from creating duplicate PaymentIntents |
| [Webhooks](https://docs.stripe.com/webhooks) | Receives asynchronous payment status changes |

The webhook processes:

```text
payment_intent.succeeded
payment_intent.processing
payment_intent.payment_failed
payment_intent.canceled
```

Webhook signatures are checked with `stripe.webhooks.constructEvent()` using the raw request body, the `Stripe-Signature` header, and `STRIPE_WEBHOOK_SECRET`.

## Architecture 

The application runs as one Express process with server-rendered Handlebars pages and browser JavaScript under `public/`.

| Area | Files | Responsibility |
| --- | --- | --- |
| HTTP and Stripe integration | `app.js` | Routes, PaymentIntent calls, webhook verification, and error handling |
| Catalog | `lib/catalog.js` | Book information and trusted prices |
| Order calculation | `lib/order.js` | Cart validation and server-side totals |
| Checkout handling | `lib/checkout.js` | Checkout tokens, customer-aware cart hashes, and order records |
| Customer handling | `lib/customer.js` | Email validation and Stripe Customer lookup or creation |
| Order storage | `lib/order-store.js` | Local JSON persistence and webhook deduplication |
| Cart | `public/js/cart.js`, `public/js/cart-page.js` | Browser cart and quantity changes |
| Payment form | `public/js/payment.js` | PaymentIntent request, Payment Element, and confirmation |
| Pages | `views/` | Catalog, cart, checkout, success, and error templates |
| Tests | `test/` | Cart, pricing, checkout, persistence, and payment-status tests |

The browser is treated as untrusted. The server calculates the amount from its own catalog, and payment details are collected by Stripe rather than passing through this application.

In test mode, recent Charges for an email can be requested with:

```bash
curl -G http://localhost:3000/api/charges \
  --data-urlencode "email=customer@example.com" \
  --data-urlencode "limit=10"
```

This email-based endpoint is disabled for live keys. A production application must authenticate the caller and load the stored Stripe Customer ID from the signed-in account instead of treating an email address as authorization.

Orders are stored in `data/orders.json` for local use. This keeps the sample easy to run, but it supports only one Node.js process. A production version should use a transactional database, durable fulfillment queue, managed secrets, HTTPS, and webhook monitoring.

## Troubleshooting

### `npm ci` cannot find a lockfile

Confirm `package-lock.json` is beside `package.json` in the repository root.

### The server reports missing Stripe keys

Confirm `.env` exists in the project root and contains both API keys. Restart the server after changing `.env`.

### Payment Element does not load or the Pay button stays disabled

Use test keys from the same Stripe account and complete every required payment field. Check the browser console and server terminal for the failed request.

### The Stripe CLI reports connection refused

Confirm `npm start` is running on port `3000` and forward events to `localhost:3000/webhook`.

### Payment succeeds but the order does not update

Use the `whsec_` value printed by the currently running Stripe CLI listener, restart the server, and create a new test payment.

## Stripe documentation

- [Payment Element](https://docs.stripe.com/payments/payment-element)
- [Payment Intents API](https://docs.stripe.com/payments/payment-intents)
- [Accept a payment with Payment Element](https://docs.stripe.com/payments/accept-a-payment?api-integration=paymentintents&payment-ui=elements)
- [Webhook signature verification](https://docs.stripe.com/webhooks/signature)
- [Testing Stripe integrations](https://docs.stripe.com/testing)

For a shorter setup checklist, see [LOCAL_SETUP.md](LOCAL_SETUP.md).

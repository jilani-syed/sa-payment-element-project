'use strict';

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const exphbs = require('express-handlebars');
require('dotenv').config();

const {
  createCartHash,
  createOrderRecord,
  validateCheckoutToken
} = require('./lib/checkout');
const { getBooks } = require('./lib/catalog');
const {
  findCustomerByEmail,
  findOrCreateCustomer,
  normalizeCustomerEmail
} = require('./lib/customer');
const logger = require('./lib/logger');
const { buildOrder } = require('./lib/order');
const JsonOrderStore = require('./lib/order-store');
const {
  formatCurrency,
  getPaymentStatusPresentation
} = require('./lib/payment-status');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const nodeEnvironment = process.env.NODE_ENV || 'development';
const port = Number(process.env.PORT || 3000);

if (!stripeSecretKey || !stripePublishableKey) {
  throw new Error(
    'Missing Stripe API keys. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env.'
  );
}

if (
  stripeSecretKey.startsWith('sk_live_') !==
  stripePublishableKey.startsWith('pk_live_')
) {
  throw new Error('Stripe publishable and secret keys must use the same mode.');
}

if (nodeEnvironment === 'production' && !stripeWebhookSecret) {
  throw new Error('STRIPE_WEBHOOK_SECRET is required in production.');
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port number.');
}

const stripe = require('stripe')(stripeSecretKey);
const orderStorePath = path.resolve(
  __dirname,
  process.env.ORDER_STORE_PATH || 'data/orders.json'
);
const orderStore = new JsonOrderStore(orderStorePath);
const app = express();

app.disable('x-powered-by');

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(function securityAndRequestContext(req, res, next) {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;

  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (nodeEnvironment === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  if (
    req.path === '/checkout' ||
    req.path === '/success' ||
    req.path === '/create-payment-intent'
  ) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
});

/**
 * Stripe requires the untouched raw body to verify webhook signatures. This
 * route must be registered before the JSON body parser.
 */
app.post(
  '/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async function(req, res) {
    if (!stripeWebhookSecret) {
      logger.warn('webhook_not_configured', { requestId: req.requestId });
      return res.status(503).json({ error: 'Webhook endpoint is not configured.' });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        stripeWebhookSecret
      );
    } catch (error) {
      logger.warn('webhook_signature_rejected', { requestId: req.requestId });
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    const expectedLiveMode = stripeSecretKey.startsWith('sk_live_');

    if (Boolean(event.livemode) !== expectedLiveMode) {
      logger.warn('webhook_mode_mismatch', {
        requestId: req.requestId,
        eventId: event.id
      });
      return res.status(400).json({ error: 'Webhook mode did not match API keys.' });
    }

    const supportedEvents = new Set([
      'payment_intent.succeeded',
      'payment_intent.processing',
      'payment_intent.payment_failed',
      'payment_intent.canceled'
    ]);

    if (!supportedEvents.has(event.type)) {
      return res.json({ received: true });
    }

    try {
      const paymentIntent = event.data.object;
      const result = await orderStore.applyStripeEvent({
        eventId: event.id,
        eventCreated: event.created,
        orderId: paymentIntent.metadata && paymentIntent.metadata.order_id,
        paymentIntentId: paymentIntent.id,
        paymentStatus: paymentIntent.status
      });

      logger.info('webhook_processed', {
        requestId: req.requestId,
        eventId: event.id,
        eventType: event.type,
        paymentIntentId: paymentIntent.id,
        orderId: result.order ? result.order.id : null,
        duplicate: result.duplicate,
        stale: result.stale,
        orderFound: result.found
      });

      return res.json({ received: true });
    } catch (error) {
      logger.error('webhook_processing_failed', {
        requestId: req.requestId,
        eventId: event.id,
        errorType: error.name
      });
      return res.status(500).json({ error: 'Webhook processing failed.' });
    }
  }
);

app.engine('hbs', exphbs({
  defaultLayout: 'main',
  extname: '.hbs'
}));
app.set('view engine', 'hbs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));
app.use(express.json({ limit: '20kb', strict: true }));

app.get('/health', function(req, res) {
  res.json({ status: 'ok' });
});

app.get('/', function(req, res) {
  res.render('index', {
    books: getBooks()
  });
});

app.get('/api/books', function(req, res) {
  res.json({
    books: getBooks()
  });
});

/**
 * List recent Charges for the Stripe Customer identified by email.
 * This sample endpoint is restricted to test mode because an email address
 * identifies a customer but does not authenticate the person making the call.
 */
app.get('/api/charges', async function(req, res) {
  if (!stripeSecretKey.startsWith('sk_test_')) {
    return res.status(403).json({
      error: 'Charge lookup by email is disabled in live mode.'
    });
  }

  const email = normalizeCustomerEmail(req.query.email);
  const limit = Number(req.query.limit || 10);

  if (!email) {
    return res.status(400).json({
      error: 'A valid customer email is required.'
    });
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({
      error: 'Limit must be an integer between 1 and 100.'
    });
  }

  try {
    const customer = await findCustomerByEmail(stripe, email);

    if (!customer) {
      return res.json({
        customerId: null,
        charges: [],
        hasMore: false
      });
    }

    const charges = await stripe.charges.list({
      customer: customer.id,
      limit
    });

    return res.json({
      customerId: customer.id,
      charges: charges.data.map((charge) => ({
        id: charge.id,
        paymentIntentId: typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent && charge.payment_intent.id,
        amount: charge.amount,
        amountCaptured: charge.amount_captured,
        amountRefunded: charge.amount_refunded,
        currency: charge.currency,
        status: charge.status,
        paid: charge.paid,
        refunded: charge.refunded,
        disputed: charge.disputed,
        created: charge.created
      })),
      hasMore: charges.has_more
    });
  } catch (error) {
    logger.error('customer_charge_lookup_failed', {
      requestId: req.requestId,
      errorType: error.type || error.name
    });
    return res.status(500).json({
      error: 'Unable to retrieve customer charges.'
    });
  }
});

app.get('/cart', function(req, res) {
  res.render('cart');
});

app.get('/checkout', function(req, res) {
  res.render('checkout', {
    stripePublishableKey
  });
});

/**
 * Create or reuse one PaymentIntent for a validated checkout attempt.
 */
app.post('/create-payment-intent', async function(req, res) {
  const checkoutToken = req.body && req.body.checkoutToken;
  const customerEmail = normalizeCustomerEmail(
    req.body && req.body.email
  );

  if (!validateCheckoutToken(checkoutToken)) {
    return res.status(400).json({
      code: 'invalid_checkout_token',
      error: 'A valid checkout token is required.'
    });
  }

  if (!customerEmail) {
    return res.status(400).json({
      code: 'invalid_customer_email',
      error: 'A valid customer email is required.'
    });
  }

  let order;

  try {
    order = buildOrder(req.body.items);
  } catch (error) {
    return res.status(400).json({
      code: 'invalid_cart',
      error: error.message
    });
  }

  try {
    const customer = await findOrCreateCustomer(stripe, customerEmail);
    const cartHash = createCartHash(order, customer.id);
    const requestedOrder = createOrderRecord(
      checkoutToken,
      cartHash,
      order,
      customer.id
    );
    const storedResult = await orderStore.createOrGet(requestedOrder);

    if (storedResult.conflict) {
      return res.status(409).json({
        code: 'cart_changed',
        error: 'The cart changed during checkout. Refresh and try again.'
      });
    }

    const storedOrder = storedResult.order;
    let paymentIntent;

    if (storedOrder.paymentIntentId) {
      paymentIntent = await stripe.paymentIntents.retrieve(
        storedOrder.paymentIntentId
      );
    } else {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: storedOrder.amount,
          currency: storedOrder.currency,
          customer: storedOrder.customerId,
          automatic_payment_methods: {
            enabled: true
          },
          description: `Stripe Press order (${storedOrder.itemCount} books)`,
          metadata: {
            order_id: storedOrder.id,
            book_ids: storedOrder.lineItems
              .map((lineItem) => lineItem.bookId)
              .join(','),
            item_count: String(storedOrder.itemCount)
          }
        },
        {
          idempotencyKey: `payment_intent_${storedOrder.id}`
        }
      );

      await orderStore.attachPaymentIntent(storedOrder.id, paymentIntent);
    }

    const paymentIntentCustomerId = typeof paymentIntent.customer === 'string'
      ? paymentIntent.customer
      : paymentIntent.customer && paymentIntent.customer.id;

    if (paymentIntentCustomerId !== storedOrder.customerId) {
      logger.error('payment_intent_customer_mismatch', {
        requestId: req.requestId,
        orderId: storedOrder.id,
        paymentIntentId: paymentIntent.id
      });
      return res.status(409).json({
        code: 'payment_customer_mismatch',
        error: 'The payment no longer matches this customer.'
      });
    }

    if (
      paymentIntent.amount !== storedOrder.amount ||
      paymentIntent.currency !== storedOrder.currency
    ) {
      logger.error('payment_intent_order_mismatch', {
        requestId: req.requestId,
        orderId: storedOrder.id,
        paymentIntentId: paymentIntent.id
      });
      return res.status(409).json({
        code: 'payment_amount_mismatch',
        error: 'The payment no longer matches this order.'
      });
    }

    if (paymentIntent.status === 'canceled') {
      return res.status(409).json({
        code: 'payment_intent_canceled',
        error: 'This checkout attempt expired. Refresh and try again.'
      });
    }

    logger.info('payment_intent_ready', {
      requestId: req.requestId,
      orderId: storedOrder.id,
      paymentIntentId: paymentIntent.id,
      reused: Boolean(storedOrder.paymentIntentId)
    });

    if (paymentIntent.status === 'succeeded') {
      return res.json({
        completed: true,
        redirectUrl: `/success?payment_intent=${encodeURIComponent(paymentIntent.id)}&payment_intent_client_secret=${encodeURIComponent(paymentIntent.client_secret)}`
      });
    }

    return res.json({
      completed: false,
      clientSecret: paymentIntent.client_secret,
      amount: storedOrder.amount,
      currency: storedOrder.currency,
      orderId: storedOrder.id,
      customerId: storedOrder.customerId
    });
  } catch (error) {
    logger.error('payment_intent_initialization_failed', {
      requestId: req.requestId,
      errorType: error.type || error.name
    });
    return res.status(500).json({
      code: 'payment_initialization_failed',
      error: 'Unable to initialize payment. Please try again.'
    });
  }
});

/**
 * Retrieve the PaymentIntent and render its authoritative customer-facing status.
 * Fulfillment remains webhook-driven.
 */
app.get('/success', async function(req, res) {
  const paymentIntentId = typeof req.query.payment_intent === 'string'
    ? req.query.payment_intent
    : '';
  const paymentIntentClientSecret =
    typeof req.query.payment_intent_client_secret === 'string'
      ? req.query.payment_intent_client_secret
      : '';

  if (
    !paymentIntentId.startsWith('pi_') ||
    !paymentIntentClientSecret.startsWith(`${paymentIntentId}_secret_`)
  ) {
    return res.status(400).render('success', {
      heading: 'Payment status unavailable',
      message: 'A valid PaymentIntent ID was not provided.',
      headingClass: 'text-danger',
      showDetails: false,
      isSucceeded: false
    });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.client_secret !== paymentIntentClientSecret) {
      throw new Error('PaymentIntent client secret did not match.');
    }

    const storedOrder = await orderStore.findByPaymentIntentId(paymentIntent.id);
    const presentation = getPaymentStatusPresentation(paymentIntent.status);
    const displayedAmount = paymentIntent.status === 'succeeded'
      ? paymentIntent.amount_received
      : paymentIntent.amount;

    return res.status(presentation.httpStatus).render('success', {
      ...presentation,
      showDetails: true,
      isSucceeded: paymentIntent.status === 'succeeded',
      paymentIntentId: paymentIntent.id,
      orderId: storedOrder ? storedOrder.id : null,
      amount: formatCurrency(displayedAmount, paymentIntent.currency),
      status: paymentIntent.status
    });
  } catch (error) {
    logger.warn('payment_status_retrieval_failed', {
      requestId: req.requestId,
      paymentIntentId
    });
    return res.status(400).render('success', {
      heading: 'Payment status unavailable',
      message: 'We could not verify this payment. Please return to checkout and try again.',
      headingClass: 'text-danger',
      showDetails: false,
      isSucceeded: false
    });
  }
});

app.use(function notFoundHandler(req, res) {
  if (
    req.path.startsWith('/api/') ||
    req.path === '/create-payment-intent' ||
    req.path === '/webhook'
  ) {
    return res.status(404).json({ error: 'Not found.' });
  }

  return res.status(404).render('error', {
    heading: 'Page not found',
    message: 'The page you requested does not exist.'
  });
});

app.use(function applicationErrorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  logger.error('unhandled_application_error', {
    requestId: req.requestId,
    errorType: error.name
  });

  if (
    req.path.startsWith('/api/') ||
    req.path === '/create-payment-intent' ||
    req.path === '/webhook'
  ) {
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }

  return res.status(500).render('error', {
    heading: 'Something went wrong',
    message: 'Please try again.'
  });
});

let server;

async function startServer() {
  await orderStore.initialize();

  if (!stripeWebhookSecret) {
    logger.warn('webhook_secret_missing', {
      message: 'Webhook processing is disabled until STRIPE_WEBHOOK_SECRET is configured.'
    });
  }

  server = app.listen(port, () => {
    logger.info('server_started', {
      port,
      environment: nodeEnvironment,
      orderStorePath
    });
  });
}

function shutdown(signal) {
  logger.info('server_shutdown_started', { signal });

  if (!server) {
    process.exit(0);
  }

  server.close((error) => {
    if (error) {
      logger.error('server_shutdown_failed', { errorType: error.name });
      process.exit(1);
    }

    logger.info('server_shutdown_completed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch((error) => {
  logger.error('server_start_failed', { errorType: error.name });
  process.exit(1);
});

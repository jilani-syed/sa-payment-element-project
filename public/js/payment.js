(function() {
  'use strict';

  let stripe;
  let elements;
  let paymentElement;
  let paymentAmountLabel = 'Pay now';
  let paymentDetailsComplete = false;
  let isSubmitting = false;

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  function showMessage(message) {
    const messageElement = document.getElementById('payment-message');
    messageElement.textContent = message;
    messageElement.classList.remove('d-none');
  }

  function clearMessage() {
    const messageElement = document.getElementById('payment-message');
    messageElement.textContent = '';
    messageElement.classList.add('d-none');
  }

  function setLoading(isLoading) {
    const submitButton = document.getElementById('payment-submit');
    isSubmitting = isLoading;
    submitButton.disabled = isSubmitting || !paymentDetailsComplete;
    submitButton.textContent = isLoading ? 'Processing…' : paymentAmountLabel;
  }

  async function initializePaymentElement(email) {
    const checkout = document.getElementById('payment-checkout');
    const submitButton = document.getElementById('payment-submit');
    const loadingMessage = document.getElementById('payment-loading');
    const initializeButton = document.getElementById('payment-initialize');
    const emailInput = document.getElementById('customer-email');
    const publishableKey = checkout.dataset.publishableKey;
    const cartItems = window.stripePressCart.getItems();

    if (!publishableKey || !publishableKey.startsWith('pk_')) {
      showMessage('Stripe is not configured with a valid publishable key.');
      loadingMessage.classList.add('d-none');
      return;
    }

    if (!window.Stripe) {
      showMessage('The secure Stripe payment library could not be loaded.');
      loadingMessage.classList.add('d-none');
      return;
    }

    if (cartItems.length === 0) {
      showMessage('Your cart is empty. Add a book before starting payment.');
      loadingMessage.classList.add('d-none');
      return;
    }

    if (!window.stripePressCheckoutAttempt) {
      showMessage('A secure checkout session could not be created.');
      loadingMessage.classList.add('d-none');
      return;
    }

    try {
      const checkoutToken = window.stripePressCheckoutAttempt.getOrCreate(cartItems);
      const response = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: cartItems,
          checkoutToken,
          email
        })
      });
      const responseBody = await response.json();

      if (!response.ok) {
        if (
          responseBody.code === 'cart_changed' ||
          responseBody.code === 'payment_intent_canceled'
        ) {
          window.stripePressCheckoutAttempt.clear();
        }

        throw new Error(responseBody.error || 'Unable to initialize payment.');
      }

      if (responseBody.completed && responseBody.redirectUrl) {
        window.location.assign(responseBody.redirectUrl);
        return;
      }

      stripe = window.Stripe(publishableKey);
      elements = stripe.elements({
        clientSecret: responseBody.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#635bff',
            borderRadius: '6px',
            fontFamily: 'Roboto, sans-serif'
          }
        }
      });

      paymentElement = elements.create('payment', {
        defaultValues: {
          billingDetails: {
            email
          }
        },
        layout: {
          type: 'tabs',
          defaultCollapsed: false
        }
      });

      paymentElement.on('ready', function() {
        paymentAmountLabel = `Pay ${currencyFormatter.format(responseBody.amount / 100)}`;
        document.getElementById('customer-section').classList.add('d-none');
        loadingMessage.classList.add('d-none');
        submitButton.textContent = paymentAmountLabel;
        submitButton.disabled = isSubmitting || !paymentDetailsComplete;
      });

      paymentElement.on('change', function(event) {
        paymentDetailsComplete = Boolean(event.complete);
        submitButton.disabled = isSubmitting || !paymentDetailsComplete;
      });

      paymentElement.on('loaderror', function() {
        loadingMessage.classList.add('d-none');
        showMessage('The payment form could not be loaded. Please refresh and try again.');
      });

      paymentElement.mount('#payment-element');
    } catch (error) {
      loadingMessage.classList.add('d-none');
      initializeButton.disabled = false;
      emailInput.disabled = false;
      showMessage(error.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!stripe || !elements) {
      showMessage('The payment form is not ready yet.');
      return;
    }

    clearMessage();
    setLoading(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/success`
        }
      });

      if (error) {
        showMessage(error.message || 'An unexpected payment error occurred.');
        setLoading(false);
      }
    } catch (error) {
      showMessage('The payment could not be submitted. Please try again.');
      setLoading(false);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    const emailInput = document.getElementById('customer-email');
    const initializeButton = document.getElementById('payment-initialize');

    document.getElementById('payment-form').addEventListener('submit', handleSubmit);
    initializeButton.addEventListener('click', function() {
      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
      }

      clearMessage();
      emailInput.disabled = true;
      initializeButton.disabled = true;
      document.getElementById('payment-section').classList.remove('d-none');
      document.getElementById('payment-loading').classList.remove('d-none');
      initializePaymentElement(emailInput.value.trim());
    });
  });
})();

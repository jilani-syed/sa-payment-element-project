(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    const result = document.getElementById('payment-result');

    if (result && result.dataset.paymentSucceeded === 'true') {
      window.stripePressCart.clear();

      if (window.stripePressCheckoutAttempt) {
        window.stripePressCheckoutAttempt.clear();
      } else {
        window.sessionStorage.removeItem('stripePressCheckoutAttempt');
      }

      window.dispatchEvent(new Event('cart:updated'));
    }
  });
})();

(function(root) {
  'use strict';

  const STORAGE_KEY = 'stripePressCheckoutAttempt';
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  class CheckoutAttemptManager {
    constructor(storage, cryptoProvider) {
      if (!storage || !cryptoProvider) {
        throw new Error('Checkout attempts require storage and crypto providers.');
      }

      this.storage = storage;
      this.cryptoProvider = cryptoProvider;
    }

    getOrCreate(cartItems) {
      const fingerprint = this.createFingerprint(cartItems);
      const existing = this.read();

      if (
        existing &&
        existing.fingerprint === fingerprint &&
        UUID_PATTERN.test(existing.token)
      ) {
        return existing.token;
      }

      const token = this.createUuid();
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ token, fingerprint }));
      return token;
    }

    clear() {
      this.storage.removeItem(STORAGE_KEY);
    }

    createFingerprint(cartItems) {
      return JSON.stringify(
        cartItems
          .map((item) => ({
            bookId: String(item.bookId),
            quantity: Number(item.quantity)
          }))
          .sort((left, right) => left.bookId.localeCompare(right.bookId))
      );
    }

    createUuid() {
      if (typeof this.cryptoProvider.randomUUID === 'function') {
        return this.cryptoProvider.randomUUID();
      }

      const bytes = new Uint8Array(16);
      this.cryptoProvider.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

      return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join('')
      ].join('-');
    }

    read() {
      try {
        return JSON.parse(this.storage.getItem(STORAGE_KEY));
      } catch (error) {
        return null;
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CheckoutAttemptManager;
  }

  if (root && root.sessionStorage && root.crypto) {
    root.stripePressCheckoutAttempt = new CheckoutAttemptManager(
      root.sessionStorage,
      root.crypto
    );
  }
})(typeof window !== 'undefined' ? window : globalThis);

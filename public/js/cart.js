(function(root) {
  'use strict';

  const STORAGE_KEY = 'stripePressCart';
  const MAX_QUANTITY = 10;

  class Cart {
    constructor(storage) {
      if (!storage) {
        throw new Error('Cart requires a storage provider.');
      }

      this.storage = storage;
    }

    getItems() {
      const cart = this.read();

      return Object.entries(cart.items).map(([bookId, quantity]) => ({
        bookId,
        quantity
      }));
    }

    getQuantity(bookId) {
      const cart = this.read();
      return cart.items[String(bookId)] || 0;
    }

    getItemCount() {
      return this.getItems().reduce((total, item) => total + item.quantity, 0);
    }

    add(bookId, quantity = 1) {
      const normalizedBookId = this.normalizeBookId(bookId);
      const normalizedQuantity = this.normalizeQuantity(quantity);
      const cart = this.read();
      const currentQuantity = cart.items[normalizedBookId] || 0;

      cart.items[normalizedBookId] = Math.min(
        currentQuantity + normalizedQuantity,
        MAX_QUANTITY
      );

      this.write(cart);
      return cart.items[normalizedBookId];
    }

    setQuantity(bookId, quantity) {
      const normalizedBookId = this.normalizeBookId(bookId);
      const numericQuantity = Number(quantity);

      if (numericQuantity === 0) {
        this.remove(normalizedBookId);
        return 0;
      }

      const normalizedQuantity = this.normalizeQuantity(numericQuantity);
      const cart = this.read();
      cart.items[normalizedBookId] = normalizedQuantity;
      this.write(cart);
      return normalizedQuantity;
    }

    remove(bookId) {
      const cart = this.read();
      delete cart.items[String(bookId)];
      this.write(cart);
    }

    clear() {
      this.write({ version: 1, items: {} });
    }

    read() {
      try {
        const storedCart = JSON.parse(this.storage.getItem(STORAGE_KEY));
        const items = {};

        if (storedCart && storedCart.items && typeof storedCart.items === 'object') {
          Object.entries(storedCart.items).forEach(([bookId, quantity]) => {
            const numericQuantity = Number(quantity);

            if (
              bookId &&
              Number.isInteger(numericQuantity) &&
              numericQuantity >= 1 &&
              numericQuantity <= MAX_QUANTITY
            ) {
              items[bookId] = numericQuantity;
            }
          });
        }

        return { version: 1, items };
      } catch (error) {
        return { version: 1, items: {} };
      }
    }

    write(cart) {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(cart));
    }

    normalizeBookId(bookId) {
      const normalizedBookId = String(bookId || '').trim();

      if (!normalizedBookId) {
        throw new Error('A book ID is required.');
      }

      return normalizedBookId;
    }

    normalizeQuantity(quantity) {
      const numericQuantity = Number(quantity);

      if (
        !Number.isInteger(numericQuantity) ||
        numericQuantity < 1 ||
        numericQuantity > MAX_QUANTITY
      ) {
        throw new Error(`Quantity must be between 1 and ${MAX_QUANTITY}.`);
      }

      return numericQuantity;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Cart;
  }

  if (!root || !root.localStorage) {
    return;
  }

  const cart = new Cart(root.localStorage);
  root.stripePressCart = cart;

  function updateCartCount() {
    const count = cart.getItemCount();
    const badge = document.getElementById('cart-count');

    if (badge) {
      badge.textContent = String(count);
      badge.setAttribute('aria-label', `${count} items in cart`);
    }
  }

  function announce(message) {
    const announcement = document.getElementById('cart-announcement');
    if (announcement) {
      announcement.textContent = message;
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    updateCartCount();

    document.querySelectorAll('[data-add-to-cart]').forEach((button) => {
      button.addEventListener('click', function() {
        const quantity = cart.add(button.dataset.bookId);
        const bookTitle = button.dataset.bookTitle || 'Book';
        const originalMarkup = button.innerHTML;

        updateCartCount();
        announce(`${bookTitle} added to cart. Quantity ${quantity}.`);

        button.disabled = true;
        button.textContent = quantity === MAX_QUANTITY
          ? 'Maximum quantity in cart'
          : 'Added to cart';

        root.setTimeout(function() {
          button.disabled = false;
          button.innerHTML = originalMarkup;
        }, 900);
      });
    });
  });

  root.addEventListener('storage', updateCartCount);
  root.addEventListener('cart:updated', updateCartCount);
})(typeof window !== 'undefined' ? window : globalThis);

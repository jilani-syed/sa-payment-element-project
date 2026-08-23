(function() {
  'use strict';

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  function showError(message) {
    const error = document.getElementById('checkout-error');
    error.textContent = message;
    error.classList.remove('d-none');
  }

  async function renderCheckoutSummary() {
    const cartItems = window.stripePressCart.getItems();

    if (cartItems.length === 0) {
      showError('Your cart is empty. Return to the book catalog to add an item.');
      return;
    }

    try {
      const response = await fetch('/api/books');
      if (!response.ok) {
        throw new Error('Unable to load the current catalog.');
      }

      const { books } = await response.json();
      const booksById = new Map(books.map((book) => [book.id, book]));
      const itemsContainer = document.getElementById('checkout-items');
      let total = 0;

      cartItems.forEach((cartItem) => {
        const book = booksById.get(cartItem.bookId);
        if (!book) {
          return;
        }

        const lineTotal = book.amount * cartItem.quantity;
        const row = document.createElement('div');
        const description = document.createElement('span');
        const amount = document.createElement('strong');

        row.className = 'list-group-item d-flex justify-content-between align-items-center';
        description.textContent = `${book.title} × ${cartItem.quantity}`;
        amount.textContent = currencyFormatter.format(lineTotal / 100);
        row.append(description, amount);
        itemsContainer.appendChild(row);
        total += lineTotal;
      });

      if (total === 0) {
        showError('Your cart does not contain any available books.');
        return;
      }

      document.getElementById('checkout-total').textContent =
        currencyFormatter.format(total / 100);
    } catch (error) {
      showError(error.message);
    }
  }

  document.addEventListener('DOMContentLoaded', renderCheckoutSummary);
})();

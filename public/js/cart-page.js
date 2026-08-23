(function() {
  'use strict';

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  function formatAmount(amount) {
    return currencyFormatter.format(amount / 100);
  }

  function createQuantitySelect(book, quantity) {
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    const select = document.createElement('select');

    wrapper.className = 'cart-quantity';
    label.className = 'mb-1';
    label.htmlFor = `quantity-${book.id}`;
    label.textContent = 'Quantity';

    select.id = `quantity-${book.id}`;
    select.className = 'form-control form-control-sm';
    select.setAttribute('aria-label', `Quantity for ${book.title}`);

    for (let value = 1; value <= 10; value += 1) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      option.selected = value === quantity;
      select.appendChild(option);
    }

    select.addEventListener('change', function() {
      window.stripePressCart.setQuantity(book.id, Number(select.value));
      setStatus(`${book.title} quantity updated to ${select.value}.`);
      renderCart();
    });

    wrapper.append(label, select);
    return wrapper;
  }

  function createCartItem(book, quantity) {
    const article = document.createElement('article');
    const image = document.createElement('img');
    const details = document.createElement('div');
    const title = document.createElement('h3');
    const author = document.createElement('p');
    const unitPrice = document.createElement('p');
    const actions = document.createElement('div');
    const removeButton = document.createElement('button');
    const lineTotal = document.createElement('strong');

    article.className = 'card box-shadow cart-line-item mb-3';
    image.src = book.image;
    image.alt = `Cover of ${book.title}`;
    image.className = 'cart-item-image';

    details.className = 'cart-item-details';
    title.className = 'h5 mb-1';
    title.textContent = book.title;
    author.className = 'text-secondary mb-2';
    author.textContent = book.author;
    unitPrice.className = 'small mb-0';
    unitPrice.textContent = `${formatAmount(book.amount)} each`;
    details.append(title, author, unitPrice);

    actions.className = 'cart-item-actions';
    removeButton.type = 'button';
    removeButton.className = 'btn btn-link text-danger px-0 mt-2';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', `Remove ${book.title} from cart`);
    removeButton.addEventListener('click', function() {
      window.stripePressCart.remove(book.id);
      setStatus(`${book.title} removed from cart.`);
      renderCart();
    });

    actions.append(createQuantitySelect(book, quantity), removeButton);

    lineTotal.className = 'cart-line-total';
    lineTotal.textContent = formatAmount(book.amount * quantity);
    lineTotal.setAttribute('aria-label', `Line total ${lineTotal.textContent}`);

    article.append(image, details, actions, lineTotal);
    return article;
  }

  function setStatus(message) {
    const status = document.getElementById('cart-page-status');
    if (status) {
      status.textContent = message;
    }
  }

  function showError(message) {
    const error = document.getElementById('cart-error');
    error.textContent = message;
    error.classList.remove('d-none');
  }

  async function renderCart() {
    const itemsContainer = document.getElementById('cart-items');
    const emptyState = document.getElementById('empty-cart');
    const cartContent = document.getElementById('cart-content');
    const error = document.getElementById('cart-error');
    const cartItems = window.stripePressCart.getItems();

    window.dispatchEvent(new Event('cart:updated'));
    itemsContainer.replaceChildren();
    error.classList.add('d-none');
    error.textContent = '';

    if (cartItems.length === 0) {
      emptyState.classList.remove('d-none');
      cartContent.classList.add('d-none');
      return;
    }

    try {
      const response = await fetch('/api/books');
      if (!response.ok) {
        throw new Error('Unable to load the current catalog.');
      }

      const { books } = await response.json();
      const booksById = new Map(books.map((book) => [book.id, book]));
      const availableItems = [];
      let removedUnavailableItem = false;

      cartItems.forEach((cartItem) => {
        const book = booksById.get(cartItem.bookId);

        if (!book) {
          window.stripePressCart.remove(cartItem.bookId);
          removedUnavailableItem = true;
          return;
        }

        availableItems.push({ book, quantity: cartItem.quantity });
      });

      if (removedUnavailableItem) {
        showError('An unavailable item was removed from your cart.');
        window.dispatchEvent(new Event('cart:updated'));
      }

      if (availableItems.length === 0) {
        emptyState.classList.remove('d-none');
        cartContent.classList.add('d-none');
        return;
      }

      const itemCount = availableItems.reduce(
        (total, item) => total + item.quantity,
        0
      );
      const subtotal = availableItems.reduce(
        (total, item) => total + (item.book.amount * item.quantity),
        0
      );

      availableItems.forEach(({ book, quantity }) => {
        itemsContainer.appendChild(createCartItem(book, quantity));
      });

      document.getElementById('cart-summary-count').textContent = String(itemCount);
      document.getElementById('cart-subtotal').textContent = formatAmount(subtotal);
      document.getElementById('cart-total').textContent = formatAmount(subtotal);
      emptyState.classList.add('d-none');
      cartContent.classList.remove('d-none');
    } catch (error) {
      showError(error.message);
      emptyState.classList.add('d-none');
      cartContent.classList.add('d-none');
    }
  }

  document.addEventListener('DOMContentLoaded', renderCart);
})();

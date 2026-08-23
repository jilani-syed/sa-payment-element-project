'use strict';

/**
 * Server-side product catalog.
 *
 * In a production application this data would typically come from a database
 * or product service. Keeping it server-side makes it the source of truth for
 * titles, prices, and currency.
 */
const BOOKS = Object.freeze({
  '1': Object.freeze({
    id: '1',
    title: 'The Art of Doing Science and Engineering',
    author: 'Richard Hamming',
    description: 'A reminder that a childlike capacity for learning and creativity is accessible to everyone.',
    image: '/images/art-science-eng.jpg',
    amount: 2300,
    currency: 'usd'
  }),
  '2': Object.freeze({
    id: '2',
    title: 'The Making of Prince of Persia: Journals 1985-1993',
    author: 'Jordan Mechner',
    description: 'A behind-the-scenes look at the journals that documented the creation of Prince of Persia.',
    image: '/images/prince-of-persia.jpg',
    amount: 2500,
    currency: 'usd'
  }),
  '3': Object.freeze({
    id: '3',
    title: 'Working in Public: The Making and Maintenance of Open Source',
    author: 'Nadia Eghbal',
    description: 'An inside look at modern open source and the challenges faced by online creators.',
    image: '/images/working-in-public.jpg',
    amount: 2800,
    currency: 'usd'
  })
});

function getBook(bookId) {
  const normalizedBookId = String(bookId || '');

  return Object.prototype.hasOwnProperty.call(BOOKS, normalizedBookId)
    ? BOOKS[normalizedBookId]
    : null;
}

function getBooks() {
  return Object.values(BOOKS);
}

module.exports = {
  getBook,
  getBooks
};

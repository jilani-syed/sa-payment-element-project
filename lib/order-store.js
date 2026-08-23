'use strict';

const fs = require('fs/promises');
const path = require('path');

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

class JsonOrderStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await this.writeData({ version: 1, orders: [] });
    }

    await this.readData();
  }

  async createOrGet(orderRecord) {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const existing = data.orders.find(
        (order) => order.checkoutToken === orderRecord.checkoutToken
      );

      if (existing) {
        return {
          created: false,
          conflict: existing.cartHash !== orderRecord.cartHash,
          order: clone(existing)
        };
      }

      data.orders.push(orderRecord);
      await this.writeData(data);

      return {
        created: true,
        conflict: false,
        order: clone(orderRecord)
      };
    });
  }

  async attachPaymentIntent(orderId, paymentIntent) {
    return this.updateOrder(orderId, (order) => {
      if (
        order.paymentIntentId &&
        order.paymentIntentId !== paymentIntent.id
      ) {
        throw new Error('Order is already associated with another PaymentIntent.');
      }

      order.paymentIntentId = paymentIntent.id;
      order.paymentStatus = paymentIntent.status;
    });
  }

  async findByPaymentIntentId(paymentIntentId) {
    return this.runExclusive(async () => {
      const data = await this.readData();
      return clone(data.orders.find(
        (order) => order.paymentIntentId === paymentIntentId
      ) || null);
    });
  }

  async applyStripeEvent({
    eventId,
    eventCreated,
    orderId,
    paymentIntentId,
    paymentStatus
  }) {
    return this.runExclusive(async () => {
      const data = await this.readData();
      let order = data.orders.find(
        (candidate) => candidate.paymentIntentId === paymentIntentId
      );

      // Stripe can deliver an event immediately after PaymentIntent creation,
      // before the following local write completes. The immutable order ID in
      // PaymentIntent metadata lets the webhook reconcile that narrow race.
      if (!order && orderId) {
        order = data.orders.find((candidate) => candidate.id === orderId);

        if (order && !order.paymentIntentId) {
          order.paymentIntentId = paymentIntentId;
        } else if (order && order.paymentIntentId !== paymentIntentId) {
          order = null;
        }
      }

      if (!order) {
        return { found: false, duplicate: false, stale: false, order: null };
      }

      if (order.processedEventIds.includes(eventId)) {
        return {
          found: true,
          duplicate: true,
          stale: false,
          order: clone(order)
        };
      }

      const isStale = Number(eventCreated) < Number(order.lastStripeEventCreated || 0);
      const wouldDowngradeSuccess =
        order.paymentStatus === 'succeeded' && paymentStatus !== 'succeeded';

      order.processedEventIds.push(eventId);
      order.processedEventIds = order.processedEventIds.slice(-100);

      if (!isStale && !wouldDowngradeSuccess) {
        order.paymentStatus = paymentStatus;
        order.lastStripeEventCreated = Number(eventCreated);

        if (paymentStatus === 'succeeded') {
          order.fulfillmentStatus = 'ready_for_fulfillment';
          order.paidAt = new Date(Number(eventCreated) * 1000).toISOString();
        } else if (
          paymentStatus === 'canceled' ||
          paymentStatus === 'requires_payment_method'
        ) {
          order.fulfillmentStatus = 'unfulfilled';
        }
      }

      order.updatedAt = new Date().toISOString();
      await this.writeData(data);

      return {
        found: true,
        duplicate: false,
        stale: isStale || wouldDowngradeSuccess,
        order: clone(order)
      };
    });
  }

  async updateOrder(orderId, updater) {
    return this.runExclusive(async () => {
      const data = await this.readData();
      const order = data.orders.find((candidate) => candidate.id === orderId);

      if (!order) {
        throw new Error('Order was not found.');
      }

      updater(order);
      order.updatedAt = new Date().toISOString();
      await this.writeData(data);
      return clone(order);
    });
  }

  async readData() {
    const contents = await fs.readFile(this.filePath, 'utf8');
    const data = JSON.parse(contents);

    if (!data || data.version !== 1 || !Array.isArray(data.orders)) {
      throw new Error('Order store contains an invalid data structure.');
    }

    return data;
  }

  async writeData(data) {
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    await fs.rename(temporaryPath, this.filePath);
  }

  runExclusive(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

module.exports = JsonOrderStore;

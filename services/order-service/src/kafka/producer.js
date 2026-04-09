const { Kafka } = require('kafkajs');
const { logger } = require('../utils/logger');

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const producer = kafka.producer();

async function connectKafka() {
  await producer.connect();
  logger.info('Kafka producer connected');
}

// ─── Publish Event ────────────────────────────────────────────────────
// All order events go to the 'order-events' topic.
// WebSocket service consumes this and pushes to clients.

async function publishOrderEvent(eventType, payload) {
  const event = {
    eventType,
    timestamp: new Date().toISOString(),
    payload,
  };

  try {
    await producer.send({
      topic: 'order-events',
      messages: [
        {
          key: payload.orderId,        // Partition by orderId for ordering guarantees
          value: JSON.stringify(event),
        },
      ],
    });

    logger.info(`Event published: ${eventType}`, { orderId: payload.orderId });
  } catch (err) {
    logger.error('Failed to publish event', { eventType, err: err.message });
    // Don't throw — order update should not fail if Kafka is down
    // In production: use outbox pattern for guaranteed delivery
  }
}

// ─── Event Types ──────────────────────────────────────────────────────
const ORDER_EVENTS = {
  CREATED: 'ORDER_CREATED',
  STATUS_UPDATED: 'ORDER_STATUS_UPDATED',
  CANCELLED: 'ORDER_CANCELLED',
};

module.exports = { connectKafka, publishOrderEvent, ORDER_EVENTS };

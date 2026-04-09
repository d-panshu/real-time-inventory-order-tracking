const { Kafka } = require('kafkajs');
const { logger } = require('../utils/logger');

const kafka = new Kafka({
  clientId: 'inventory-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 10 },
});

const producer = kafka.producer();

async function connectKafka() {
  await producer.connect();
  logger.info('Kafka producer connected (inventory-service)');
}

async function publishInventoryEvent(eventType, payload) {
  const event = { eventType, timestamp: new Date().toISOString(), payload };
  try {
    await producer.send({
      topic: 'inventory-events',
      messages: [{ key: payload.itemId, value: JSON.stringify(event) }],
    });
    logger.info(`Inventory event published: ${eventType}`, { itemId: payload.itemId });
  } catch (err) {
    logger.error('Failed to publish inventory event', { err: err.message });
  }
}

const INVENTORY_EVENTS = {
  CREATED: 'INVENTORY_ITEM_CREATED',
  UPDATED: 'INVENTORY_ITEM_UPDATED',
  LOW_STOCK: 'INVENTORY_LOW_STOCK',
  OUT_OF_STOCK: 'INVENTORY_OUT_OF_STOCK',
};

module.exports = { connectKafka, publishInventoryEvent, INVENTORY_EVENTS };

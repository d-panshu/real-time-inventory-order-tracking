const { Kafka } = require('kafkajs');
const { logger } = require('../utils/logger');

const kafka = new Kafka({
  clientId: 'websocket-inventory-consumer',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 15 },
});

async function startInventoryEventConsumer(io) {
  const consumer = kafka.consumer({ groupId: 'websocket-inventory-group' });

  await consumer.connect();
  await consumer.subscribe({ topic: 'inventory-events', fromBeginning: false });
  logger.info('Kafka inventory consumer subscribed to: inventory-events');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        const { eventType, payload, timestamp } = event;

        const socketPayload = { eventType, timestamp, ...payload };

        switch (eventType) {
          case 'INVENTORY_ITEM_CREATED':
          case 'INVENTORY_ITEM_UPDATED':
            io.to(`inventory:${payload.itemId}`).emit('inventory:updated', socketPayload);
            io.to(`seller:${payload.sellerId}`).emit('inventory:updated', socketPayload);
            break;

          case 'INVENTORY_LOW_STOCK':
            // Alert seller immediately
            io.to(`seller:${payload.sellerId}`).emit('inventory:low_stock', {
              ...socketPayload,
              alert: `Low stock alert: ${payload.name} has only ${payload.quantity} units left`,
            });
            break;

          case 'INVENTORY_OUT_OF_STOCK':
            io.to(`seller:${payload.sellerId}`).emit('inventory:out_of_stock', {
              ...socketPayload,
              alert: `OUT OF STOCK: ${payload.name}`,
            });
            break;

          default:
            logger.warn(`Unknown inventory event: ${eventType}`);
        }
      } catch (err) {
        logger.error('Error processing inventory event', { err: err.message });
      }
    },
  });

  consumer.on(consumer.events.CRASH, async ({ payload: { error } }) => {
    logger.error('Inventory consumer crashed, restarting...', { err: error.message });
    await consumer.disconnect();
    setTimeout(() => startInventoryEventConsumer(io), 5000);
  });
}

module.exports = { startInventoryEventConsumer };

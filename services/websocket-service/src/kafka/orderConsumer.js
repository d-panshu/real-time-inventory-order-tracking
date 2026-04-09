const { Kafka } = require('kafkajs');
const { logger } = require('../utils/logger');

const kafka = new Kafka({
  clientId: 'websocket-order-consumer',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 15 },
});

// ─── Order Event Consumer ─────────────────────────────────────────────
// Reads from 'order-events' topic and pushes updates to Socket.IO rooms.
// This is the bridge between Kafka and the browser clients.

async function startOrderEventConsumer(io) {
  const consumer = kafka.consumer({ groupId: 'websocket-order-group' });

  await consumer.connect();
  await consumer.subscribe({ topic: 'order-events', fromBeginning: false });
  logger.info('Kafka order consumer subscribed to: order-events');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        const { eventType, payload, timestamp } = event;

        logger.info(`Consumed event: ${eventType}`, { orderId: payload.orderId });

        // Build the socket payload — what the frontend receives
        const socketPayload = {
          eventType,
          timestamp,
          ...payload,
        };

        switch (eventType) {
          case 'ORDER_CREATED':
            // Notify buyer + seller
            io.to(`user:${payload.buyerId}`).emit('order:created', socketPayload);
            io.to(`seller:${payload.sellerId}`).emit('order:new', socketPayload);
            break;

          case 'ORDER_STATUS_UPDATED':
            // Push to everyone subscribed to this specific order
            io.to(`order:${payload.orderId}`).emit('order:status_updated', socketPayload);
            // Also push to buyer's personal room
            io.to(`user:${payload.buyerId}`).emit('order:status_updated', socketPayload);
            // Notify seller dashboard
            io.to(`seller:${payload.sellerId}`).emit('order:status_updated', socketPayload);
            break;

          case 'ORDER_CANCELLED':
            io.to(`order:${payload.orderId}`).emit('order:cancelled', socketPayload);
            io.to(`user:${payload.buyerId}`).emit('order:cancelled', socketPayload);
            break;

          default:
            logger.warn(`Unknown order event type: ${eventType}`);
        }
      } catch (err) {
        logger.error('Error processing order event', { err: err.message, message: message.value?.toString() });
      }
    },
  });

  // Handle consumer crash → restart
  consumer.on(consumer.events.CRASH, async ({ payload: { error } }) => {
    logger.error('Order consumer crashed, restarting...', { err: error.message });
    await consumer.disconnect();
    setTimeout(() => startOrderEventConsumer(io), 5000);
  });
}

module.exports = { startOrderEventConsumer };

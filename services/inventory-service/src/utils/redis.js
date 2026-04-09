const { createClient } = require('redis');
const { logger } = require('./logger');

let redisClient;

async function connectRedis() {
  redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

  redisClient.on('error', (err) => logger.error('Redis error', err));
  redisClient.on('connect', () => logger.info('Redis connected'));

  await redisClient.connect();
  return redisClient;
}

function getRedisClient() {
  if (!redisClient) throw new Error('Redis not connected');
  return redisClient;
}

module.exports = { connectRedis, redisClient: new Proxy({}, {
  get(_, prop) { return getRedisClient()[prop]; }
}) };

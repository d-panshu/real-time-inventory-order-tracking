const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const orderRoutes = require('./routes/order.routes');
const { logger } = require('./utils/logger');
const { connectDB } = require('./utils/db');
const { connectRedis } = require('./utils/redis');
const { connectKafka } = require('./kafka/producer');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.use('/orders', orderRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service', timestamp: new Date() });
});

app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

async function bootstrap() {
  await connectDB();
  await connectRedis();
  await connectKafka();
  app.listen(PORT, () => logger.info(`Order Service running on port ${PORT}`));
}

bootstrap().catch((err) => {
  logger.error('Failed to start order service', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('Order Service shutting down...');
  process.exit(0);
});

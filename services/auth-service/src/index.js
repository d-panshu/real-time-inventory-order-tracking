const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const { logger } = require('./utils/logger');
const { connectDB } = require('./utils/db');
const { connectRedis } = require('./utils/redis');

const app = express();
const PORT = process.env.PORT || 5004;

// ─── Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Request Logger ───────────────────────────────────────────────────
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────
app.use('/auth', authRoutes);

// ─── Health Check ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date() });
});

// ─── Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────
async function bootstrap() {
  await connectDB();
  await connectRedis();
  app.listen(PORT, () => {
    logger.info(`Auth Service running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start auth service', err);
  process.exit(1);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

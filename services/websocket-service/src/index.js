const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { logger } = require('./utils/logger');
const { connectRedis, redisClient } = require('./utils/redis');
const { startOrderEventConsumer } = require('./kafka/orderConsumer');
const { startInventoryEventConsumer } = require('./kafka/inventoryConsumer');

const PORT = process.env.PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// ─── HTTP + Socket.IO Server ──────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'websocket-service' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Socket.IO Auth Middleware ────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// ─── Connection Handler ───────────────────────────────────────────────
io.on('connection', (socket) => {
  const { id: userId, role } = socket.user;
  logger.info(`Client connected: ${socket.id}`, { userId, role });

  // Track online users in Redis
  redisClient.hSet('online_users', userId, socket.id).catch(() => {});

  // ── Subscribe to an order's updates ──────────────────────────────
  // Buyers subscribe to their orders, sellers to their seller channel
  socket.on('subscribe:order', (orderId) => {
    const room = `order:${orderId}`;
    socket.join(room);
    logger.info(`Socket ${socket.id} joined room: ${room}`);
    socket.emit('subscribed', { room, message: `Subscribed to order ${orderId}` });
  });

  socket.on('unsubscribe:order', (orderId) => {
    socket.leave(`order:${orderId}`);
  });

  // ── Subscribe to seller dashboard ─────────────────────────────────
  socket.on('subscribe:seller', (sellerId) => {
    if (role === 'seller' && socket.user.id === sellerId || role === 'admin') {
      socket.join(`seller:${sellerId}`);
      socket.emit('subscribed', { room: `seller:${sellerId}` });
    }
  });

  // ── Subscribe to inventory item ────────────────────────────────────
  socket.on('subscribe:inventory', (itemId) => {
    socket.join(`inventory:${itemId}`);
    socket.emit('subscribed', { room: `inventory:${itemId}` });
  });

  // ── Auto-join user's own room ──────────────────────────────────────
  socket.join(`user:${userId}`);

  socket.on('disconnect', () => {
    redisClient.hDel('online_users', userId).catch(() => {});
    logger.info(`Client disconnected: ${socket.id}`, { userId });
  });

  socket.on('error', (err) => {
    logger.error(`Socket error for ${socket.id}`, { err: err.message });
  });
});

// ─── Expose io to consumers ───────────────────────────────────────────
module.exports.io = io;

// ─── Bootstrap ────────────────────────────────────────────────────────
async function bootstrap() {
  await connectRedis();

  // Start Kafka consumers — they will push events to Socket.IO rooms
  await startOrderEventConsumer(io);
  await startInventoryEventConsumer(io);

  server.listen(PORT, () => {
    logger.info(`WebSocket Service running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start websocket service', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('WebSocket Service shutting down...');
  io.close();
  server.close(() => process.exit(0));
});

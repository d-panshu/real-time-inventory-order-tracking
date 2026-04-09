const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');
const { logger } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// ─── Service URLs ─────────────────────────────────────────────────────
const SERVICES = {
  auth:      process.env.AUTH_SERVICE_URL      || 'http://localhost:5004',
  orders:    process.env.ORDER_SERVICE_URL     || 'http://localhost:5001',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:5003',
};

// ─── Security Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(express.json());

// ─── Request Logging ──────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Rate Limiting ────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// Tighter limit on auth routes to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
});

app.use(globalLimiter);

// ─── JWT Auth Middleware ──────────────────────────────────────────────
// Validates token and attaches user info to forwarded headers.
// Auth routes are excluded from this check.

const PUBLIC_ROUTES = [
  { path: '/api/auth/register', method: 'POST' },
  { path: '/api/auth/login',    method: 'POST' },
  { path: '/health',            method: 'GET' },
];

function authMiddleware(req, res, next) {
  const isPublic = PUBLIC_ROUTES.some(
    (r) => req.path === r.path && req.method === r.method
  );
  if (isPublic) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Forward user info to downstream services via headers
    req.headers['x-user-id']   = decoded.id;
    req.headers['x-user-email'] = decoded.email;
    req.headers['x-user-role']  = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

app.use(authMiddleware);

// ─── Proxy Options Factory ────────────────────────────────────────────
function proxyOptions(target, pathRewrite) {
  return {
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, req, res) => {
        logger.error(`Proxy error → ${target}`, { err: err.message });
        res.status(502).json({ success: false, message: 'Service temporarily unavailable' });
      },
      proxyReq: (proxyReq, req) => {
        logger.info(`→ Proxying ${req.method} ${req.path} to ${target}`);
      },
    },
  };
}

// ─── Routes ───────────────────────────────────────────────────────────

// Auth Service (public + protected)
app.use('/api/auth', authLimiter, createProxyMiddleware(
  proxyOptions(SERVICES.auth, { '^/api/auth': '/auth' })
));

// Order Service (protected)
app.use('/api/orders', createProxyMiddleware(
  proxyOptions(SERVICES.orders, { '^/api/orders': '/orders' })
));

// Inventory Service (protected)
app.use('/api/inventory', createProxyMiddleware(
  proxyOptions(SERVICES.inventory, { '^/api/inventory': '/inventory' })
));

// ─── Health Check ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date(),
    services: Object.keys(SERVICES),
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Proxying to:', SERVICES);
});

process.on('SIGTERM', () => {
  logger.info('API Gateway shutting down...');
  process.exit(0);
});

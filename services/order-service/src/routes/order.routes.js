const router = require('express').Router();
const { body, query } = require('express-validator');
const { createOrder, getOrders, getOrderById, updateOrderStatus } = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All order routes require authentication
router.use(authenticate);

// ─── Create Order (buyers only) ───────────────────────────────────────
router.post('/', authorize('buyer', 'admin'), [
  body('seller_id').isUUID().withMessage('Valid seller_id required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.inventory_item_id').isUUID(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('shipping_address').notEmpty().withMessage('Shipping address required'),
], createOrder);

// ─── Get Orders (all roles, filtered by role) ─────────────────────────
router.get('/', [
  query('status').optional().isIn(['PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','RETURNED']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], getOrders);

// ─── Get Order by ID ──────────────────────────────────────────────────
router.get('/:id', getOrderById);

// ─── Update Order Status (sellers + admin for normal flow) ────────────
router.patch('/:id/status', authorize('seller', 'buyer', 'admin'), [
  body('status').isIn(['CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','RETURNED'])
    .withMessage('Invalid status'),
  body('note').optional().isString(),
], updateOrderStatus);

module.exports = router;

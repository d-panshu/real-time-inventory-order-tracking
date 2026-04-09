const { validationResult } = require('express-validator');
const { pool } = require('../utils/db');
const { redisClient } = require('../utils/redis');
const { publishOrderEvent, ORDER_EVENTS } = require('../kafka/producer');
const { logger } = require('../utils/logger');

const CACHE_TTL = 60; // 60 seconds

// ─── Create Order ─────────────────────────────────────────────────────
async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { seller_id, items, shipping_address, notes } = req.body;
    const buyer_id = req.user.id;

    await client.query('BEGIN');

    // Validate inventory and calculate total
    let totalAmount = 0;
    for (const item of items) {
      const inv = await client.query(
        'SELECT id, quantity, price_per_unit FROM inventory_items WHERE id = $1 AND is_active = true',
        [item.inventory_item_id]
      );
      if (inv.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `Item ${item.inventory_item_id} not found` });
      }
      if (inv.rows[0].quantity < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `Insufficient stock for item ${item.inventory_item_id}` });
      }
      totalAmount += inv.rows[0].price_per_unit * item.quantity;
    }

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, seller_id, total_amount, shipping_address, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [buyer_id, seller_id, totalAmount, shipping_address, notes]
    );
    const order = orderResult.rows[0];

    // Insert order items + decrement inventory
    for (const item of items) {
      const inv = await client.query('SELECT price_per_unit FROM inventory_items WHERE id = $1', [item.inventory_item_id]);
      await client.query(
        `INSERT INTO order_items (order_id, inventory_item_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.inventory_item_id, item.quantity, inv.rows[0].price_per_unit, inv.rows[0].price_per_unit * item.quantity]
      );
      await client.query(
        'UPDATE inventory_items SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.inventory_item_id]
      );
    }

    // Append status history (initial PLACED)
    await client.query(
      `INSERT INTO order_status_history (order_id, status, updated_by)
       VALUES ($1, 'PLACED', $2)`,
      [order.id, buyer_id]
    );

    await client.query('COMMIT');

    // Invalidate cache
    await redisClient.del(`orders:buyer:${buyer_id}`);

    // Publish event to Kafka
    await publishOrderEvent(ORDER_EVENTS.CREATED, {
      orderId: order.id,
      buyerId: buyer_id,
      sellerId: seller_id,
      status: 'PLACED',
      totalAmount,
    });

    logger.info(`Order created: ${order.id}`);
    res.status(201).json({ success: true, message: 'Order placed successfully', data: order });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── Get Orders ───────────────────────────────────────────────────────
async function getOrders(req, res, next) {
  try {
    const { role, id: userId } = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query, params;

    if (role === 'admin') {
      query = `SELECT o.*, 
        u1.name AS buyer_name, u2.name AS seller_name
        FROM orders o
        JOIN users u1 ON o.buyer_id = u1.id
        JOIN users u2 ON o.seller_id = u2.id
        WHERE ($1::order_status IS NULL OR o.status = $1)
        ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`;
      params = [status || null, limit, offset];
    } else if (role === 'seller') {
      query = `SELECT o.*, u.name AS buyer_name
        FROM orders o
        JOIN users u ON o.buyer_id = u.id
        WHERE o.seller_id = $1
        AND ($2::order_status IS NULL OR o.status = $2)
        ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`;
      params = [userId, status || null, limit, offset];
    } else {
      // buyer — check cache first
      const cacheKey = `orders:buyer:${userId}:${page}:${status || 'all'}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({ success: true, data: JSON.parse(cached), cached: true });
      }
      query = `SELECT o.*, u.name AS seller_name
        FROM orders o
        JOIN users u ON o.seller_id = u.id
        WHERE o.buyer_id = $1
        AND ($2::order_status IS NULL OR o.status = $2)
        ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`;
      params = [userId, status || null, limit, offset];
    }

    const result = await pool.query(query, params);

    if (role === 'buyer' && result.rows.length > 0) {
      const cacheKey = `orders:buyer:${userId}:${page}:${status || 'all'}`;
      await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(result.rows));
    }

    res.json({ success: true, data: result.rows, meta: { page, limit, count: result.rows.length } });
  } catch (err) {
    next(err);
  }
}

// ─── Get Order by ID ──────────────────────────────────────────────────
async function getOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    // Get order with status history
    const orderResult = await pool.query(
      `SELECT o.*,
        u1.name AS buyer_name, u2.name AS seller_name,
        json_agg(json_build_object(
          'id', oi.id,
          'item_name', inv.name,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'total_price', oi.total_price
        )) AS items
       FROM orders o
       JOIN users u1 ON o.buyer_id = u1.id
       JOIN users u2 ON o.seller_id = u2.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN inventory_items inv ON inv.id = oi.inventory_item_id
       WHERE o.id = $1
       GROUP BY o.id, u1.name, u2.name`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Access control
    if (role === 'buyer' && order.buyer_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (role === 'seller' && order.seller_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get status timeline
    const historyResult = await pool.query(
      `SELECT osh.*, u.name AS updated_by_name
       FROM order_status_history osh
       LEFT JOIN users u ON osh.updated_by = u.id
       WHERE osh.order_id = $1
       ORDER BY osh.created_at ASC`,
      [id]
    );

    res.json({ success: true, data: { ...order, statusHistory: historyResult.rows } });
  } catch (err) {
    next(err);
  }
}

// ─── Update Order Status ──────────────────────────────────────────────
// 🔥 CORE: This is the main event that triggers real-time updates

async function updateOrderStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { status, note } = req.body;
    const { role, id: userId } = req.user;

    // Fetch current order
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Role-based status update rules
    const sellerAllowed = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
    const buyerAllowed = ['CANCELLED'];

    if (role === 'seller' && order.seller_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (role === 'buyer') {
      if (order.buyer_id !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (!buyerAllowed.includes(status)) {
        return res.status(403).json({ success: false, message: 'Buyers can only cancel orders' });
      }
    }
    if (role === 'seller' && !sellerAllowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status transition' });
    }

    await client.query('BEGIN');

    // Update order status
    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );

    // Append to history (never overwrite!)
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note, updated_by)
       VALUES ($1, $2, $3, $4)`,
      [id, status, note, userId]
    );

    // Log to events table
    await client.query(
      `INSERT INTO events (event_type, entity_type, entity_id, payload, created_by)
       VALUES ($1, 'order', $2, $3, $4)`,
      ['ORDER_STATUS_UPDATED', id, JSON.stringify({ from: order.status, to: status }), userId]
    );

    await client.query('COMMIT');

    // Invalidate caches
    await redisClient.del(`orders:buyer:${order.buyer_id}:1:all`);

    // 🔥 Publish to Kafka → WebSocket consumers will push to browser
    await publishOrderEvent(ORDER_EVENTS.STATUS_UPDATED, {
      orderId: id,
      buyerId: order.buyer_id,
      sellerId: order.seller_id,
      previousStatus: order.status,
      newStatus: status,
      note,
      updatedBy: userId,
    });

    logger.info(`Order ${id} status updated: ${order.status} → ${status}`);
    res.json({ success: true, message: `Order status updated to ${status}` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { createOrder, getOrders, getOrderById, updateOrderStatus };

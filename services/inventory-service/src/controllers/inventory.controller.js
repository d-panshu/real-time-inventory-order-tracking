const { validationResult } = require('express-validator');
const { pool } = require('../utils/db');
const { redisClient } = require('../utils/redis');
const { publishInventoryEvent, INVENTORY_EVENTS } = require('../kafka/producer');
const { logger } = require('../utils/logger');

const CACHE_TTL = 120;
const CACHE_PREFIX = 'inventory';

// ─── Create Item ──────────────────────────────────────────────────────
async function createItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, description, category, quantity, unit, price_per_unit, low_stock_threshold, sku } = req.body;
    const seller_id = req.user.id;

    const result = await pool.query(
      `INSERT INTO inventory_items
         (seller_id, name, description, category, quantity, unit, price_per_unit, low_stock_threshold, sku)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [seller_id, name, description, category || 'other', quantity, unit || 'units',
       price_per_unit, low_stock_threshold || 10, sku]
    );

    const item = result.rows[0];

    // Invalidate seller cache
    await redisClient.del(`${CACHE_PREFIX}:seller:${seller_id}`);

    await publishInventoryEvent(INVENTORY_EVENTS.CREATED, {
      itemId: item.id,
      sellerId: seller_id,
      name: item.name,
      quantity: item.quantity,
    });

    logger.info(`Inventory item created: ${item.id} by seller ${seller_id}`);
    res.status(201).json({ success: true, message: 'Item created', data: item });
  } catch (err) {
    if (err.code === '23505') { // unique violation (SKU)
      return res.status(409).json({ success: false, message: 'SKU already exists' });
    }
    next(err);
  }
}

// ─── Get All Items ────────────────────────────────────────────────────
async function getItems(req, res, next) {
  try {
    const { role, id: userId } = req.user;
    const { category, low_stock, page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    // Sellers only see their own items; buyers/admin see all active
    let baseQuery, params;

    if (role === 'seller') {
      const cacheKey = `${CACHE_PREFIX}:seller:${userId}:${page}`;
      const cached = await redisClient.get(cacheKey);
      if (cached && !search && !low_stock) {
        return res.json({ success: true, data: JSON.parse(cached), cached: true });
      }

      baseQuery = `SELECT i.*, u.name AS seller_name
        FROM inventory_items i
        JOIN users u ON i.seller_id = u.id
        WHERE i.seller_id = $1
        AND ($2::inventory_category IS NULL OR i.category = $2)
        AND ($3::text IS NULL OR i.name ILIKE '%' || $3 || '%')
        AND ($4::boolean IS FALSE OR i.quantity <= i.low_stock_threshold)
        ORDER BY i.created_at DESC LIMIT $5 OFFSET $6`;
      params = [userId, category || null, search || null, low_stock === 'true', limit, offset];
    } else {
      baseQuery = `SELECT i.*, u.name AS seller_name
        FROM inventory_items i
        JOIN users u ON i.seller_id = u.id
        WHERE i.is_active = true
        AND ($1::inventory_category IS NULL OR i.category = $1)
        AND ($2::text IS NULL OR i.name ILIKE '%' || $2 || '%')
        AND ($3::boolean IS FALSE OR i.quantity <= i.low_stock_threshold)
        ORDER BY i.created_at DESC LIMIT $4 OFFSET $5`;
      params = [category || null, search || null, low_stock === 'true', limit, offset];
    }

    const result = await pool.query(baseQuery, params);

    // Cache seller results
    if (role === 'seller' && !search && !low_stock) {
      await redisClient.setEx(`${CACHE_PREFIX}:seller:${userId}:${page}`, CACHE_TTL, JSON.stringify(result.rows));
    }

    res.json({ success: true, data: result.rows, meta: { page, limit, count: result.rows.length } });
  } catch (err) {
    next(err);
  }
}

// ─── Get Item by ID ───────────────────────────────────────────────────
async function getItemById(req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `${CACHE_PREFIX}:item:${id}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });

    const result = await pool.query(
      `SELECT i.*, u.name AS seller_name
       FROM inventory_items i
       JOIN users u ON i.seller_id = u.id
       WHERE i.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(result.rows[0]));
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─── Update Item ──────────────────────────────────────────────────────
async function updateItem(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { role, id: userId } = req.user;

    // Fetch item and enforce ownership
    const existing = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    const item = existing.rows[0];

    if (role === 'seller' && item.seller_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { name, description, category, quantity, unit, price_per_unit, low_stock_threshold, is_active } = req.body;

    const result = await pool.query(
      `UPDATE inventory_items SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        quantity = COALESCE($4, quantity),
        unit = COALESCE($5, unit),
        price_per_unit = COALESCE($6, price_per_unit),
        low_stock_threshold = COALESCE($7, low_stock_threshold),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [name, description, category, quantity, unit, price_per_unit, low_stock_threshold, is_active, id]
    );

    const updated = result.rows[0];

    // Invalidate caches
    await redisClient.del(`${CACHE_PREFIX}:item:${id}`);
    await redisClient.del(`${CACHE_PREFIX}:seller:${item.seller_id}:1`);

    // Check for low/out-of-stock alerts
    let eventType = INVENTORY_EVENTS.UPDATED;
    if (updated.quantity === 0) eventType = INVENTORY_EVENTS.OUT_OF_STOCK;
    else if (updated.quantity <= updated.low_stock_threshold) eventType = INVENTORY_EVENTS.LOW_STOCK;

    await publishInventoryEvent(eventType, {
      itemId: updated.id,
      sellerId: updated.seller_id,
      name: updated.name,
      quantity: updated.quantity,
      previousQuantity: item.quantity,
    });

    logger.info(`Inventory item updated: ${id}`);
    res.json({ success: true, message: 'Item updated', data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Restock Item ─────────────────────────────────────────────────────
async function restockItem(req, res, next) {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const { id: userId, role } = req.user;

    const existing = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    const item = existing.rows[0];

    if (role === 'seller' && item.seller_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const result = await pool.query(
      `UPDATE inventory_items SET quantity = quantity + $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [quantity, id]
    );

    await redisClient.del(`${CACHE_PREFIX}:item:${id}`);

    await publishInventoryEvent(INVENTORY_EVENTS.UPDATED, {
      itemId: id,
      sellerId: item.seller_id,
      name: item.name,
      quantity: result.rows[0].quantity,
      restocked: quantity,
    });

    res.json({ success: true, message: `Restocked ${quantity} units`, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { createItem, getItems, getItemById, updateItem, restockItem };

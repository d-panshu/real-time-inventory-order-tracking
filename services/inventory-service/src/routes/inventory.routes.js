const router = require('express').Router();
const { body, query } = require('express-validator');
const { createItem, getItems, getItemById, updateItem, restockItem } = require('../controllers/inventory.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);

// Create item — sellers only
router.post('/', authorize('seller', 'admin'), [
  body('name').trim().notEmpty(),
  body('quantity').isInt({ min: 0 }),
  body('price_per_unit').isFloat({ min: 0 }),
  body('category').optional().isIn(['seafood','vegetables','electronics','furniture','vehicles','other']),
  body('sku').optional().isString(),
], createItem);

// Get all items (sellers see own, buyers/admin see all active)
router.get('/', [
  query('category').optional().isIn(['seafood','vegetables','electronics','furniture','vehicles','other']),
  query('low_stock').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('search').optional().isString(),
], getItems);

// Get single item
router.get('/:id', getItemById);

// Update item — seller (own) or admin
router.patch('/:id', authorize('seller', 'admin'), [
  body('quantity').optional().isInt({ min: 0 }),
  body('price_per_unit').optional().isFloat({ min: 0 }),
  body('is_active').optional().isBoolean(),
], updateItem);

// Restock — seller (own) or admin
router.post('/:id/restock', authorize('seller', 'admin'), [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be >= 1'),
], restockItem);

module.exports = router;

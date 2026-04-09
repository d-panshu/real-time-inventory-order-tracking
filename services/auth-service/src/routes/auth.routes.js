const router = require('express').Router();
const { body } = require('express-validator');
const { register, login, verifyToken, logout, getProfile } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

// ─── Public Routes ────────────────────────────────────────────────────

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 characters'),
  body('role').optional().isIn(['buyer', 'seller']).withMessage('Role must be buyer or seller'),
], register);

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], login);

// ─── Internal route (used by gateway only) ───────────────────────────
router.post('/verify', verifyToken);

// ─── Protected Routes ─────────────────────────────────────────────────
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);

module.exports = router;

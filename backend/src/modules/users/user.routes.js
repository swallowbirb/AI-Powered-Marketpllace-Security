const express = require('express');
const userController = require('./user.controller');
const { requireAuth, attachUser, requireRole } = require('../../middleware/auth.middleware');

const router = express.Router();

// Sync user from Clerk to our DB (can be called by frontend on signin or webhook)
// If it's a frontend call, we expect Clerk token in Authorization header
router.post('/sync', requireAuth, userController.syncUser);

// Get current user profile (requires user to be in our DB)
router.get('/me', requireAuth, attachUser, userController.getMe);

// Example of a role-protected route
router.get('/seller-data', requireAuth, attachUser, requireRole(['seller', 'admin']), (req, res) => {
  res.json({ success: true, data: 'Seller specific data' });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate, authorizeRoles } = require('../middleware/auth');

// Get all available plans
router.get('/plans', subscriptionController.getPlans);

// Get school's current subscription (requires authentication)
router.get('/:schoolId', authenticate, subscriptionController.getSubscription);

// Create Stripe checkout session (admin only)
router.post('/checkout', authenticate, authorizeRoles('school_admin'), subscriptionController.createCheckoutSession);

// Verify payment session
router.get('/verify/:sessionId', authenticate, subscriptionController.verifySession);

// Cancel subscription (admin only)
router.post('/:schoolId/cancel', authenticate, authorizeRoles('school_admin'), subscriptionController.cancelSubscription);

// Stripe webhook endpoint (no authentication - Stripe will verify)
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

module.exports = router;

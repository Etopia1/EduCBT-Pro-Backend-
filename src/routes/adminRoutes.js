const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');

// Admin-only middleware
const adminOnly = (req, res, next) => {
    if (!['school_admin', 'super_admin'].includes(req.user?.role)) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

router.use(authenticate);
router.use(adminOnly);

// Activity Feed
router.get('/activity', adminController.getActivityFeed);
router.get('/activity/download', adminController.downloadLogs);
router.get('/analytics', adminController.getAnalyticsOverview);

// User Management
router.get('/users', adminController.getSchoolUsers);
router.get('/users/:userId', adminController.getUserActivity);
router.patch('/users/:userId/toggle-block', adminController.toggleBlockUser);
router.delete('/users/:userId', adminController.deleteUser);

// Chat Monitoring
router.get('/messages', adminController.getAllMessages);
router.get('/groups', adminController.getAllGroups);

module.exports = router;

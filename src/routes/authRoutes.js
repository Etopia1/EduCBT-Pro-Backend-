const express = require('express');
const router = express.Router();
const { login, sendOTP, verifyOTP, resetPassword } = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');

router.post('/login', login);
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', auth, resetPassword);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
    logViolation,
    getSessionViolations,
    getExamViolations,
    getMyViolations
} = require('../controllers/violationController');
const authMiddleware = require('../middleware/authMiddleware');

// Log a violation (POST)
router.post('/log', authMiddleware, logViolation);

// Get violations for a specific session (GET) - for teachers
router.get('/session/:sessionId', authMiddleware, getSessionViolations);

// Get all violations for an exam (GET) - for teachers
router.get('/exam/:examId', authMiddleware, getExamViolations);

// Get my violations for an exam (GET) - for students
router.get('/my/:examId', authMiddleware, getMyViolations);

module.exports = router;

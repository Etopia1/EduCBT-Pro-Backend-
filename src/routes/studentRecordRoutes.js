const express = require('express');
const router = express.Router();
const {
    getStudentRecords,
    getOrCreateStudentRecord,
    updateStudentRecord,
    bulkUpdateRecords,
    syncAutomatedScores,
    initializeClassRecords,
    publishSubject,
    updateExamScore,
    getRecordsWithPermissions
} = require('../controllers/studentRecordController');
const authMiddleware = require('../middleware/authMiddleware');

// Get all student records with permissions
router.get('/with-permissions', authMiddleware, getRecordsWithPermissions);

// Get all student records (with filters)
router.get('/', authMiddleware, getStudentRecords);

// Get or create a single student record
router.get('/:studentId', authMiddleware, getOrCreateStudentRecord);

// Update a single student record
router.put('/:recordId', authMiddleware, updateStudentRecord);

// Update exam score for a specific subject
router.put('/:recordId/exam-score', authMiddleware, updateExamScore);

// Bulk update multiple records
router.post('/bulk-update', authMiddleware, bulkUpdateRecords);

// Sync automated scores for a student
router.post('/sync-scores', authMiddleware, syncAutomatedScores);

// Initialize records for a class
router.post('/initialize-class', authMiddleware, initializeClassRecords);

// Publish/unpublish subject scores
router.post('/publish-subject', authMiddleware, publishSubject);

module.exports = router;

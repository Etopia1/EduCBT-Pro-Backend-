const express = require('express');
const router = express.Router();
const controller = require('../controllers/examController');
const authMiddleware = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');
const { validateExamType, checkFeatureLimits } = require('../middleware/subscription');

const { parser, cloudinaryUpload } = require('../utils/cloudinaryConfig');

// --- TEACHER ROUTES (STRICT CONTROL) ---
// Only 'teacher' role can create or manage exams
router.post('/create', [authMiddleware, authorize('teacher'), validateExamType, checkFeatureLimits('exams')], controller.createExam);
router.post('/teacher/upload-image', [authMiddleware, authorize('teacher')], parser.single('image'), cloudinaryUpload, controller.uploadQuestionImage);
router.get('/teacher/all', [authMiddleware, authorize('teacher')], controller.getTeacherExams);

// --- STUDENT ROUTES ---
// Students can fetch available exams and take them
router.get('/available', [authMiddleware, authorize('student')], controller.getAvailableExams);
router.get('/student', [authMiddleware, authorize('student')], controller.getStudentExams); // Student test list
router.get('/results', [authMiddleware, authorize('student')], controller.getStudentResults); // New: Student Results
router.post('/start', [authMiddleware, authorize('student')], controller.startSession);
router.post('/submit', [authMiddleware, authorize('student')], controller.submitExam);
router.post('/violation/log', [authMiddleware, authorize('student')], controller.logViolation);

// --- SESSION MONITORING ROUTES (TEACHER) ---
const sessionController = require('../controllers/sessionController');
router.get('/:examId/sessions', [authMiddleware, authorize('teacher')], sessionController.getExamSessions);
router.post('/session/:sessionId/unlock', [authMiddleware, authorize('teacher')], sessionController.unlockSession);
router.post('/session/:sessionId/lock', [authMiddleware, authorize('teacher')], sessionController.lockSession);
router.post('/session/:sessionId/force-submit', [authMiddleware, authorize('teacher')], sessionController.forceSubmitSession);

// --- DYNAMIC PARAMETER ROUTES (MUST BE LAST) ---
// These routes with :id parameters must come after all specific named routes
router.get('/:id', [authMiddleware], controller.getExamById);
router.put('/:id', [authMiddleware, authorize('teacher')], controller.updateExam); // New: Edit test
router.patch('/:id/status', [authMiddleware, authorize('teacher')], controller.toggleExamStatus);
router.delete('/:id', [authMiddleware, authorize('teacher')], controller.deleteExam);

// --- SHARED / MONITORING ---
// Admin can view exams but NOT controlled via these routes (Admin uses specific admin monitoring endpoints)

module.exports = router;

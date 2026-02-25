const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const authMiddleware = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');

const { parser, cloudinaryUpload } = require('../utils/cloudinaryConfig');

// Public Routes
router.post('/register', parser.single('logo'), cloudinaryUpload, schoolController.registerSchool);
router.post('/verify-email', schoolController.verifyEmail);
router.get('/public/:schoolId', schoolController.getPublicSchoolInfo); // Direct ID
router.get('/invite-info/:token', schoolController.getInviteInfo); // Validate Token & Get Info
router.get('/ref-info/:refId', schoolController.getSchoolByRefId); // Validate Ref & Get Info
router.post('/signup/teacher', parser.single('profilePicture'), cloudinaryUpload, schoolController.registerTeacher);
router.post('/signup/student', parser.single('profilePicture'), cloudinaryUpload, schoolController.registerStudent);

// Protected Routes (School Admin Only)
router.use(authMiddleware);

// Admin Monitoring & Management
router.get('/dashboard/stats', authorize('school_admin'), schoolController.getDashboardStats);
router.get('/teachers', authorize('school_admin'), schoolController.getAllTeachers);
router.get('/students', authorize('school_admin'), schoolController.getAllStudents);
router.get('/analytics/user-growth', authorize('school_admin'), schoolController.getUserGrowthAnalytics); // Added route
router.get('/pending', authorize('school_admin'), schoolController.getPendingUsers);

router.post('/invite/generate', authorize('school_admin'), schoolController.generateInvite);
router.post('/approve', authorize('school_admin'), schoolController.approveUser);
router.post('/term/update', authorize('school_admin'), schoolController.updateSchoolTerm); // New: Update Term


// Teacher Routes
router.get('/teacher/stats', authorize('teacher'), schoolController.getTeacherDashboardStats);
router.get('/teacher/pending-students', authorize('teacher'), schoolController.getTeacherPendingStudents);
router.get('/teacher/history', authorize('teacher'), schoolController.getAttendanceHistory);
router.post('/teacher/approve-student', authorize('teacher'), schoolController.teacherApproveStudent);
router.get('/teacher/class-students', authorize('teacher'), schoolController.getClassStudents); // For Attendance List
router.get('/teacher/profile', authorize('teacher'), schoolController.getTeacherProfile);
router.get('/teacher/attendance', authorize('teacher'), schoolController.getAttendance); // Get daily attendance
router.post('/teacher/attendance', authorize('teacher'), schoolController.markAttendance); // Mark daily attendance

// Staff Attendance (Real-time)
router.get('/staff/attendance', authorize('teacher'), schoolController.getStaffAttendance);
router.post('/staff/time-in', authorize('teacher'), schoolController.markStaffTimeIn);
router.post('/staff/time-out', authorize('teacher'), schoolController.markStaffTimeOut);

module.exports = router;

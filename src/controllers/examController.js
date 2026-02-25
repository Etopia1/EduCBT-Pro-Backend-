const Exam = require('../models/Exam');
const Session = require('../models/Session');

const User = require('../models/User');
const School = require('../models/School');
const Subscription = require('../models/Subscription');

// --- TEACHER ACTIONS ---

// Create Exam
exports.createExam = async (req, res) => {
    const { title, durationMinutes, questions, subject, accessCode, totalMarks, examType, proctoringSettings } = req.body;

    try {
        // Use subscription attached by middleware or fetch it
        let subscription = req.subscription;
        if (!subscription) {
            subscription = await Subscription.findOne({ schoolId: req.user.schoolId });
        }

        // Determine effective exam type based on subscription
        let finalExamType = 'basic';
        let finalProctoringSettings = {
            requireCamera: false,
            requireAudio: false,
            detectViolations: false,
            lockBrowser: false,
            screenSharing: false,
            faceDetection: false,
            tabSwitchLimit: 0
        };

        // Check subscription for Proctoring
        if (examType === 'proctored') {
            // Admin school bypass
            const school = await School.findById(req.user.schoolId);
            const isAdminSchool = school && school.schoolLoginId === 'SCH-20670E';
            
            const hasProctoring = isAdminSchool || (subscription && subscription.isActive() && subscription.features?.proctoriedExams);

            if (hasProctoring) {
                finalExamType = 'proctored';
                finalProctoringSettings = proctoringSettings || finalProctoringSettings;
            } else {
                return res.status(403).json({
                    message: 'Your current subscription plan does not support Monitor Mode. Please upgrade to Proctored or Premium plan.'
                });
            }
        }

        const exam = new Exam({
            title,
            durationMinutes,
            questions,
            subject,
            totalMarks: totalMarks || 100,
            accessCode,
            classLevel: req.body.classLevel, // Save classLevel if provided
            teacherId: req.user._id,
            schoolId: req.user.schoolId,
            status: 'scheduled',
            isActive: false,
            examType: finalExamType,
            proctoringSettings: finalProctoringSettings
        });
        await exam.save();
        res.status(201).json(exam);
    } catch (error) {
        res.status(500).json({ message: 'Error creating exam', error: error.message });
    }
};

// Get Teacher's Exams
exports.getTeacherExams = async (req, res) => {
    try {
        const exams = await Exam.find({ teacherId: req.user._id }).sort({ createdAt: -1 });
        res.json(exams);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching exams', error: error.message });
    }
};

// Control Exam: Start/End/Pause (Toggle Active)
// Control Exam: Start/End/Pause (Toggle Active)
exports.toggleExamStatus = async (req, res) => {
    const { id } = req.params;
    const { status, isActive } = req.body; // e.g., status='active', isActive=true
    console.log(`[TOGGLE_STATUS] Exam: ${id}, Status: ${status}, Active: ${isActive}, Teacher: ${req.user._id}`);

    try {
        const exam = await Exam.findById(id);
        if (!exam) {
            console.log(`[TOGGLE_STATUS] Exam not found: ${id}`);
            return res.status(404).json({ message: 'Exam not found' });
        }

        console.log(`[TOGGLE_STATUS] Exam found. Owner: ${exam.teacherId}, Requestor: ${req.user._id}`);

        // Check ownership (Comparing ObjectIds properly)
        if (exam.teacherId.toString() !== req.user._id.toString()) {
            console.log(`[TOGGLE_STATUS] Unauthorized access`);
            return res.status(403).json({ message: 'Unauthorized to manage this test' });
        }

        if (status) {
            exam.status = status;
            // If ending the exam, auto-broadcast to all students and terminate ongoing sessions
            if (status === 'ended') {
                exam.isActive = false;

                // Terminate all ongoing sessions for this exam
                const ongoingSessions = await Session.find({
                    exam: id,
                    status: 'ongoing'
                });

                for (const session of ongoingSessions) {
                    session.status = 'terminated';
                    session.endTime = new Date();
                    await session.save();
                }

                console.log(`[TOGGLE_STATUS] Terminated ${ongoingSessions.length} ongoing sessions`);

                // Broadcast to all students in this exam room
                const io = req.app.get('io');
                io.to(`exam_${id}`).emit('exam_terminated', {
                    message: 'This exam has been ended by the teacher',
                    examId: id
                });
                console.log(`[TOGGLE_STATUS] Exam ${id} ended. Broadcast sent.`);
            }
        }
        if (typeof isActive !== 'undefined') exam.isActive = isActive;

        await exam.save();
        console.log(`[TOGGLE_STATUS] Success. New Status: ${exam.status}, Active: ${exam.isActive}`);
        res.json({ message: 'Test status updated', exam });
    } catch (error) {
        console.error(`[TOGGLE_STATUS] Error:`, error);
        res.status(500).json({ message: 'Error updating test', error: error.message });
    }
};


// --- STUDENT/SHARED ACTIONS ---

exports.getAvailableExams = async (req, res) => {
    // For students: get active exams in their school that they haven't completed yet
    try {
        const userId = req.user._id;

        // Find all active exams in the student's school
        const activeExams = await Exam.find({
            schoolId: req.user.schoolId,
            isActive: true,
            status: 'active'
        }).select('-questions.correctOption -questions.correctOptions'); // Hide answers

        // Find all completed/terminated sessions for this student
        const completedSessions = await Session.find({
            user: userId,
            status: { $in: ['completed', 'terminated'] }
        }).select('exam');

        // Extract exam IDs that student has already completed
        const completedExamIds = completedSessions.map(session => session.exam.toString());

        // Filter out exams that the student has already completed
        const availableExams = activeExams.filter(exam =>
            !completedExamIds.includes(exam._id.toString())
        );

        console.log(`[AVAILABLE_EXAMS] User ${userId}: ${availableExams.length} available, ${completedExamIds.length} already taken`);
        res.json(availableExams);
    } catch (error) {
        console.error('[AVAILABLE_EXAMS] Error:', error);
        res.status(500).json({ message: 'Error fetching exams', error: error.message });
    }
};

exports.startSession = async (req, res) => {
    const { examId } = req.body;
    const userId = req.user._id;

    try {
        const exam = await Exam.findById(examId);
        if (!exam || !exam.isActive) {
            return res.status(400).json({ message: 'Exam is not currently available' });
        }

        // Check if exam status is 'active' (teacher has started it)
        if (exam.status !== 'active') {
            return res.status(400).json({ message: 'This exam has not been started by the teacher yet' });
        }

        // Security check: Ensure exam belongs to student's school
        if (exam.schoolId.toString() !== req.user.schoolId.toString()) {
            return res.status(403).json({ message: 'Unauthorized: This exam is not for your school' });
        }

        // Check if student has already completed this exam
        const existingSession = await Session.findOne({ user: userId, exam: examId });

        if (existingSession) {
            // If session is completed or terminated, prevent retake
            if (existingSession.status === 'completed' || existingSession.status === 'terminated') {
                return res.status(403).json({
                    message: 'You have already taken this exam and cannot retake it',
                    session: existingSession
                });
            }

            // If session is ongoing, return the existing session with lock status
            console.log(`[START_SESSION] Returning existing session for user ${userId}, isLocked: ${existingSession.isLocked}`);
            return res.json({
                ...existingSession.toObject(),
                sessionId: existingSession._id,
                isLocked: existingSession.isLocked,
                lockReason: existingSession.lockReason
            });
        }

        // Create new session for first-time takers
        const session = new Session({
            user: userId,
            exam: examId,
            startTime: new Date(),
            status: 'ongoing'
        });
        await session.save();

        console.log(`[START_SESSION] New session created for user ${userId} on exam ${examId}`);
        res.json({
            ...session.toObject(),
            sessionId: session._id,
            isLocked: session.isLocked,
            lockReason: session.lockReason
        });
    } catch (error) {
        console.error('[START_SESSION] Error:', error);
        res.status(500).json({ message: 'Error starting session', error: error.message });
    }
};

exports.submitExam = async (req, res) => {
    const { sessionId, answers } = req.body;
    try {
        const session = await Session.findOne({ _id: sessionId, user: req.user._id }).populate('exam');
        if (!session) return res.status(404).json({ message: 'Session not found' });

        const exam = session.exam;
        let correctCount = 0;

        // Calculate Score
        exam.questions.forEach((question, index) => {
            const studentAnswer = answers[index]; // Can be Number or Array of Numbers

            // Backwards compatibility for correctOptions
            let correctOnes = question.correctOptions || [];
            if (correctOnes.length === 0 && question.correctOption !== undefined) {
                correctOnes = [question.correctOption];
            }

            if (Array.isArray(studentAnswer)) {
                // Multi-select: Check if arrays have same elements
                if (studentAnswer.length === correctOnes.length &&
                    studentAnswer.every(val => correctOnes.includes(val))) {
                    correctCount++;
                }
            } else {
                // Single select
                if (correctOnes.includes(studentAnswer)) {
                    correctCount++;
                }
            }
        });

        const totalQuestions = exam.questions.length;
        const totalMarks = exam.totalMarks || 100;
        const scaledScore = (correctCount / totalQuestions) * totalMarks;

        session.answers = answers;
        session.score = scaledScore; // Scaled value (e.g., 15/20)
        session.percentage = (correctCount / totalQuestions) * 100;
        session.status = 'completed';
        session.endTime = new Date();

        await session.save();

        // AUTO-UPDATE STUDENT RECORD WITH TEST SCORE BY SUBJECT
        try {
            const StudentRecord = require('../models/StudentRecord');
            const User = require('../models/User');

            // Get student info
            const student = await User.findById(req.user._id);

            // Normalize subject name (e.g., "Mathematics" -> "mathematics")
            const subjectKey = exam.subject.toLowerCase().replace(/\s+/g, '');

            // Find or create student record
            let record = await StudentRecord.findOne({ student: req.user._id });

            if (!record) {
                record = new StudentRecord({
                    student: req.user._id,
                    schoolId: student.schoolId,
                    fullName: student.fullName,
                    registrationNumber: student.info?.registrationNumber || 'N/A',
                    gender: student.gender,
                    classLevel: student.info?.classLevel
                });
            }

            // Update test score for this subject (percentage out of 100)
            if (record.testScores && record.testScores.hasOwnProperty(subjectKey)) {
                record.testScores[subjectKey] = session.percentage;
                await record.save();
                console.log(`[AUTO-UPDATE] Updated ${exam.subject} test score for ${student.fullName}: ${session.percentage}%`);
            } else {
                console.log(`[AUTO-UPDATE] Subject key "${subjectKey}" not found in testScores schema`);
            }
        } catch (recordError) {
            console.error('[AUTO-UPDATE] Error updating student record:', recordError);
            // Don't fail the exam submission if record update fails
        }

        res.json({
            message: 'Test submitted and marked successfully',
            score: scaledScore.toFixed(1),
            total: totalMarks,
            correctCount,
            totalQuestions,
            percentage: session.percentage.toFixed(2)
        });
    } catch (error) {
        console.error('=== SUBMIT EXAM ERROR ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ message: 'Error submitting test', error: error.message });
    }
};

// Get Single Exam (for editing)
exports.getExamById = async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });
        res.json(exam);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching exam', error: error.message });
    }
};

// Update Exam (Edit)
exports.updateExam = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subject, durationMinutes, totalMarks, questions, examType, proctoringSettings, classLevel } = req.body;

        const exam = await Exam.findById(id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        // Authorization Check
        if (exam.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to edit this test' });
        }

        // Check subscription if trying to enable proctoring
        if (examType === 'proctored') {
            const School = require('../models/School');
            const school = await School.findById(req.user.schoolId);
            const isAdminSchool = school && school.schoolLoginId === 'SCH-20670E';
            
            const Subscription = require('../models/Subscription');
            const subscription = await Subscription.findOne({ schoolId: req.user.schoolId });
            
            const hasProctoring = isAdminSchool || (subscription && subscription.isActive() && subscription.features?.proctoriedExams);

            if (!hasProctoring) {
                return res.status(403).json({ 
                    message: 'Your current subscription plan does not support Monitor Mode. Please upgrade.' 
                });
            }
        }

        // Apply updates
        exam.title = title || exam.title;
        exam.subject = subject || exam.subject;
        exam.durationMinutes = durationMinutes || exam.durationMinutes;
        exam.totalMarks = totalMarks || exam.totalMarks;
        exam.questions = questions || exam.questions;
        exam.classLevel = classLevel || exam.classLevel;
        exam.examType = examType || exam.examType;
        if (proctoringSettings) {
            exam.proctoringSettings = { ...exam.proctoringSettings, ...proctoringSettings };
        }

        await exam.save();
        res.json({ message: 'Test updated successfully', exam });
    } catch (error) {
        console.error('Update Exam Error:', error);
        res.status(500).json({ message: 'Error updating test', error: error.message });
    }
};

// Get Exams for Students (Based on their classLevel and school)
// Students see exams where exam.classLevel matches their class, regardless of teacher
exports.getStudentExams = async (req, res) => {
    try {
        const student = req.user;
        if (!student.info?.classLevel) {
            return res.status(400).json({ message: 'No class level assigned. Please contact your teacher.' });
        }

        // Find exams that match:
        // 1. Same school as student
        // 2. Same class level as student
        // 3. Active exams only

        console.log(`[GET_STUDENT_EXAMS] Student: ${student.username}, Class: ${student.info.classLevel}, School: ${student.schoolId}`);

        // Normalize class level (e.g., "SS 2" -> "SS2") to ensure matching
        const studentClass = student.info.classLevel;
        const normalizedClass = studentClass.replace(/\s+/g, ''); // Remove spaces
        const spacedClass = normalizedClass.replace(/([a-zA-Z]+)(\d+)/, '$1 $2'); // Add space (e.g. SS 2)

        const query = {
            schoolId: student.schoolId,
            classLevel: { $in: [studentClass, normalizedClass, spacedClass] }, // Check all variations
            isActive: true
        };
        console.log('[GET_STUDENT_EXAMS] Query:', query);

        const exams = await Exam.find(query)
            .populate('teacherId', 'fullName info.subject') // Include teacher info for display
            .sort({ createdAt: -1 });

        // Get student's completed sessions
        const completedSessions = await Session.find({
            user: student._id,
            status: { $in: ['completed', 'terminated'] }
        }).select('exam status');

        // Create a map of completed exam IDs
        const completedExamMap = {};
        completedSessions.forEach(session => {
            completedExamMap[session.exam.toString()] = session.status;
        });

        // Add completion status to each exam
        const examsWithStatus = exams.map(exam => {
            const examObj = exam.toObject();
            const examId = exam._id.toString();
            examObj.isCompleted = !!completedExamMap[examId];
            examObj.completionStatus = completedExamMap[examId] || null;
            return examObj;
        });

        console.log(`[GET_STUDENT_EXAMS] Found ${exams.length} exams, ${completedSessions.length} completed`);
        res.json(examsWithStatus);
    } catch (error) {
        console.error('[GET_STUDENT_EXAMS] Error:', error);
        res.status(500).json({ message: 'Error fetching tests', error: error.message });
    }
};
// Delete Exam
exports.deleteExam = async (req, res) => {
    try {
        const exam = await Exam.findOneAndDelete({ _id: req.params.id, teacherId: req.user._id });
        if (!exam) return res.status(404).json({ message: 'Exam not found or unauthorized' });
        res.json({ message: 'Exam deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting exam', error: error.message });
    }
};

// --- IMAGE UPLOAD ---
exports.uploadQuestionImage = async (req, res) => {
    try {
        if (!req.cloudinaryResult) {
            return res.status(400).json({ message: "No image uploaded or upload failed" });
        }
        // Return the Cloudinary URL from the upload result
        res.json({ imageUrl: req.cloudinaryResult.secure_url });
    } catch (error) {
        console.error("Image Upload Error:", error);
        res.status(500).json({ message: "Failed to upload image" });
    }
};

// --- PROCTORING (VIOLATIONS) ---
// --- PROCTORING (VIOLATIONS) ---
exports.logViolation = async (req, res) => {
    try {
        const { sessionId, type } = req.body;

        const session = await Session.findById(sessionId);
        if (!session) return res.status(404).json({ message: "Session not found" });

        // Add violation
        const violation = {
            type,
            timestamp: new Date()
        };
        session.violations.push(violation);

        // Check if this violation should lock the exam
        if (type.startsWith("LOCKED:") || type === 'screen_share_stopped') {
            session.isLocked = true;
            session.lockReason = type.replace("LOCKED: ", "");
        }

        await session.save();

        console.log(`[PROCTORING VIOLATION] Session: ${sessionId}, Type: ${type}, User: ${req.user.fullName}`);
        res.json({ success: true, session });
    } catch (error) {
        console.error("Log Violation Error:", error);
        res.status(500).json({ message: "Failed to log violation" });
    }
};



// Get Student Results (History)
exports.getStudentResults = async (req, res) => {
    try {
        const Session = require('../models/Session');

        const results = await Session.find({ user: req.user._id, status: 'completed' })
            .populate({
                path: 'exam',
                select: 'title subject totalMarks questions'
            })
            .sort({ endTime: -1 });

        const formattedResults = results.map(session => ({
            _id: session._id,
            examTitle: session.exam?.title || 'Unknown Exam',
            subject: session.exam?.subject || 'General',
            score: session.score,
            totalMarks: session.exam?.totalMarks || 100,
            submittedAt: session.endTime,
            grade: (session.score / (session.exam?.totalMarks || 100)) * 100 >= 50 ? 'Pass' : 'Fail'
        }));

        res.json(formattedResults);
    } catch (error) {
        console.error("Error fetching results:", error);
        res.status(500).json({ message: 'Error fetching results' });
    }
};

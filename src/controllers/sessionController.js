const Session = require('../models/Session');
const Exam = require('../models/Exam');
const User = require('../models/User');

// Get all active sessions for a specific exam (for teacher monitoring)
exports.getExamSessions = async (req, res) => {
    try {
        const { examId } = req.params;

        // Verify teacher owns this exam
        const exam = await Exam.findById(examId);
        if (!exam) {
            return res.status(404).json({ message: 'Exam not found' });
        }

        if (exam.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        // Normalize class level for matching
        const examClass = exam.classLevel;
        const normalizedClass = examClass.replace(/\s+/g, ''); // "SS2"
        const spacedClass = normalizedClass.replace(/([a-zA-Z]+)(\d+)/, '$1 $2'); // "SS 2"

        // Get all students in the exam's class level (checking variations)
        const allStudents = await User.find({
            role: 'student',
            'info.classLevel': { $in: [examClass, normalizedClass, spacedClass] },
            schoolId: exam.schoolId
        }).select('fullName username info.classLevel profilePicture');

        // Get all sessions for this exam
        const sessions = await Session.find({ exam: examId })
            .populate('user', 'fullName username info.classLevel profilePicture')
            .populate('exam', 'title durationMinutes')
            .sort({ startTime: -1 });

        // Create a map of sessions by student ID
        const sessionMap = {};
        sessions.forEach(session => {
            if (session.user && session.user._id) {
                sessionMap[session.user._id.toString()] = session;
            }
        });

        // Format all students with their session status
        const allStudentData = allStudents.map(student => {
            const session = sessionMap[student._id.toString()];

            if (session) {
                // Student has started the exam
                const violationCount = session.violations?.length || 0;
                const criticalViolations = session.violations?.filter(v =>
                    ['face_not_visible', 'multiple_faces', 'excessive_talking'].includes(v.type)
                ).length || 0;

                return {
                    _id: session._id,
                    student: {
                        id: student._id,
                        name: student.fullName,
                        username: student.username,
                        classLevel: student.info?.classLevel,
                        profilePicture: student.profilePicture
                    },
                    status: session.status,
                    isLocked: session.isLocked,
                    lockReason: session.lockReason,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    score: session.score,
                    percentage: session.percentage,
                    violationCount,
                    criticalViolations,
                    violations: session.violations,
                    answers: session.answers ? Object.keys(session.answers).length : 0,
                    totalQuestions: exam.questions?.length || 0,
                    hasStarted: true
                };
            } else {
                // Student has not started the exam
                return {
                    _id: null,
                    student: {
                        id: student._id,
                        name: student.fullName,
                        username: student.username,
                        classLevel: student.info?.classLevel,
                        profilePicture: student.profilePicture
                    },
                    status: 'not_started',
                    isLocked: false,
                    lockReason: null,
                    startTime: null,
                    endTime: null,
                    score: null,
                    percentage: null,
                    violationCount: 0,
                    criticalViolations: 0,
                    violations: [],
                    answers: 0,
                    totalQuestions: exam.questions?.length || 0,
                    hasStarted: false
                };
            }
        });

        res.json(allStudentData);
    } catch (error) {
        console.error('Error fetching exam sessions:', error);
        res.status(500).json({ message: 'Error fetching sessions', error: error.message });
    }
};

// Unlock a student's session (teacher action)
exports.unlockSession = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await Session.findById(sessionId).populate('exam');
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Verify teacher owns the exam
        if (session.exam.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        session.isLocked = false;
        session.lockReason = '';
        await session.save();

        // Emit socket event to notify student in their session room
        const io = req.app.get('io');
        io.to(`session_${session._id}`).emit('session_unlocked', {
            sessionId: session._id,
            message: 'Your exam has been unlocked by the teacher'
        });
        console.log(`[UNLOCK] Session ${session._id} unlocked, notification sent`);

        res.json({ message: 'Session unlocked successfully', session });
    } catch (error) {
        console.error('Error unlocking session:', error);
        res.status(500).json({ message: 'Error unlocking session', error: error.message });
    }
};

// Force submit a student's exam (teacher action)
exports.forceSubmitSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { reason } = req.body;

        const session = await Session.findById(sessionId).populate('exam');
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Verify teacher owns the exam
        if (session.exam.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        if (session.status === 'completed') {
            return res.status(400).json({ message: 'Session already completed' });
        }

        // Calculate score based on current answers
        const exam = session.exam;
        let correctCount = 0;
        const answers = session.answers || {};

        exam.questions.forEach((question, index) => {
            const studentAnswer = answers[index];
            if (studentAnswer !== undefined) {
                let correctOnes = question.correctOptions || [];
                if (correctOnes.length === 0 && question.correctOption !== undefined) {
                    correctOnes = [question.correctOption];
                }

                if (Array.isArray(studentAnswer)) {
                    if (studentAnswer.length === correctOnes.length &&
                        studentAnswer.every(val => correctOnes.includes(val))) {
                        correctCount++;
                    }
                } else {
                    if (correctOnes.includes(studentAnswer)) {
                        correctCount++;
                    }
                }
            }
        });

        const totalQuestions = exam.questions.length;
        const totalMarks = exam.totalMarks || 100;
        const scaledScore = (correctCount / totalQuestions) * totalMarks;

        session.score = scaledScore;
        session.percentage = (correctCount / totalQuestions) * 100;
        session.status = 'terminated';
        session.endTime = new Date();
        session.lockReason = reason || 'Force submitted by teacher';
        session.isLocked = true;

        await session.save();

        // Emit socket event to notify student
        const io = req.app.get('io');
        io.emit('session_force_submitted', { sessionId: session._id, reason: session.lockReason });

        res.json({
            message: 'Session force submitted successfully',
            session,
            score: scaledScore.toFixed(1),
            percentage: session.percentage.toFixed(2)
        });
    } catch (error) {
        console.error('Error force submitting session:', error);
        res.status(500).json({ message: 'Error force submitting session', error: error.message });
    }
};

// Lock a student's session (teacher action)
exports.lockSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { reason } = req.body;

        const session = await Session.findById(sessionId).populate('exam');
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Verify teacher owns the exam
        if (session.exam.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        session.isLocked = true;
        session.lockReason = reason || 'Locked by teacher';
        await session.save();

        // Emit socket event to notify student in their session room
        const io = req.app.get('io');
        io.to(`session_${session._id}`).emit('session_locked', {
            sessionId: session._id,
            reason: session.lockReason,
            message: 'Your exam has been locked by the teacher'
        });
        console.log(`[LOCK] Session ${session._id} locked, notification sent`);

        res.json({ message: 'Session locked successfully', session });
    } catch (error) {
        console.error('Error locking session:', error);
        res.status(500).json({ message: 'Error locking session', error: error.message });
    }
};



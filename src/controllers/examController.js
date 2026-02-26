const Exam = require('../models/Exam');
const Session = require('../models/Session');

const User = require('../models/User');
const School = require('../models/School');
const Subscription = require('../models/Subscription');

// --- TEACHER ACTIONS ---

// Create Exam
exports.createExam = async (req, res) => {
    const { 
        title, durationMinutes, questions, subject, accessCode, 
        totalMarks, examType, proctoringSettings, startTime, endTime,
        negativeMarking, passingPercentage, passingScore 
    } = req.body;

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
            startTime,
            endTime,
            questions,
            subject,
            totalMarks: totalMarks || 0,
            passingScore: passingScore || 0,
            passingPercentage: passingPercentage || 50,
            negativeMarking: negativeMarking || 0,
            accessCode,
            classLevel: req.body.classLevel,
            teacherId: req.user._id,
            schoolId: req.user.schoolId,
            status: 'scheduled',
            isActive: false,
            examType: finalExamType,
            proctoringSettings: finalProctoringSettings
        });
        await exam.save();

        const { logActivity } = require('./adminController');
        await logActivity({
            schoolId: req.user.schoolId,
            userId: req.user._id,
            userName: req.user.fullName,
            userRole: req.user.role,
            action: 'EXAM_CREATED',
            metadata: { examId: exam._id, title: exam.title, subject: exam.subject },
            severity: 'medium'
        });

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

        const { logActivity } = require('./adminController');
        await logActivity({
            schoolId: req.user.schoolId,
            userId: req.user._id,
            userName: req.user.fullName,
            userRole: req.user.role,
            action: status === 'active' ? 'EXAM_STARTED' : status === 'ended' ? 'EXAM_ENDED' : 'EXAM_UPDATED',
            metadata: { examId: exam._id, title: exam.title, status: status },
            severity: 'medium'
        });

        res.json({ message: 'Test status updated', exam });
    } catch (error) {
        console.error(`[TOGGLE_STATUS] Error:`, error);
        res.status(500).json({ message: 'Error updating test', error: error.message });
    }
};



// --- STUDENT/SHARED ACTIONS ---

// GET /exam/results — teacher sees all results for their exams
exports.getTeacherResults = async (req, res) => {
    try {
        // Fetch all exams belonging to this teacher
        const exams = await Exam.find({ teacherId: req.user._id }).select('_id title subject classLevel totalMarks');
        const examIds = exams.map(e => e._id);

        // Fetch all completed sessions for those exams
        const sessions = await Session.find({ exam: { $in: examIds }, status: 'completed' })
            .populate('user', 'fullName username info.classLevel')
            .populate('exam', 'title subject totalMarks')
            .sort({ createdAt: -1 });

        const results = sessions.map(s => ({
            studentName: s.user?.fullName || s.user?.username || 'Student',
            studentId:   s.user?._id,
            examId:      s.exam?._id,
            examTitle:   s.exam?.title,
            subject:     s.exam?.subject,
            score:       s.score,
            totalMarks:  s.exam?.totalMarks || 100,
            percentage:  s.percentage,
            submittedAt: s.endTime || s.updatedAt,
        }));

        res.json(results);
    } catch (err) {
        console.error('[GET_TEACHER_RESULTS]', err);
        res.status(500).json({ message: 'Failed to fetch results', error: err.message });
    }
};


exports.getAvailableExams = async (req, res) => {
    try {
        const userId = req.user._id;
        const student = await User.findById(userId);
        if (!student) return res.status(404).json({ message: 'User not found' });
        
        const schoolId = student.schoolId;
        const studentClass = student.info?.classLevel;
        const studentGroup = student.info?.group;

        // Fetch ALL exams in this school — both active AND scheduled so students can see upcoming ones
        const exams = await Exam.find({
            schoolId,
            status: { $in: ['active', 'scheduled'] }
        }).select('title subject durationMinutes teacherId examType proctoringSettings totalMarks questions groups startTime endTime classLevel status isActive');

        const now = new Date();
        const availableExams = [];

        const sessions = await Session.find({ user: userId });
        const takenExamIds = sessions.map(s => s.exam.toString());

        for (const exam of exams) {
            // Already completed? Skip
            if (takenExamIds.includes(exam._id.toString())) continue;

            // Class level filter: only restrict if teacher explicitly set a class
            if (exam.classLevel && exam.classLevel.trim() !== '' && studentClass) {
                const normalize = s => s.replace(/\s+/g, '').toLowerCase();
                if (normalize(exam.classLevel) !== normalize(studentClass)) continue;
            }

            // Group filter
            if (exam.groups && exam.groups.length > 0) {
                if (!studentGroup || !exam.groups.includes(studentGroup)) continue;
            }

            // End time passed? Skip
            if (exam.endTime && exam.endTime < now) continue;

            availableExams.push({
                ...exam.toObject(),
                questionCount: exam.questions.length,
                questions: undefined,
                canStart: exam.status === 'active' && exam.isActive // student can only START if active
            });
        }

        res.json(availableExams);
    } catch (error) {
        console.error('Get Available Exams Error:', error);
        res.status(500).json({ message: 'Error fetching available tests' });
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

        const { logActivity } = require('./adminController');
        await logActivity({
            schoolId: req.user.schoolId,
            userId: userId,
            userName: req.user.fullName,
            userRole: req.user.role,
            action: 'EXAM_SESSION_START',
            metadata: { examId: examId, title: exam.title },
            severity: 'low'
        });

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
        let totalScore = 0;
        let correctCount = 0;
        let wrongCount = 0;
        let totalPossibleMarks = 0;

        // Calculate Score
        exam.questions.forEach((question, index) => {
            const studentAnswer = answers[index];
            const qMarks = question.marks || 1;
            totalPossibleMarks += qMarks;

            let isCorrect = false;

            if (question.type === 'mcq' || question.type === 'true_false' || !question.type) {
                // MCQ / T-F logic
                let correctOnes = question.correctOptions || [];
                if (correctOnes.length === 0 && (question.correctOption !== undefined && question.correctOption !== null)) {
                    correctOnes = [question.correctOption];
                }

                if (Array.isArray(studentAnswer)) {
                    isCorrect = studentAnswer.length === correctOnes.length &&
                        studentAnswer.every(val => correctOnes.includes(val));
                } else {
                    isCorrect = correctOnes.includes(studentAnswer);
                }
            } else if (question.type === 'fib') {
                // Fill in the blank (string match)
                isCorrect = studentAnswer?.toString().trim().toLowerCase() === question.correctAnswer?.trim().toLowerCase();
            } else if (question.type === 'essay') {
                // Essay logic - for now auto-mark as correct if not empty (Placeholder)
                isCorrect = !!studentAnswer?.toString().trim();
            }

            if (isCorrect) {
                totalScore += qMarks;
                correctCount++;
            } else if (studentAnswer !== undefined && studentAnswer !== null && studentAnswer !== '') {
                // Wrong answer - apply negative marking
                totalScore -= (exam.negativeMarking || 0);
                wrongCount++;
            }
        });

        // Prevent negative results
        totalScore = Math.max(0, totalScore);
        
        // Target calculation
        const resultPercentage = totalPossibleMarks > 0 ? (totalScore / totalPossibleMarks) * 100 : 0;

        session.answers = answers;
        session.score = totalScore; 
        session.percentage = resultPercentage;
        session.status = 'completed';
        session.endTime = new Date();

        await session.save();

        const { logActivity } = require('./adminController');
        await logActivity({
            schoolId: req.user.schoolId,
            userId: req.user._id,
            userName: req.user.fullName,
            userRole: req.user.role,
            action: 'EXAM_SUBMIT',
            metadata: { examId: exam._id, title: exam.title, score: totalScore, percentage: resultPercentage },
            severity: 'medium'
        });

        // AUTO-UPDATE STUDENT RECORD WITH TEST SCORE BY SUBJECT
        try {
            const StudentRecord = require('../models/StudentRecord');
            const User = require('../models/User');

            // Get student info
            const student = await User.findById(req.user._id);

            // Normalize subject name
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

            // Update test score for this subject
            if (record.testScores && record.testScores.hasOwnProperty(subjectKey)) {
                record.testScores[subjectKey] = session.percentage;
                await record.save();
                console.log(`[AUTO-UPDATE] Updated ${exam.subject} score for ${student.fullName}: ${session.percentage}%`);
            }
        } catch (recordError) {
            console.error('[AUTO-UPDATE] Error updating student record:', recordError);
        }

        res.json({
            message: 'Test submitted and marked successfully',
            score: totalScore.toFixed(1),
            total: totalPossibleMarks,
            correctCount,
            wrongCount,
            percentage: session.percentage.toFixed(2)
        });
    } catch (error) {
        console.error('=== SUBMIT EXAM ERROR ===', error);
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
        const { 
            title, subject, durationMinutes, totalMarks, questions, 
            examType, proctoringSettings, classLevel, startTime, endTime,
            negativeMarking, passingPercentage, passingScore 
        } = req.body;

        const exam = await Exam.findById(id);
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        // Authorization Check
        if (exam.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to edit this test' });
        }

        // Apply updates
        exam.title = title || exam.title;
        exam.subject = subject || exam.subject;
        exam.durationMinutes = durationMinutes || exam.durationMinutes;
        exam.startTime = startTime || exam.startTime;
        exam.endTime = endTime || exam.endTime;
        exam.totalMarks = totalMarks || exam.totalMarks;
        exam.questions = questions || exam.questions;
        exam.classLevel = classLevel || exam.classLevel;
        exam.examType = examType || exam.examType;
        exam.negativeMarking = negativeMarking !== undefined ? negativeMarking : exam.negativeMarking;
        exam.passingPercentage = passingPercentage || exam.passingPercentage;
        exam.passingScore = passingScore || exam.passingScore;

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

// Get Exams for Students — shows ALL exams (active + scheduled) in their school
exports.getStudentExams = async (req, res) => {
    try {
        const student = req.user;
        const studentClass = student.info?.classLevel;

        console.log(`[GET_STUDENT_EXAMS] Student: ${student.username}, Class: ${studentClass}, School: ${student.schoolId}`);

        // Fetch active AND scheduled exams so students can see upcoming exams too
        const exams = await Exam.find({
            schoolId: student.schoolId,
            status: { $in: ['active', 'scheduled'] }
        })
            .populate('teacherId', 'fullName info.subject')
            .sort({ createdAt: -1 });

        // Get student's sessions
        const sessions = await Session.find({
            user: student._id
        }).select('exam status');

        const sessionMap = {};
        sessions.forEach(s => { sessionMap[s.exam.toString()] = s.status; });

        const normalize = s => (s || '').replace(/\s+/g, '').toLowerCase();

        // Filter by class — only if teacher set a class. Blank class = open to all
        const filteredExams = exams.filter(exam => {
            const cl = exam.classLevel?.trim();
            if (!cl) return true;
            if (!studentClass) return true;
            return normalize(cl) === normalize(studentClass);
        });

        const examsWithStatus = filteredExams.map(exam => {
            const examObj = exam.toObject();
            const examId = exam._id.toString();
            const sessionStatus = sessionMap[examId];
            examObj.isCompleted = sessionStatus === 'completed';
            examObj.isTerminated = sessionStatus === 'terminated';
            examObj.completionStatus = sessionStatus || null;
            examObj.canStart = exam.status === 'active' && exam.isActive && !sessionStatus;
            return examObj;
        });

        console.log(`[GET_STUDENT_EXAMS] Returning ${examsWithStatus.length} exams (${sessions.length} sessions found)`);
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

        const { logActivity } = require('./adminController');
        await logActivity({
            schoolId: req.user.schoolId,
            userId: req.user._id,
            userName: req.user.fullName,
            userRole: req.user.role,
            action: 'EXAM_VIOLATION',
            metadata: { 
                sessionId: sessionId, 
                violationType: type, 
                examId: session.exam,
                isLocked: session.isLocked 
            },
            severity: type.startsWith('LOCKED') ? 'critical' : 'high'
        });

        console.log(`[PROCTORING VIOLATION] Session: ${sessionId}, Type: ${type}, User: ${req.user.fullName}`);
        res.json({ success: true, session });
    } catch (error) {
        console.error("Log Violation Error:", error);
        res.status(500).json({ message: "Failed to log violation" });
    }
};



// --- BULK UPLOAD & EXPORT ---
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { Readable } = require('stream');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

exports.bulkUploadQuestions = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'File is required' });

        let questions = [];
        const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

        if (fileExtension === 'csv') {
            const results = [];
            const stream = Readable.from(req.file.buffer);
            await new Promise((resolve, reject) => {
                stream.pipe(csv())
                    .on('data', (data) => results.push(data))
                    .on('end', () => {
                        questions = results.map(row => ({
                            text: row.text || row.Question || row.question,
                            type: (row.type || row.Type || 'mcq').toLowerCase(),
                            options: [row.option1, row.option2, row.option3, row.option4, row.option5].filter(Boolean),
                            correctOptions: row.correctIndex !== undefined ? [parseInt(row.correctIndex)] : [],
                            correctAnswer: row.correctAnswer || row.Answer || row.answer,
                            marks: parseInt(row.marks) || 1
                        }));
                        resolve();
                    })
                    .on('error', reject);
            });
        } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            questions = data.map(row => ({
                text: row.text || row.Question || row.question,
                type: (row.type || row.Type || 'mcq').toLowerCase(),
                options: [row.option1, row.option2, row.option3, row.option4, row.option5].filter(Boolean),
                correctOptions: row.correctIndex !== undefined ? [parseInt(row.correctIndex)] : [],
                correctAnswer: row.correctAnswer || row.Answer || row.answer,
                marks: parseInt(row.marks) || 1
            }));
        } else {
            return res.status(400).json({ message: 'Invalid file format. Use CSV or Excel.' });
        }

        res.json({ message: 'File processed successfully', questions });
    } catch (error) {
        console.error('Bulk Upload Error:', error);
        res.status(500).json({ message: 'Error processing bulk upload', error: error.message });
    }
};

exports.exportExamResults = async (req, res) => {
    const { examId } = req.params;
    const { format } = req.query; // 'csv' or 'pdf'
    try {
        const sessions = await Session.find({ exam: examId, status: 'completed' }).populate('user');
        const exam = await Exam.findById(examId);
        
        if (!exam) return res.status(404).json({ message: 'Exam not found' });

        if (format === 'csv') {
            const fields = [
                { label: 'Student Name', value: 'user.fullName' },
                { label: 'Login ID', value: 'user.uniqueLoginId' },
                { label: 'Score', value: 'score' },
                { label: 'Percentage', value: 'percentage' },
                { label: 'Date Submitted', value: 'endTime' }
            ];
            const json2csvParser = new Parser({ fields });
            const csvData = json2csvParser.parse(sessions);
            
            res.header('Content-Type', 'text/csv');
            res.attachment(`${exam.title}_results.csv`);
            return res.send(csvData);
        } else if (format === 'pdf') {
            const doc = new PDFDocument();
            res.header('Content-Type', 'application/pdf');
            res.attachment(`${exam.title}_results.pdf`);
            doc.pipe(res);

            // Header
            doc.fontSize(20).fillColor('#D4AF37').text('KICC CBT - Exam Results', { align: 'center' });
            doc.fontSize(14).fillColor('black').text(`Exam: ${exam.title}`, { align: 'center' });
            doc.fontSize(12).text(`Subject: ${exam.subject} | Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
            doc.moveDown();
            doc.strokeColor('#D4AF37').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            // Table Header
            doc.fontSize(12).text('S/N | Student Name | ID | Score | %', { bold: true });
            doc.moveDown(0.5);

            sessions.forEach((s, i) => {
                doc.fontSize(10).text(`${i + 1}. ${s.user.fullName} | ${s.user.uniqueLoginId} | ${s.score.toFixed(1)} | ${s.percentage.toFixed(2)}%`);
                if (doc.y > 700) doc.addPage();
            });

            doc.end();
        } else {
            res.status(400).json({ message: 'Invalid format requested. Use csv or pdf.' });
        }
    } catch (error) {
        console.error('Export Error:', error);
        res.status(500).json({ message: 'Failed to export results' });
    }
};



// --- AI FEATURES ---
const aiService = require('../utils/aiService');

exports.generateAIQuestions = async (req, res) => {
    try {
        const { subject, topic, classLevel, count, type } = req.body;
        const questions = await aiService.generateQuestions({ subject, topic, classLevel, count, type });
        res.json({ questions });
    } catch (error) {
        console.error('AI Generation Error:', error);
        res.status(500).json({ message: 'Failed to generate questions using AI' });
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

        const formattedResults = results.map(session => {
            const totalMarks = session.exam?.totalMarks || 0;
            return {
                _id: session._id,
                examTitle: session.exam?.title || 'Unknown Exam',
                subject: session.exam?.subject || 'General',
                score: session.score,
                totalMarks,
                percentage: session.percentage,
                submittedAt: session.endTime,
                grade: session.percentage >= 50 ? 'Pass' : 'Fail'
            };
        });

        res.json(formattedResults);
    } catch (error) {
        console.error("Error fetching results:", error);
        res.status(500).json({ message: 'Error fetching results' });
    }
};

// Update Manual Grade for Essays
exports.updateManualGrade = async (req, res) => {
    try {
        const { sessionId, grades } = req.body; // grades: [{ questionIndex, marksEarned }]
        const session = await Session.findById(sessionId).populate('exam');
        if (!session) return res.status(404).json({ message: 'Session not found' });

        // Security: Only owner of exam can grade
        if (session.exam.teacherId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to grade this session' });
        }

        if (!session.manualGrades) session.manualGrades = {};
        
        let scoreAdjustment = 0;

        grades.forEach(({ questionIndex, marksEarned }) => {
            const oldManualScore = session.manualGrades[questionIndex] || 0;
            session.manualGrades[questionIndex] = marksEarned;
            scoreAdjustment += (marksEarned - oldManualScore);
        });

        session.markModified('manualGrades');

        // Update total score and percentage
        session.score = Math.max(0, (session.score || 0) + scoreAdjustment);
        session.percentage = (session.score / (session.exam.totalMarks || 1)) * 100;

        await session.save();
        res.json({ message: 'Grades updated successfully', score: session.score, percentage: session.percentage });
    } catch (error) {
        console.error('Manual Grading Error:', error);
        res.status(500).json({ message: 'Failed to update grades' });
    }
};

// Download Bulk Upload Template
exports.getBulkUploadTemplateCsv = async (req, res) => {
    try {
        const fields = ['text', 'type', 'option1', 'option2', 'option3', 'option4', 'correctIndex', 'marks'];
        const sampleData = [
            { text: 'Sample MCQ Question?', type: 'mcq', option1: 'Choice A', option2: 'Choice B', option3: 'Choice C', option4: 'Choice D', correctIndex: 0, marks: 2 },
            { text: 'Sample FIB Question: The capital of Nigeria is __________.', type: 'fib', option1: '', option2: '', option3: '', option4: '', correctIndex: '', marks: 2 },
            { text: 'Sample Essay: Discuss the impact of technology in education.', type: 'essay', option1: '', option2: '', option3: '', option4: '', correctIndex: '', marks: 5 }
        ];

        const { Parser } = require('json2csv');
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(sampleData);

        res.header('Content-Type', 'text/csv');
        res.attachment('bulk_question_template.csv');
        res.send(csv);
    } catch (error) {
        console.error('Template Error:', error);
        res.status(500).json({ message: 'Failed to generate template' });
    }
};

// Get sessions that have essay questions for grading
exports.getExamsForGrading = async (req, res) => {
    try {
        // Find exams created by this teacher that have essay questions
        const exams = await Exam.find({ teacherId: req.user._id, 'questions.type': 'essay' });
        const examIds = exams.map(e => e._id);

        // Find completed sessions for these exams
        const sessions = await Session.find({ 
            exam: { $in: examIds }, 
            status: 'completed' 
        }).populate('user').populate('exam');

        res.json(sessions);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching grading tasks' });
    }
};

const StudentRecord = require('../models/StudentRecord');
const User = require('../models/User');
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');

// Get all student records for a class/school
exports.getStudentRecords = async (req, res) => {
    try {
        const { classLevel, term, academicYear } = req.query;
        const teacherId = req.user._id;
        const schoolId = req.user.schoolId;

        // Build query
        const query = { schoolId };
        if (classLevel) query.classLevel = classLevel;
        if (term) query.term = term;
        if (academicYear) query.academicYear = academicYear;

        const records = await StudentRecord.find(query)
            .populate('student', 'fullName gender info.registrationNumber info.classLevel profilePicture')
            .sort({ classLevel: 1, fullName: 1 });

        res.json(records);
    } catch (error) {
        console.error('Error fetching student records:', error);
        res.status(500).json({ message: 'Error fetching student records', error: error.message });
    }
};

// Get or create a single student record
exports.getOrCreateStudentRecord = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { term, academicYear } = req.query;

        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        let record = await StudentRecord.findOne({
            student: studentId,
            term: term || 'Current Term',
            academicYear: academicYear || '2025/2026'
        });

        if (!record) {
            // Create new record
            record = new StudentRecord({
                student: studentId,
                schoolId: student.schoolId,
                fullName: student.fullName,
                registrationNumber: student.info?.registrationNumber || 'N/A',
                gender: student.gender,
                classLevel: student.info?.classLevel,
                term: term || 'Current Term',
                academicYear: academicYear || '2025/2026'
            });
            await record.save();
        }

        res.json(record);
    } catch (error) {
        console.error('Error getting/creating student record:', error);
        res.status(500).json({ message: 'Error processing request', error: error.message });
    }
};

// Update student record (subject scores, remarks, etc.)
exports.updateStudentRecord = async (req, res) => {
    try {
        const { recordId } = req.params;
        const updates = req.body;
        const teacherId = req.user._id;

        // Prevent editing of protected fields
        delete updates.testScore;
        delete updates.attendanceScore;
        delete updates.examScore;
        delete updates.registrationNumber;
        delete updates.student;
        delete updates.schoolId;

        const record = await StudentRecord.findByIdAndUpdate(
            recordId,
            {
                ...updates,
                lastUpdatedBy: teacherId
            },
            { new: true, runValidators: true }
        );

        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        res.json({ message: 'Record updated successfully', record });
    } catch (error) {
        console.error('Error updating student record:', error);
        res.status(500).json({ message: 'Error updating record', error: error.message });
    }
};

// Bulk update student records
exports.bulkUpdateRecords = async (req, res) => {
    try {
        const { updates } = req.body; // Array of { recordId, data }
        const teacherId = req.user._id;

        const results = [];
        for (const update of updates) {
            const { recordId, data } = update;

            // Prevent editing of protected fields
            delete data.testScore;
            delete data.attendanceScore;
            delete data.examScore;
            delete data.registrationNumber;

            const record = await StudentRecord.findByIdAndUpdate(
                recordId,
                {
                    ...data,
                    lastUpdatedBy: teacherId
                },
                { new: true }
            );

            results.push(record);
        }

        res.json({ message: 'Records updated successfully', records: results });
    } catch (error) {
        console.error('Error bulk updating records:', error);
        res.status(500).json({ message: 'Error updating records', error: error.message });
    }
};

// Sync automated scores (test, attendance, exam)
exports.syncAutomatedScores = async (req, res) => {
    try {
        const { studentId, term, academicYear } = req.body;

        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Get or create record
        let record = await StudentRecord.findOne({
            student: studentId,
            term: term || 'Current Term',
            academicYear: academicYear || '2025/2026'
        });

        if (!record) {
            record = new StudentRecord({
                student: studentId,
                schoolId: student.schoolId,
                fullName: student.fullName,
                registrationNumber: student.info?.registrationNumber || 'N/A',
                gender: student.gender,
                classLevel: student.info?.classLevel,
                term: term || 'Current Term',
                academicYear: academicYear || '2025/2026'
            });
        }

        // Calculate test score (average of all completed CBT exams)
        const completedSessions = await Session.find({
            user: studentId,
            status: 'completed'
        }).populate('exam', 'totalMarks');

        if (completedSessions.length > 0) {
            const totalScore = completedSessions.reduce((sum, session) => sum + (session.score || 0), 0);
            const totalPossible = completedSessions.reduce((sum, session) => sum + (session.exam?.totalMarks || 100), 0);
            record.testScore = (totalScore / totalPossible) * 100; // Normalize to 100
        }

        // Calculate attendance score
        const attendanceRecords = await Attendance.find({
            student: studentId,
            date: { $gte: new Date(new Date().getFullYear(), 0, 1) } // This year
        });

        if (attendanceRecords.length > 0) {
            const presentCount = attendanceRecords.filter(a => a.status === 'present').length;
            record.attendanceScore = (presentCount / attendanceRecords.length) * 100;
        }

        await record.save();

        res.json({ message: 'Automated scores synced successfully', record });
    } catch (error) {
        console.error('Error syncing automated scores:', error);
        res.status(500).json({ message: 'Error syncing scores', error: error.message });
    }
};

// Initialize records for all students in a class
exports.initializeClassRecords = async (req, res) => {
    try {
        const { classLevel, term, academicYear } = req.body;
        const schoolId = req.user.schoolId;

        // Get all students in the class
        const students = await User.find({
            role: 'student',
            schoolId,
            'info.classLevel': classLevel
        });

        const records = [];
        for (const student of students) {
            let record = await StudentRecord.findOne({
                student: student._id,
                term: term || 'Current Term',
                academicYear: academicYear || '2025/2026'
            });

            if (!record) {
                record = new StudentRecord({
                    student: student._id,
                    schoolId: student.schoolId,
                    fullName: student.fullName,
                    registrationNumber: student.info?.registrationNumber || 'N/A',
                    gender: student.gender,
                    classLevel: student.info?.classLevel,
                    term: term || 'Current Term',
                    academicYear: academicYear || '2025/2026'
                });
                await record.save();
            }

            records.push(record);
        }

        res.json({ message: `Initialized ${records.length} student records`, records });
    } catch (error) {
        console.error('Error initializing class records:', error);
        res.status(500).json({ message: 'Error initializing records', error: error.message });
    }
};

// Publish/Unpublish subject scores for a class
exports.publishSubject = async (req, res) => {
    try {
        const { classLevel, subject, publish } = req.body;
        const teacher = req.user;
        const schoolId = teacher.schoolId;

        // Check if teacher teaches this subject
        const teacherSubjects = teacher.info?.subjects || [];
        const normalizedTeacherSubjects = teacherSubjects.map(s => s.toLowerCase().replace(/\s+/g, ''));
        const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '');

        if (!normalizedTeacherSubjects.includes(normalizedSubject)) {
            return res.status(403).json({
                message: `You are not authorized to publish ${subject}. You teach: ${teacherSubjects.join(', ')}`
            });
        }

        // Update all records for this class
        const updateField = {};
        updateField[`publishedSubjects.${normalizedSubject}`] = publish;

        const result = await StudentRecord.updateMany(
            { schoolId, classLevel },
            { $set: updateField }
        );

        res.json({
            message: `${subject} scores ${publish ? 'published' : 'unpublished'} for ${classLevel}`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Error publishing subject:', error);
        res.status(500).json({ message: 'Error publishing subject', error: error.message });
    }
};

// Update exam score for a specific subject (only if published and teacher teaches it)
exports.updateExamScore = async (req, res) => {
    try {
        const { recordId } = req.params;
        const { subject, score } = req.body;
        const teacher = req.user;

        // Get the record
        const record = await StudentRecord.findById(recordId);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        // Normalize subject name
        const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '');

        // Check if teacher teaches this subject
        const teacherSubjects = teacher.info?.subjects || [];
        const normalizedTeacherSubjects = teacherSubjects.map(s => s.toLowerCase().replace(/\s+/g, ''));

        if (!normalizedTeacherSubjects.includes(normalizedSubject)) {
            return res.status(403).json({
                message: `You are not authorized to edit ${subject}. You teach: ${teacherSubjects.join(', ')}`
            });
        }

        // Check if subject is published
        if (!record.publishedSubjects[normalizedSubject]) {
            return res.status(403).json({
                message: `${subject} scores are not published yet. Please publish them first.`
            });
        }

        // Update the exam score
        record.examScores[normalizedSubject] = score;
        record.lastUpdatedBy = teacher._id;
        await record.save();

        res.json({
            message: `${subject} exam score updated successfully`,
            record
        });
    } catch (error) {
        console.error('Error updating exam score:', error);
        res.status(500).json({ message: 'Error updating exam score', error: error.message });
    }
};

// Get records with teacher permissions (shows which subjects they can edit)
exports.getRecordsWithPermissions = async (req, res) => {
    try {
        const { classLevel, term, academicYear } = req.query;
        const teacher = req.user;
        const schoolId = teacher.schoolId;

        // Build query
        const query = { schoolId };
        if (classLevel) query.classLevel = classLevel;
        if (term) query.term = term;
        if (academicYear) query.academicYear = academicYear;

        const records = await StudentRecord.find(query)
            .populate('student', 'fullName gender info.registrationNumber info.classLevel profilePicture')
            .sort({ classLevel: 1, fullName: 1 });

        // Add permission info for each record
        const teacherSubjects = teacher.info?.subjects || [];
        const normalizedTeacherSubjects = teacherSubjects.map(s => s.toLowerCase().replace(/\s+/g, ''));

        const recordsWithPermissions = records.map(record => {
            const recordObj = record.toObject();

            // Add editableSubjects array
            recordObj.editableSubjects = normalizedTeacherSubjects.filter(subject =>
                record.publishedSubjects[subject]
            );

            // Add viewableSubjects (all subjects teacher teaches)
            recordObj.viewableSubjects = normalizedTeacherSubjects;

            return recordObj;
        });

        res.json({
            records: recordsWithPermissions,
            teacherSubjects: teacherSubjects
        });
    } catch (error) {
        console.error('Error fetching records with permissions:', error);
        res.status(500).json({ message: 'Error fetching records', error: error.message });
    }
};

module.exports = exports;

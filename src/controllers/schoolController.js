const School = require('../models/School');
const User = require('../models/User');
const Invite = require('../models/Invite');
const VerificationToken = require('../models/VerificationToken');
const crypto = require('crypto');
const mongoose = require('mongoose'); // Added mongoose
const { generateUniqueId } = require('../utils/idGenerator');
const { sendVerificationEmail } = require('../utils/emailService');
const Attendance = require('../models/Attendance');
const StaffAttendance = require('../models/StaffAttendance');

// 1. Register School With Strict Security
exports.registerSchool = async (req, res) => {
    const { schoolName, schoolEmail, phone, address, location, adminName, adminPassword } = req.body;

    // Check for file (Cloudinary)
    if (!req.file || !req.file.path) {
        return res.status(400).json({ message: 'School Logo is required (Image upload)' });
    }
    const logoUrl = req.file.path;

    try {
        const existingSchool = await School.findOne({ email: schoolEmail });
        if (existingSchool) return res.status(400).json({ message: 'School email already exists' });

        // Generate Dual IDs
        const schoolLoginId = generateUniqueId('SCH'); // SCH-XXXXXX
        const schoolRefId = generateUniqueId('REF');   // REF-XXXXXX

        // Parse location if it comes as stringified JSON from FormData
        let parsedLocation = location;
        if (typeof location === 'string') {
            try { parsedLocation = JSON.parse(location); } catch (e) { }
        }

        // Create School (Verified: false initially)
        const school = new School({
            name: schoolName,
            email: schoolEmail,
            phone,
            address,
            location: parsedLocation,
            logoUrl, // SAVED HERE
            adminContact: adminName,
            schoolLoginId,
            schoolRefId,
            verified: false // Must verify email
        });
        await school.save();

        // Create School Admin User
        const admin = new User({
            uniqueLoginId: schoolLoginId, // Admin uses School Login ID
            email: schoolEmail, // SAVE EMAIL for login verification
            password: adminPassword,
            fullName: adminName,
            role: 'school_admin',
            schoolId: school._id,
            verified: false, // matches school
            status: 'verified' // Internal status is verified, but needs email verification
        });
        await admin.save();

        // Generate Verification Token
        const token = crypto.randomBytes(32).toString('hex');
        const verificationToken = new VerificationToken({
            userId: school._id, // Verify the School entity
            modelType: 'School',
            token,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        });
        await verificationToken.save();

        // Send Email
        await sendVerificationEmail(schoolEmail, token, {
            loginId: schoolLoginId,
            password: adminPassword
        });

        res.status(201).json({
            message: 'School registered! Please check your email to verify account.',
            schoolLoginId // Return this so they know what to login with later
        });
    } catch (error) {
        res.status(500).json({ message: 'Error registering school', error: error.message });
    }
};

// 2. Verify Email
exports.verifyEmail = async (req, res) => {
    const { token } = req.body;
    try {
        const vt = await VerificationToken.findOne({ token });
        if (!vt) return res.status(400).json({ message: 'Invalid token' });
        if (vt.expiresAt < Date.now()) return res.status(400).json({ message: 'Token expired' });

        if (vt.modelType === 'School') {
            const school = await School.findById(vt.userId);
            if (!school) return res.status(404).json({ message: 'School not found' });

            school.verified = true;
            await school.save();
            console.log(`[VERIFY] School verified: ${school.name} (${school._id})`);

            // Also verify the admin user linked to this school
            const updateResult = await User.updateMany({ schoolId: school._id, role: 'school_admin' }, { verified: true, status: 'verified' });
            console.log(`[VERIFY] Users updated: ${updateResult.modifiedCount} (Matched: ${updateResult.matchedCount})`);
        }

        await VerificationToken.deleteOne({ _id: vt._id });
        res.json({ message: 'Email verified successfully! You can now login.' });
    } catch (error) {
        console.error('[VERIFY] Error:', error);
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
};

// 3. Generate Invite for Teachers
exports.generateInvite = async (req, res) => {
    // ... existing logic but using schoolRefId in link if needed
    // For now standard token link is fine, but we enforce schoolRef on signup
    const { role, email } = req.body;
    try {
        const token = crypto.randomBytes(20).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const invite = new Invite({
            token,
            schoolId: req.user.schoolId,
            role: role || 'teacher',
            email,
            expiresAt
        });
        await invite.save();

        // Fetch school to get ref ID
        // const school = await School.findById(req.user.schoolId);
        // Link could be: /signup/teacher/TOKEN

        const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/signup/teacher/${token}`;
        res.json({ inviteLink, token });
    } catch (error) {
        res.status(500).json({ message: 'Error generating invite', error: error.message });
    }
};

// 4. Register Teacher (via Invite Token OR Registration Number)
exports.registerTeacher = async (req, res) => {
    let { token, fullName, password, subjects, phone, email, classLevel, registrationNumber, schoolRefId, schoolId, gender, dateOfBirth } = req.body;

    // Parse subjects if it's a JSON string (from FormData)
    if (typeof subjects === 'string') {
        try {
            subjects = JSON.parse(subjects);
        } catch (e) {
            subjects = [subjects]; // If single value, make it array
        }
    }

    // Get profile picture URL from uploaded file
    const profilePicture = req.file?.path || null;

    try {
        let school = null;
        let inviteRole = 'teacher';
        let inviteEmail = null;
        let isTokenValid = false;

        // Path A: Token Based (Invite)
        if (token) {
            let invite = await Invite.findOne({ token, used: false, expiresAt: { $gt: Date.now() } });
            if (!invite) {
                const schoolWithToken = await School.findOne({ inviteToken: token });
                if (schoolWithToken) {
                    invite = { schoolId: schoolWithToken._id, role: 'teacher', email: null, isPersistent: true };
                }
            }

            if (invite) {
                isTokenValid = true;
                school = await School.findById(invite.schoolId);
                inviteRole = invite.role;
                inviteEmail = invite.email;

                if (!invite.isPersistent) {
                    invite.used = true;
                    await invite.save();
                }
            }
        }

        // Path B: Public Link / Reg Number Based (No Token)
        if (!isTokenValid) {
            if (schoolId) {
                school = await School.findById(schoolId);
            } else if (schoolRefId) {
                school = await School.findOne({ schoolRefId: schoolRefId });
            }
            if (!school) return res.status(400).json({ message: 'Invalid School Link or Invalid Token' });
        }

        if (!school) return res.status(404).json({ message: 'School not found' });

        // STRICT UNIQUENESS CHECKS FOR TEACHERS
        const duplicateCheck = await User.findOne({
            schoolId: school._id,
            role: 'teacher',
            $or: [
                { email: email },  // Check Email
                { fullName: { $regex: new RegExp(`^${fullName}$`, 'i') } }, // Check Name (Case-insensitive)
                { 'info.phone': phone } // Check Phone
            ]
        });

        if (duplicateCheck) {
            if (duplicateCheck.email === email) {
                return res.status(400).json({ message: 'A teacher with this Email is already registered.' });
            }
            if (duplicateCheck.fullName.toLowerCase() === fullName.toLowerCase()) {
                return res.status(400).json({ message: 'A teacher with this Name is already registered.' });
            }
            if (duplicateCheck.info?.phone === phone) {
                return res.status(400).json({ message: 'A teacher with this Phone Number is already registered.' });
            }
        }

        // CHECK FOR DUPLICATE SUBJECTS IN THE SAME SCHOOL
        if (subjects && subjects.length > 0) {
            // Find any teacher in this school who has ANY of the requested subjects
            const conflictingTeacher = await User.findOne({
                schoolId: school._id,
                role: 'teacher',
                'info.subjects': { $in: subjects }
            });

            if (conflictingTeacher) {
                // Find which subject collided
                const collidedSubject = subjects.find(sub => conflictingTeacher.info.subjects.includes(sub));
                return res.status(400).json({
                    message: `The subject '${collidedSubject}' is already assigned to a teacher (${conflictingTeacher.fullName}) in this school.`
                });
            }
        }

        // Generate Custom Teacher ID
        const schoolPrefix = school.name.substring(0, 3).toUpperCase();
        const classStr = classLevel ? classLevel.replace(/\s+/g, '').toUpperCase() : 'GEN';
        const year = new Date().getFullYear();

        let uniqueLoginId;
        let isUnique = false;
        while (!isUnique) {
            const random4 = Math.floor(1000 + Math.random() * 9000); // 1000-9999
            uniqueLoginId = `${schoolPrefix}/TCH/${classStr}/${year}/${random4}`;
            const existing = await User.findOne({ uniqueLoginId });
            if (!existing) isUnique = true;
        }

        const teacher = new User({
            uniqueLoginId,
            username: uniqueLoginId,
            email: email,
            password,
            fullName,
            role: inviteRole,
            schoolId: school._id,
            gender,
            profilePicture, // Cloudinary URL
            verified: true,
            status: 'pending',
            info: {
                subjects,
                phone,
                classLevel,
                registrationNumber: registrationNumber || 'N/A',
                dateOfBirth // Added to info
            }
        });
        await teacher.save();

        const { sendTeacherWelcomeEmail } = require('../utils/emailService');
        if (email) await sendTeacherWelcomeEmail(email, fullName, uniqueLoginId, password);

        res.status(201).json({
            message: 'Teacher registered. Your Login ID has been sent to your email.',
            uniqueLoginId,
            requireApproval: true
        });

    } catch (error) {
        console.error('Error registering teacher:', error);
        res.status(500).json({ message: 'Error registering teacher', error: error.message });
    }
};

// 5. Register Student
exports.registerStudent = async (req, res) => {
    // UPDATED: Destructure phone, dateOfBirth, gender
    const { schoolRefId, schoolId, fullName, classLevel, password, location, phone, dateOfBirth, gender } = req.body;

    // Get profile picture URL from uploaded file
    const profilePicture = req.file?.path || null;

    try {
        let school;
        if (schoolId) {
            school = await School.findById(schoolId);
        } else if (schoolRefId) {
            school = await School.findOne({ schoolRefId: schoolRefId });
        }

        if (!school) return res.status(404).json({ message: 'Invalid School Reference ID or School Not Found' });

        // STRICT UNIQUENESS CHECK FOR STUDENTS
        // Check Name OR Phone
        const existingStudent = await User.findOne({
            schoolId: school._id,
            role: 'student',
            $or: [
                { fullName: { $regex: new RegExp(`^${fullName}$`, 'i') } }, // Case-insensitive Name Check
                { 'info.phone': phone } // Phone Check
            ]
        });

        if (existingStudent) {
            if (existingStudent.info?.phone === phone) {
                return res.status(400).json({ message: 'A student with this Phone Number is already registered.' });
            }
            return res.status(400).json({ message: 'A student with this Name is already registered.' });
        }

        const schoolPrefix = school.name.substring(0, 3).toUpperCase();
        const classStr = classLevel.replace(/\s+/g, '').toUpperCase();
        const year = new Date().getFullYear();

        let registrationNumber;
        let isUnique = false;

        while (!isUnique) {
            const random4 = Math.floor(1000 + Math.random() * 9000);
            registrationNumber = `${schoolPrefix}/STU/${classStr}/${year}/${random4}`;
            const existing = await User.findOne({
                schoolId: school._id,
                'info.registrationNumber': registrationNumber
            });
            if (!existing) isUnique = true;
        }

        const uniqueLoginId = generateUniqueId('STD');

        const student = new User({
            uniqueLoginId,
            username: uniqueLoginId,
            email: `${uniqueLoginId}@student.local`,
            password,
            fullName,
            role: 'student',
            schoolId: school._id,
            gender, // Added Gender
            profilePicture, // Cloudinary URL
            verified: true,
            status: 'pending',
            info: {
                registrationNumber,
                classLevel,
                location,
                phone,
                dateOfBirth
            }
        });
        await student.save();

        res.status(201).json({
            message: 'Student registered. Wait for approval.',
            uniqueLoginId,
            registrationNumber
        });
    } catch (error) {
        console.error('Error registering student:', error);
        res.status(500).json({ message: 'Error registering student', error: error.message });
    }
};

// ================= ATTENDANCE & CLASS MANAGEMENT =================

// Get Students in Teacher's Class (For Attendance Table)
exports.getClassStudents = async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id);
        if (!teacher || teacher.role !== 'teacher') return res.status(403).json({ message: 'Unauthorized' });

        if (!teacher.info.classLevel) {
            return res.status(400).json({ message: 'You are not assigned to any class level.' });
        }

        const students = await User.find({
            schoolId: teacher.schoolId,
            role: 'student',
            'info.classLevel': teacher.info.classLevel
        }).select('fullName info.registrationNumber info.phone gender info.dateOfBirth');

        res.json(students);
    } catch (error) {
        console.error("Error fetching class students:", error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get Attendance for a Date
exports.getAttendance = async (req, res) => {
    try {
        const { date } = req.query;
        const teacher = await User.findById(req.user.id);

        const targetDate = date ? new Date(date + 'T00:00:00') : new Date();
        targetDate.setHours(0, 0, 0, 0);

        const attendance = await Attendance.findOne({
            schoolId: teacher.schoolId,
            classLevel: teacher.info.classLevel,
            date: targetDate
        });

        res.json(attendance || { records: [] });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching attendance', error: error.message });
    }
};

// 14b. Teacher: Get Attendance History (List of Dates)
exports.getAttendanceHistory = async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id);
        if (!teacher || !teacher.info || !teacher.info.classLevel) {
            return res.status(400).json({ message: 'Teacher class assignment not found' });
        }
        const history = await Attendance.find({
            schoolId: teacher.schoolId,
            classLevel: teacher.info.classLevel
        })
            .select('date records isLocked')
            .sort({ date: -1 });

        const historyWithStats = history.map(h => {
            const stats = {
                present: h.records.filter(r => r.status === 'Present').length,
                absent: h.records.filter(r => r.status === 'Absent').length,
                late: h.records.filter(r => r.status === 'Late').length
            };
            return {
                ...h.toObject(),
                records: undefined, // Don't send full records in list
                stats
            };
        });

        res.json(historyWithStats);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Error fetching history', error: error.message });
    }
};

// 15. Teacher: Get Pending Students from Teacher's Class
// Mark/Update Attendance
exports.markAttendance = async (req, res) => {
    try {
        const { date, records, isLocked } = req.body; // records: [{ studentId, status, remarks }]
        const teacher = await User.findById(req.user.id);

        if (!teacher.info.classLevel) return res.status(400).json({ message: 'No class assigned' });
        const targetDate = date ? new Date(date + 'T00:00:00') : new Date();
        targetDate.setHours(0, 0, 0, 0);

        // Find existing record
        const existingAttendance = await Attendance.findOne({
            schoolId: teacher.schoolId,
            classLevel: teacher.info.classLevel,
            date: targetDate
        });

        // Prevent modification of locked records
        if (existingAttendance && existingAttendance.isLocked) {
            return res.status(403).json({ message: 'This attendance record is finalized and cannot be modified' });
        }

        // Restriction: Only allow marking for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (targetDate.getTime() !== today.getTime()) {
            return res.status(403).json({ message: 'Attendance can only be marked or modified for today' });
        }

        // Update or Create
        const attendance = await Attendance.findOneAndUpdate(
            {
                schoolId: teacher.schoolId,
                classLevel: teacher.info.classLevel,
                date: targetDate
            },
            {
                $set: {
                    teacherId: teacher._id,
                    records: records,
                    isLocked: !!isLocked // Only lock if explicitly requested
                }
            },
            { upsert: true, new: true }
        );

        res.json({ message: isLocked ? 'Attendance finalized successfully' : 'Attendance saved successfully', attendance });
    } catch (error) {
        console.error("Error saving attendance:", error);
        res.status(500).json({ message: "Failed to save attendance" });
    }
};

// 6. Get Pending Approvals
exports.getPendingUsers = async (req, res) => {
    try {
        const users = await User.find({ schoolId: req.user.schoolId, status: 'pending' }).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching pending users', error: error.message });
    }
};

// 7. Approve/Reject User
exports.approveUser = async (req, res) => {
    const { userId, action } = req.body; // action: 'approve' | 'reject'
    try {
        const user = await User.findOne({ _id: userId, schoolId: req.user.schoolId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.role === 'student' && action === 'approve') {
            return res.status(403).json({
                message: 'Students must be approved by their Class Teacher.'
            });
        }

        if (action === 'approve') {
            user.status = 'verified';
            await user.save();
            res.json({ message: 'User approved successfully' });
        } else if (action === 'reject') {
            await User.deleteOne({ _id: userId }); // Or status = 'rejected'
            res.json({ message: 'User rejected and removed' });
        } else {
            res.status(400).json({ message: 'Invalid action' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error processing approval', error: error.message });
    }
};

// 8. Admin Dashboard: Get Stats (Read-Only)
exports.getDashboardStats = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        const totalTeachers = await User.countDocuments({ schoolId, role: 'teacher' });
        const totalStudents = await User.countDocuments({ schoolId, role: 'student' });
        const pendingApprovals = await User.countDocuments({ schoolId, status: 'pending' });

        // Active exams count
        const Exam = require('../models/Exam');
        const activeExams = await Exam.countDocuments({ schoolId, isActive: true });
        const totalExams = await Exam.countDocuments({ schoolId });

        const school = await School.findById(req.user.schoolId);

        res.json({
            totalTeachers,
            totalStudents,
            pendingApprovals,
            activeExams,
            totalExams,
            currentTermEndDate: school ? school.currentTermEndDate : null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
};

// 9. Admin: Get All Teachers (Monitoring)
exports.getAllTeachers = async (req, res) => {
    try {
        const teachers = await User.find({ schoolId: req.user.schoolId, role: 'teacher' })
            .select('-password -__v');
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching teachers', error: error.message });
    }
};

// 10. Admin: Get All Students (Monitoring)
exports.getAllStudents = async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.id);
        const students = await User.find({
            schoolId: adminUser.schoolId,
            role: 'student'
        }).select('fullName email uniqueLoginId status info profilePicture gender createdAt');

        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Error fetching students', error: error.message });
    }
};

// 11. Analytics: User Growth
exports.getUserGrowthAnalytics = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        // Group users by month created
        const growth = await User.aggregate([
            { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    count: { $sum: 1 },
                    teachers: {
                        $sum: { $cond: [{ $eq: ["$role", "teacher"] }, 1, 0] }
                    },
                    students: {
                        $sum: { $cond: [{ $eq: ["$role", "student"] }, 1, 0] }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        res.json(growth);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user growth', error: error.message });
    }
};
// 12. Public: Get School Info for Registration Forms (Direct ID)
exports.getPublicSchoolInfo = async (req, res) => {
    try {
        const school = await School.findById(req.params.schoolId).select('name logoUrl inviteToken');
        if (!school) return res.status(404).json({ message: 'School not found' });
        res.json(school);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching school info', error: error.message });
    }
};

// 13. Public: Get Invite Info (Token Validation)
exports.getInviteInfo = async (req, res) => {
    const { token } = req.params;
    try {
        let invite = await Invite.findOne({ token, used: false, expiresAt: { $gt: Date.now() } });

        let school = null;
        let role = 'teacher';
        let email = null;

        if (invite) {
            school = await School.findById(invite.schoolId).select('name logoUrl');
            role = invite.role;
            email = invite.email;
        } else {
            // Fallback: Check School model
            const schoolWithToken = await School.findOne({ inviteToken: token }).select('name logoUrl _id');
            if (schoolWithToken) {
                school = schoolWithToken;
                // Default values for admin token invite
            }
        }

        if (!school) return res.status(400).json({ message: 'Invalid or expired invite link' });

        res.json({
            school,
            role,
            email
        });
    } catch (error) {
        res.status(500).json({ message: 'Error validating invite', error: error.message });
    }
};

// 14. Public: Get School by Ref ID (For Student Link)
exports.getSchoolByRefId = async (req, res) => {
    const { refId } = req.params;
    try {
        const school = await School.findOne({ schoolRefId: refId }).select('name logoUrl _id');
        if (!school) return res.status(404).json({ message: 'Invalid School Reference Code' });
        res.json(school);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching school info', error: error.message });
    }
};

// Teacher-specific routes below
// 15. Teacher: Get Pending Students from Teacher's Class
exports.getTeacherPendingStudents = async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id).select('info.classLevel schoolId');
        if (!teacher || !teacher.info || !teacher.info.classLevel) {
            return res.status(400).json({ message: 'Teacher class assignment not found' });
        }

        const pendingStudents = await User.find({
            schoolId: teacher.schoolId,
            role: 'student',
            status: 'pending',
            'info.classLevel': teacher.info.classLevel
        }).select('-password -__v');

        res.json(pendingStudents);
    } catch (error) {
        console.error('Error fetching pending students:', error);
        res.status(500).json({ message: 'Error fetching pending students', error: error.message });
    }
};

// 16. Teacher: Approve Student (Class-based validation)
exports.teacherApproveStudent = async (req, res) => {
    const { studentId } = req.body;

    try {
        const teacher = await User.findById(req.user.id).select('info.classLevel schoolId');
        if (!teacher || !teacher.info || !teacher.info.classLevel) {
            return res.status(400).json({ message: 'Teacher class assignment not found' });
        }

        const student = await User.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Validate: Student must be in teacher's class and school
        if (student.schoolId.toString() !== teacher.schoolId.toString()) {
            return res.status(403).json({ message: 'Student is not from your school' });
        }

        if (student.info.classLevel !== teacher.info.classLevel) {
            return res.status(403).json({ message: 'You can only approve students from your assigned class' });
        }

        if (student.status !== 'pending') {
            return res.status(400).json({ message: 'Student is not pending approval' });
        }

        // Approve the student
        student.status = 'verified';
        await student.save();

        res.json({ message: 'Student approved successfully', student: { id: student._id, fullName: student.fullName } });
    } catch (error) {
        console.error('Error approving student:', error);
        res.status(500).json({ message: 'Error approving student', error: error.message });
    }
};

// 17. Teacher: Get Dashboard Stats
exports.getTeacherDashboardStats = async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id);
        const Exam = require('../models/Exam'); // Import locally or move to top
        const StaffAttendance = require('../models/StaffAttendance'); // Import StaffAttendance model

        if (!teacher || !teacher.info || !teacher.info.classLevel) {
            return res.status(400).json({ message: 'Teacher class assignment not found' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalStudents, pendingStudents, activeExams, attendance] = await Promise.all([
            User.countDocuments({
                schoolId: teacher.schoolId,
                role: 'student',
                'info.classLevel': teacher.info.classLevel
            }),
            User.countDocuments({
                schoolId: teacher.schoolId,
                role: 'student',
                status: 'pending',
                'info.classLevel': teacher.info.classLevel
            }),
            Exam.countDocuments({
                teacherId: teacher._id,
                status: 'active'
            }),
            StaffAttendance.findOne({
                teacherId: teacher._id,
                date: today
            })
        ]);

        res.json({
            totalStudents,
            pendingApprovals: pendingStudents,
            activeExams,
            avgScore: 'N/A', // Placeholder
            todayAttendance: attendance ? {
                timeIn: attendance.timeIn,
                timeOut: attendance.timeOut
            } : null
        });
    } catch (error) {
        console.error('Error fetching teacher stats:', error);
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
};

// 18. Teacher: Get Profile (Includes School Name & Premium Status)
exports.getTeacherProfile = async (req, res) => {
    try {
        const teacher = await User.findById(req.user.id);
        if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

        const School = require('../models/School');
        const Subscription = require('../models/Subscription');
        
        const school = await School.findById(teacher.schoolId);
        const subscription = await Subscription.findOne({ schoolId: teacher.schoolId });
        
        // --- ADMIN BYPASS LOGIC ---
        // Force full access for the specific school login ID
        const isAdminSchool = school && school.schoolLoginId === 'SCH-20670E';
        
        // Use model methods for consistent logic
        const isActive = subscription ? subscription.isActive() : false;
        const hasProctoring = isAdminSchool || (isActive && subscription && subscription.hasFeature('proctoring'));

        res.json({
            fullName: teacher.fullName,
            uniqueLoginId: teacher.uniqueLoginId,
            schoolName: school ? school.name : 'School Management System',
            schoolLogo: school ? school.logoUrl : null,
            info: teacher.info,
            role: teacher.role,
            profilePicture: teacher.profilePicture,
            subscription: {
                plan: isAdminSchool ? 'premium' : (subscription ? subscription.plan : 'basic'),
                status: isAdminSchool ? 'active' : (subscription ? subscription.status : 'none'),
                canMonitor: !!hasProctoring
            }
        });
    } catch (error) {
        console.error('Error fetching teacher profile:', error);
        res.status(500).json({ message: 'Error fetching profile' });
    }
};

// ================= STAFF ATTENDANCE (TEACHERS) =================

// 19. Mark Staff Time In
exports.markStaffTimeIn = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const schoolId = req.user.schoolId;
        const now = new Date();
        const day = now.getDay(); // 0 (Sun) to 6 (Sat)

        // Mon-Fri Only (1-5)
        if (day === 0 || day === 6) {
            return res.status(400).json({ message: "Attendance can only be marked from Monday to Friday." });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const timeIn = now.toLocaleTimeString('en-GB', { hour12: false }); // HH:mm:ss

        // Check if already marked
        let record = await StaffAttendance.findOne({ teacherId, date: today });
        if (record && record.timeIn) {
            return res.status(400).json({ message: "You have already marked Time In for today." });
        }

        if (!record) {
            record = new StaffAttendance({
                teacherId,
                schoolId,
                date: today,
                timeIn,
                logs: [{ action: 'Time In', timestamp: now }]
            });
        } else {
            record.timeIn = timeIn;
            record.logs.push({ action: 'Time In', timestamp: now });
        }

        await record.save();
        res.json({ message: "Time In marked successfully", timeIn, record });
    } catch (error) {
        console.error("Mark Time In Error:", error);
        res.status(500).json({ message: "Failed to mark Time In" });
    }
};

// 20. Mark Staff Time Out
exports.markStaffTimeOut = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const now = new Date();
        const day = now.getDay();

        if (day === 0 || day === 6) {
            return res.status(400).json({ message: "Attendance can only be marked from Monday to Friday." });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const timeOut = now.toLocaleTimeString('en-GB', { hour12: false });


        const record = await StaffAttendance.findOne({ teacherId, date: today });
        if (!record) {
            return res.status(404).json({ message: "You must mark Time In before marking Time Out." });
        }

        // Validate cooldown (Time Out != Time In)
        if (record.timeIn === timeOut) {
            return res.status(400).json({ message: "Time Out cannot be the same as Time In. Please wait a minute." });
        }

        if (record.timeOut) {
            return res.status(400).json({ message: "You have already marked Time Out for today." });
        }

        record.timeOut = timeOut;
        record.logs.push({ action: 'Time Out', timestamp: now });
        await record.save();

        res.json({ message: "Time Out marked successfully", timeOut, record });
    } catch (error) {
        console.error("Mark Time Out Error:", error);
        res.status(500).json({ message: "Failed to mark Time Out" });
    }
};

// 21. Get All Staff Attendance (Public Grid)
exports.getStaffAttendance = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        const { date } = req.query;
        const targetDate = date ? new Date(date + 'T00:00:00') : new Date();
        targetDate.setHours(0, 0, 0, 0);

        // Get all teachers in the school
        const teachers = await User.find({ schoolId, role: 'teacher' }).select('fullName _id');

        // Get attendance records for the date
        const attendance = await StaffAttendance.find({ schoolId, date: targetDate });

        // Map teachers to their attendance (if any)
        const gridData = teachers.map(teacher => {
            const record = attendance.find(a => a.teacherId.toString() === teacher._id.toString());
            return {
                teacherId: teacher._id,
                fullName: teacher.fullName,
                timeIn: record ? record.timeIn : '-',
                timeOut: record ? record.timeOut : '-',
                status: record ? record.status : 'Absent'
            };
        });

        res.json(gridData);
    } catch (error) {
        console.error("Get Staff Attendance Error:", error);
        res.status(500).json({ message: "Failed to fetch staff attendance" });
    }
};

// 22. Update Term End Date (Admin)
exports.updateSchoolTerm = async (req, res) => {
    const { termEndDate } = req.body;
    try {
        const school = await School.findById(req.user.schoolId);
        if (!school) return res.status(404).json({ message: 'School not found' });

        school.currentTermEndDate = termEndDate;
        await school.save();

        res.json({ message: 'Term end date updated', termEndDate: school.currentTermEndDate });
    } catch (error) {
        res.status(500).json({ message: 'Error updating term date' });
    }
};

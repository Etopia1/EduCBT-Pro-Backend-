const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const ChatGroup = require('../models/ChatGroup');
const Session = require('../models/Session');

// === LOG HELPER (for use in other controllers) ===
exports.logActivity = async (opts) => {
    try {
        // Create the log entry
        const log = await ActivityLog.create({
            schoolId: opts.schoolId,
            userId: opts.userId,
            userName: opts.userName,
            userRole: opts.userRole,
            action: opts.action,
            metadata: opts.metadata || {},
            messagePreview: opts.messagePreview,
            ipAddress: opts.ipAddress,
            severity: opts.severity || 'low'
        });

        // Emit real-time update to admin monitor room
        // req is not available here, so we might need a workaround or pass io.
        // Usually, in this project, we can access io via global or app.get('io')
        // if we have access to the app object. 
        // Let's check how we can get IO.
        const io = global.io; 
        if (io && opts.schoolId) {
            io.to(`admin_monitor_${opts.schoolId}`).emit('new_activity', log);
        }
    } catch (e) {
        console.error('Activity log failed:', e.message);
    }
};

// === GET ACTIVITY FEED ===
// GET /admin/activity?page=1&limit=50&action=&role=&userId=&from=&to=
exports.getActivityFeed = async (req, res) => {
    try {
        const { schoolId } = req.user;
        const { page = 1, limit = 50, action, role, userId, from, to, search } = req.query;

        const query = { schoolId };
        if (action) query.action = action;
        if (role) query.userRole = role;
        if (userId) query.userId = userId;
        if (from || to) {
            query.createdAt = {};
            if (from) query.createdAt.$gte = new Date(from);
            if (to) query.createdAt.$lte = new Date(to);
        }
        if (search) {
            query.$or = [
                { userName: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } },
                { messagePreview: { $regex: search, $options: 'i' } }
            ];
        }

        const [logs, total] = await Promise.all([
            ActivityLog.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .lean(),
            ActivityLog.countDocuments(query)
        ]);

        res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === GET ALL USERS IN SCHOOL ===
exports.getSchoolUsers = async (req, res) => {
    try {
        const { schoolId } = req.user;
        const users = await User.find({ schoolId })
            .select('fullName role status email info profilePicture createdAt uniqueLoginId')
            .lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === GET USER ACTIVITY DETAIL ===
exports.getUserActivity = async (req, res) => {
    try {
        const { userId } = req.params;
        const { schoolId } = req.user;

        const [user, logs, exams] = await Promise.all([
            User.findById(userId).select('-password').lean(),
            ActivityLog.find({ schoolId, userId }).sort({ createdAt: -1 }).limit(100).lean(),
            Session.find({ user: userId }).populate('exam', 'title subject').sort({ createdAt: -1 }).limit(20).lean()
        ]);

        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ user, logs, exams });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === BLOCK / UNBLOCK USER ===
exports.toggleBlockUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { schoolId, _id: adminId, fullName: adminName } = req.user;

        const user = await User.findOne({ _id: userId, schoolId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const newStatus = user.status === 'suspended' ? 'verified' : 'suspended';
        user.status = newStatus;
        await user.save();

        // Log the admin action
        await exports.logActivity({
            schoolId,
            userId: adminId,
            userName: adminName,
            userRole: 'school_admin',
            action: newStatus === 'suspended' ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
            metadata: { targetUserId: userId, targetName: user.fullName },
            severity: 'high'
        });

        // Emit real-time notification
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${userId}`).emit('account_action', {
                type: newStatus === 'suspended' ? 'BLOCKED' : 'UNBLOCKED',
                message: newStatus === 'suspended' 
                    ? 'Your account has been suspended by the administrator.' 
                    : 'Your account has been restored.'
            });
        }

        res.json({ message: `User ${newStatus === 'suspended' ? 'blocked' : 'unblocked'}`, status: newStatus });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === DELETE USER ===
exports.deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { schoolId, _id: adminId, fullName: adminName } = req.user;

        const user = await User.findOne({ _id: userId, schoolId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        await exports.logActivity({
            schoolId,
            userId: adminId,
            userName: adminName,
            userRole: 'school_admin',
            action: 'USER_DELETED',
            metadata: { deletedUserId: userId, deletedUserName: user.fullName, role: user.role },
            severity: 'critical'
        });

        await User.findByIdAndDelete(userId);
        res.json({ message: 'User deleted permanently' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === GET ALL MESSAGES (admin monitoring) ===
exports.getAllMessages = async (req, res) => {
    try {
        const { schoolId } = req.user;
        const { groupId, page = 1 } = req.query;

        // First verify group belongs to this school
        const query = { };
        if (groupId) {
            const group = await ChatGroup.findOne({ _id: groupId, schoolId });
            if (!group) return res.status(404).json({ message: 'Group not found' });
            query.groupId = groupId;
        } else {
            // Get all group IDs for this school
            const groups = await ChatGroup.find({ schoolId }).select('_id');
            query.groupId = { $in: groups.map(g => g._id) };
        }

        const messages = await ChatMessage.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .skip((page - 1) * 100)
            .lean();

        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === GET ALL GROUPS (admin monitoring) ===
exports.getAllGroups = async (req, res) => {
    try {
        const { schoolId } = req.user;
        const groups = await ChatGroup.find({ schoolId })
            .populate('members', 'fullName role')
            .sort({ lastMessageAt: -1 })
            .lean();
        res.json(groups);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === ANALYTICS OVERVIEW ===
exports.getAnalyticsOverview = async (req, res) => {
    try {
        const { schoolId } = req.user;
        const now = new Date();
        const last7days = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const last30days = new Date(now - 30 * 24 * 60 * 60 * 1000);

        const [
            totalUsers, activeStudents, totalTeachers,
            recentLogs, examSessions, messages,
            logsByAction, logsByDay
        ] = await Promise.all([
            User.countDocuments({ schoolId }),
            User.countDocuments({ schoolId, role: 'student', status: 'verified' }),
            User.countDocuments({ schoolId, role: 'teacher' }),
            ActivityLog.find({ schoolId, createdAt: { $gte: last7days } }).sort({ createdAt: -1 }).limit(20).lean(),
            Session.countDocuments({ 'exam.schoolId': schoolId }),
            ChatMessage.countDocuments({ 
                groupId: { $in: await ChatGroup.find({ schoolId }).select('_id').then(gs => gs.map(g => g._id)) }
            }),
            ActivityLog.aggregate([
                { $match: { schoolId: require('mongoose').Types.ObjectId ? new (require('mongoose').Types.ObjectId)(schoolId) : schoolId, createdAt: { $gte: last30days } } },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            ActivityLog.aggregate([
                { $match: { schoolId: typeof schoolId === 'string' ? new (require('mongoose').Types.ObjectId)(schoolId) : schoolId, createdAt: { $gte: last7days } } },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ])
        ]);

        res.json({
            overview: { totalUsers, activeStudents, totalTeachers, examSessions, messages },
            recentActivity: recentLogs,
            actionBreakdown: logsByAction,
            activityByDay: logsByDay
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// === DOWNLOAD ACTIVITY LOGS AS CSV ===
exports.downloadLogs = async (req, res) => {
    try {
        const { schoolId } = req.user;
        const { userId, from, to } = req.query;

        const query = { schoolId };
        if (userId) query.userId = userId;
        if (from || to) {
            query.createdAt = {};
            if (from) query.createdAt.$gte = new Date(from);
            if (to) query.createdAt.$lte = new Date(to);
        }

        const logs = await ActivityLog.find(query).sort({ createdAt: -1 }).limit(5000).lean();

        const csvHeader = 'Timestamp,User,Role,Action,Severity,Details\n';
        const csvRows = logs.map(l => 
            `"${new Date(l.createdAt).toISOString()}","${l.userName}","${l.userRole}","${l.action}","${l.severity}","${JSON.stringify(l.metadata).replace(/"/g, "'")}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="activity-log.csv"');
        res.send(csvHeader + csvRows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

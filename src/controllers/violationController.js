const Session = require('../models/Session');

// Log a new violation
exports.logViolation = async (req, res) => {
    const { sessionId, type, imageUrl } = req.body;
    try {
        const session = await Session.findById(sessionId);
        if (!session) return res.status(404).json({ message: 'Session not found' });

        // Add the violation
        session.violations.push({ type, imageUrl });

        // Auto-lock logic rules
        const talkingViolations = session.violations.filter(v =>
            v.type === 'excessive_talking' || v.type === 'sustained_talking'
        ).length;

        const tabSwitchViolations = session.violations.filter(v =>
            v.type === 'tab_switch'
        ).length;

        // Lock on first tab switch
        if (type === 'tab_switch' && !session.isLocked) {
            session.isLocked = true;
            session.lockReason = 'Tab switch detected - exam locked';

            // Emit socket event to notify student
            const io = req.app?.get('io');
            if (io) {
                io.to(`session_${session._id}`).emit('session_locked', {
                    sessionId: session._id,
                    reason: session.lockReason,
                    message: 'Your exam has been locked due to tab switching'
                });
            }
        }

        // Lock after 5 talking violations
        if ((type === 'excessive_talking' || type === 'sustained_talking') && talkingViolations >= 5 && !session.isLocked) {
            session.isLocked = true;
            session.lockReason = `Excessive talking - ${talkingViolations} violations detected`;

            // Emit socket event to notify student
            const io = req.app?.get('io');
            if (io) {
                io.to(`session_${session._id}`).emit('session_locked', {
                    sessionId: session._id,
                    reason: session.lockReason,
                    message: 'Your exam has been locked due to excessive talking'
                });
            }
        }

        await session.save();

        res.json({
            message: 'Violation logged',
            violationsCount: session.violations.length,
            isLocked: session.isLocked,
            lockReason: session.lockReason
        });
    } catch (error) {
        res.status(500).json({ message: 'Error logging violation', error: error.message });
    }
};

// Get violations for a specific session (for teachers)
exports.getSessionViolations = async (req, res) => {
    const { sessionId } = req.params;
    try {
        const session = await Session.findById(sessionId)
            .populate('user', 'name email studentId')
            .populate('exam', 'title');

        if (!session) return res.status(404).json({ message: 'Session not found' });

        res.json({
            sessionId: session._id,
            student: session.user,
            exam: session.exam,
            violations: session.violations,
            violationsCount: session.violations.length,
            isLocked: session.isLocked,
            lockReason: session.lockReason,
            status: session.status
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching violations', error: error.message });
    }
};

// Get all violations for an exam (for teachers)
exports.getExamViolations = async (req, res) => {
    const { examId } = req.params;
    try {
        const sessions = await Session.find({ exam: examId })
            .populate('user', 'name email studentId')
            .populate('exam', 'title')
            .sort({ startTime: -1 });

        const violationsData = sessions.map(session => ({
            sessionId: session._id,
            student: session.user,
            violations: session.violations,
            violationsCount: session.violations.length,
            isLocked: session.isLocked,
            lockReason: session.lockReason,
            status: session.status,
            startTime: session.startTime,
            endTime: session.endTime
        }));

        const totalViolations = sessions.reduce((sum, session) => sum + session.violations.length, 0);

        res.json({
            exam: sessions[0]?.exam || { _id: examId },
            totalSessions: sessions.length,
            totalViolations,
            sessions: violationsData
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching exam violations', error: error.message });
    }
};

// Get violations for current user's session (for students)
exports.getMyViolations = async (req, res) => {
    const { examId } = req.params;
    const userId = req.user.id;

    try {
        const session = await Session.findOne({
            user: userId,
            exam: examId,
            status: { $in: ['ongoing', 'completed'] }
        }).sort({ startTime: -1 });

        if (!session) return res.status(404).json({ message: 'No session found' });

        res.json({
            violations: session.violations,
            violationsCount: session.violations.length,
            isLocked: session.isLocked,
            lockReason: session.lockReason,
            status: session.status
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching your violations', error: error.message });
    }
};

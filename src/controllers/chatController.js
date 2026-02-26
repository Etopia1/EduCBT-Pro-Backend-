const ChatGroup = require('../models/ChatGroup');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const mongoose = require('mongoose');
const { logActivity } = require('./adminController');

// --- GROUPS ---

// Get or create the General group for a school
async function ensureGeneralGroup(schoolId) {
    let general = await ChatGroup.findOne({ schoolId, type: 'general' });
    if (!general) {
        general = await ChatGroup.create({
            schoolId,
            name: 'General',
            description: 'School-wide announcements and discussion',
            type: 'general',
            members: [],
            admins: []
        });
    }
    return general;
}

// GET /chat/groups — list all groups the user is in + general channel
exports.getMyGroups = async (req, res) => {
    try {
        const { schoolId, _id: userId } = req.user;
        
        // Ensure General channel exists and add user to it if not member
        const general = await ensureGeneralGroup(schoolId);
        if (!general.members.map(String).includes(String(userId))) {
            await ChatGroup.findByIdAndUpdate(general._id, { $addToSet: { members: userId } });
        }

        const groups = await ChatGroup.find({
            schoolId,
            members: userId,
            isArchived: false
        }).sort({ lastMessageAt: -1 });

        res.json(groups);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /chat/groups — create a new group
exports.createGroup = async (req, res) => {
    try {
        const { name, description, memberIds } = req.body;
        const { schoolId, _id: userId, fullName, role } = req.user;

        // Only teachers and admins can create groups
        const allMembers = [userId, ...(memberIds || []).map(id => new mongoose.Types.ObjectId(id))];
        const uniqueMembers = [...new Set(allMembers.map(String))].map(id => new mongoose.Types.ObjectId(id));

        const group = await ChatGroup.create({
            schoolId,
            name: name.trim(),
            description: description?.trim() || '',
            type: 'group',
            members: uniqueMembers,
            admins: [userId],
            createdBy: userId
        });

        res.status(201).json(group);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /chat/dm — open a DM with another user
exports.openDM = async (req, res) => {
    try {
        const { targetUserId } = req.body;
        const { schoolId, _id: userId } = req.user;

        const targetObjectId = new mongoose.Types.ObjectId(targetUserId);
        const myObjectId = userId;

        // Check if DM already exists between these two users
        let dm = await ChatGroup.findOne({
            schoolId,
            type: 'dm',
            members: { $all: [myObjectId, targetObjectId], $size: 2 }
        });

        if (!dm) {
            const target = await User.findById(targetUserId).select('fullName');
            const me = await User.findById(userId).select('fullName');

            dm = await ChatGroup.create({
                schoolId,
                name: `DM:${target?.fullName || 'Unknown'}`,
                type: 'dm',
                members: [myObjectId, targetObjectId],
                admins: []
            });
        }

        res.json(dm);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /chat/groups/:groupId/messages — messages for a group
exports.getMessages = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { _id: userId } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 50;

        // Verify access
        const group = await ChatGroup.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Channel not found' });
        if (!group.members.map(String).includes(String(userId)) && group.type !== 'general') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const messages = await ChatMessage.find({ groupId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean();

        res.json(messages.reverse());
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /chat/groups/:groupId/messages — send a message
exports.sendMessage = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { content, attachments } = req.body;
        const { _id: userId, fullName, role } = req.user;

        const group = await ChatGroup.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Channel not found' });

        const message = await ChatMessage.create({
            groupId,
            senderId: userId,
            senderName: fullName,
            senderRole: role,
            content,
            attachments: attachments || [],
            readBy: [userId]
        });

        // Update group's last message info
        await ChatGroup.findByIdAndUpdate(groupId, {
            lastMessage: content?.substring(0, 100) || '📎 Attachment',
            lastMessageAt: new Date(),
            lastMessageBy: fullName
        });

        // Emit to socket room
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${groupId}`).emit('new_message', message);
            // Notify group members
            io.to(`school_staff_${group.schoolId}`).emit('group_activity', {
                groupId,
                groupName: group.name,
                lastMessage: content?.substring(0, 80) || 'Attachment',
                senderName: fullName
            });
        }

        // Log message activity (with preview)
        logActivity({
            schoolId: group.schoolId,
            userId,
            userName: fullName,
            userRole: role,
            action: 'MESSAGE_SENT',
            metadata: { groupId, groupName: group.name, groupType: group.type },
            messagePreview: content?.substring(0, 100) || 'Attachment',
            severity: 'low'
        });

        res.status(201).json(message);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /chat/staff — get all school staff for DMs
exports.getSchoolStaff = async (req, res) => {
    try {
        const { schoolId, _id: userId } = req.user;
        const staff = await User.find({
            schoolId,
            role: { $in: ['teacher', 'school_admin'] },
            _id: { $ne: userId },
            status: 'verified'
        }).select('fullName role profilePicture info').lean();

        res.json(staff);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /chat/groups/:groupId/members — add members to group
exports.addMembers = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { memberIds } = req.body;
        const { _id: userId } = req.user;

        const group = await ChatGroup.findById(groupId);
        if (!group) return res.status(404).json({ message: 'Group not found' });
        if (!group.admins.map(String).includes(String(userId))) {
            return res.status(403).json({ message: 'Only group admins can add members' });
        }

        const newIds = memberIds.map(id => new mongoose.Types.ObjectId(id));
        await ChatGroup.findByIdAndUpdate(groupId, { $addToSet: { members: { $each: newIds } } });

        res.json({ message: 'Members added' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

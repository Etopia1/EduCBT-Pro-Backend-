const mongoose = require('mongoose');

const communityPostSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true // Efficient querying by school
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['school_admin', 'teacher'],
        required: true
    },
    senderAvatar: {
        type: String
    },
    content: {
        type: String,
        trim: true
    },
    attachments: [{
        url: String, // Cloudinary URL
        type: String, // 'image', 'video', 'document'
        name: String // File name
    }],
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('CommunityPost', communityPostSchema);

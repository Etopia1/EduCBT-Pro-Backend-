const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatGroup', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String },
    senderAvatar: { type: String },
    content: { type: String, trim: true },
    attachments: [{
        url: String,
        type: String,  // 'image', 'video', 'document'
        name: String
    }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage' }, // reply thread
}, { timestamps: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);

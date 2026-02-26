const mongoose = require('mongoose');

const chatGroupSchema = new mongoose.Schema({
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    type: { 
        type: String, 
        enum: ['general', 'group', 'dm'], 
        default: 'group' 
    }, // general = school-wide, group = custom, dm = private
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // group admins
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    avatar: { type: String }, // group icon/emoji or image url
    isArchived: { type: Boolean, default: false },
    lastMessage: { type: String },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageBy: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('ChatGroup', chatGroupSchema);

const mongoose = require('mongoose');

const inviteSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    role: { type: String, enum: ['teacher', 'school_admin'], default: 'teacher' },
    email: { type: String }, // Optional, if inviting specific person
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Invite', inviteSchema);

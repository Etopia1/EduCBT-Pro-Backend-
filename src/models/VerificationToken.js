const mongoose = require('mongoose');

const verificationTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'modelType' },
    modelType: { type: String, required: true, enum: ['User', 'School'] }, // Can verify Schools or Users
    token: { type: String }, // For link-based verification
    otp: { type: String }, // For code-based verification
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('VerificationToken', verificationTokenSchema);

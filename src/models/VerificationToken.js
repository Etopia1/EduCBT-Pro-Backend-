const mongoose = require('mongoose');

const verificationTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'modelType' },
    modelType: { type: String, required: true, enum: ['User', 'School'] }, // Can verify Schools or Users
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('VerificationToken', verificationTokenSchema);

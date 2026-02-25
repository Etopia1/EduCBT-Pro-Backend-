const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    address: { type: String },
    location: {
        city: String,
        state: String,
        country: String
    },
    logoUrl: { type: String, required: true },
    adminContact: { type: String },
    schoolLoginId: { type: String, unique: true }, // SCH-XXXXXX (For Admin Login)
    schoolRefId: { type: String, unique: true },   // REF-XXXXXX (For Public Links)
    inviteToken: { type: String }, // Store the latest invite token generated on login
    verified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    currentTermEndDate: { type: Date }, // Admin sets this to close term
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' } // Link to subscription
}, { timestamps: true });

// Pre-save hook handled in controller for IDs to ensure uniqueness/custom logic
module.exports = mongoose.model('School', schoolSchema);

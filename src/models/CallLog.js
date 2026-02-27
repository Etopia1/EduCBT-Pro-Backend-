const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    roomId: { type: String, required: true },
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    callerName: { type: String, required: true },
    receiverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    groupName: { type: String }, // For group calls
    callType: { type: String, enum: ['voice', 'video'], default: 'voice' },
    status: { type: String, enum: ['ongoing', 'ended', 'missed', 'rejected'], default: 'ongoing' },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    duration: { type: Number }, // In seconds
    isGroup: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('CallLog', callLogSchema);

const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
    type: { type: String, required: true }, // e.g., 'face_not_visible', 'multiple_faces', 'tab_switch'
    timestamp: { type: Date, default: Date.now },
    imageUrl: { type: String }, // Optional: URL to snapshot evidence
});

const sessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    answers: { type: mongoose.Schema.Types.Mixed, default: {} }, // Flexible storage for any answer format
    score: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    violations: [violationSchema],
    isLocked: { type: Boolean, default: false },
    lockReason: { type: String },
    manualGrades: { type: mongoose.Schema.Types.Mixed, default: {} }, // { questionIndex: marks }
    status: { type: String, enum: ['ongoing', 'completed', 'terminated'], default: 'ongoing' },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);

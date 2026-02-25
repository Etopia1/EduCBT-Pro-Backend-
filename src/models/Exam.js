const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    text: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctOptions: [{ type: Number }], // Array of indices of correct options
    correctOption: { type: Number }, // Legacy field for compatibility
    imageUrl: { type: String }, // Optional image for the question
});

const examSchema = new mongoose.Schema({
    title: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    questions: [questionSchema],
    isActive: { type: Boolean, default: false }, // Overall visibility
    status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'scheduled' }, // Exam state
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    subject: { type: String, required: true },
    classLevel: { type: String }, // JSS1, JSS2, JSS3, SS1, SS2, SS3, etc.
    totalMarks: { type: Number, default: 0 },
    passingPercentage: { type: Number, default: 50 }, // Minimum percentage to pass
    accessCode: { type: String }, // Optional unique code for students to join
    examType: {
        type: String,
        enum: ['basic', 'proctored'],
        default: 'basic',
        required: true
    }, // Type of exam based on school subscription
    proctoringSettings: {
        requireCamera: { type: Boolean, default: false },
        requireAudio: { type: Boolean, default: false },
        detectViolations: { type: Boolean, default: false },
        lockBrowser: { type: Boolean, default: false },
        screenSharing: { type: Boolean, default: false },
        faceDetection: { type: Boolean, default: false },
        tabSwitchLimit: { type: Number, default: 0 } // 0 means unlimited
    }
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);

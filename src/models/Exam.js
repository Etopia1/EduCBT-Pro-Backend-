const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    text: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['mcq', 'true_false', 'fib', 'essay'], 
        default: 'mcq' 
    },
    options: [{ type: String }], // Optional for FIB/Essay
    correctOptions: [{ type: Number }], // For MCQ/True-False indices
    correctAnswer: { type: String }, // For FIB (text match)
    marks: { type: Number, default: 1 }, // Marks for this specific question
    imageUrl: { type: String }, // Optional image for the question
});

const examSchema = new mongoose.Schema({
    title: { type: String, required: true },
    durationMinutes: { type: Number, required: true },
    startTime: { type: Date }, // Absolute start time
    endTime: { type: Date }, // Absolute end time
    questions: [questionSchema],
    isActive: { type: Boolean, default: false }, // Overall visibility
    status: { type: String, enum: ['draft', 'scheduled', 'active', 'ended'], default: 'scheduled' }, // Exam state
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    subject: { type: String, required: true },
    classLevel: { type: String }, // JSS1, JSS2, JSS3, SS1, SS2, SS3, etc.
    groups: [{ type: String }], // Optional: Assign to specific student groups
    totalMarks: { type: Number, default: 0 },
    passingScore: { type: Number, default: 0 }, // Minimum score to pass
    passingPercentage: { type: Number, default: 50 }, 
    negativeMarking: { type: Number, default: 0 }, // Penalty per wrong answer
    accessCode: { type: String }, // Optional unique code for students to join
    examType: {
        type: String,
        enum: ['basic', 'proctored'],
        default: 'basic',
        required: true
    }, 
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

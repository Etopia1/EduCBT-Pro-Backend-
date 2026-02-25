const mongoose = require('mongoose');

// Student Academic Record Schema
const studentRecordSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true // One record per student
    },
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },

    // Basic Info (Read-only from User model)
    fullName: { type: String, required: true },
    registrationNumber: { type: String, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    classLevel: { type: String },

    // Test Scores by Subject (Auto-calculated from CBT exams - NOT EDITABLE)
    testScores: {
        mathematics: { type: Number, default: 0 },
        english: { type: Number, default: 0 },
        physics: { type: Number, default: 0 },
        chemistry: { type: Number, default: 0 },
        biology: { type: Number, default: 0 },
        geography: { type: Number, default: 0 },
        economics: { type: Number, default: 0 },
        commerce: { type: Number, default: 0 },
        accounting: { type: Number, default: 0 },
        government: { type: Number, default: 0 },
        literature: { type: Number, default: 0 },
        history: { type: Number, default: 0 },
        civicEducation: { type: Number, default: 0 },
        computerScience: { type: Number, default: 0 },
        furtherMathematics: { type: Number, default: 0 },
        technicalDrawing: { type: Number, default: 0 },
        foodAndNutrition: { type: Number, default: 0 },
        agriculturalScience: { type: Number, default: 0 },
    },

    // Exam Scores by Subject (Can be edited by subject teacher AFTER publishing)
    examScores: {
        mathematics: { type: Number, default: 0 },
        english: { type: Number, default: 0 },
        physics: { type: Number, default: 0 },
        chemistry: { type: Number, default: 0 },
        biology: { type: Number, default: 0 },
        geography: { type: Number, default: 0 },
        economics: { type: Number, default: 0 },
        commerce: { type: Number, default: 0 },
        accounting: { type: Number, default: 0 },
        government: { type: Number, default: 0 },
        literature: { type: Number, default: 0 },
        history: { type: Number, default: 0 },
        civicEducation: { type: Number, default: 0 },
        computerScience: { type: Number, default: 0 },
        furtherMathematics: { type: Number, default: 0 },
        technicalDrawing: { type: Number, default: 0 },
        foodAndNutrition: { type: Number, default: 0 },
        agriculturalScience: { type: Number, default: 0 },
    },

    // Published status per subject (controls visibility and editability)
    publishedSubjects: {
        mathematics: { type: Boolean, default: false },
        english: { type: Boolean, default: false },
        physics: { type: Boolean, default: false },
        chemistry: { type: Boolean, default: false },
        biology: { type: Boolean, default: false },
        geography: { type: Boolean, default: false },
        economics: { type: Boolean, default: false },
        commerce: { type: Boolean, default: false },
        accounting: { type: Boolean, default: false },
        government: { type: Boolean, default: false },
        literature: { type: Boolean, default: false },
        history: { type: Boolean, default: false },
        civicEducation: { type: Boolean, default: false },
        computerScience: { type: Boolean, default: false },
        furtherMathematics: { type: Boolean, default: false },
        technicalDrawing: { type: Boolean, default: false },
        foodAndNutrition: { type: Boolean, default: false },
        agriculturalScience: { type: Boolean, default: false },
    },

    // Attendance Score (Auto-calculated - NOT EDITABLE)
    attendanceScore: { type: Number, default: 0 },

    // Additional Editable Fields
    position: { type: Number }, // Class position
    remarks: { type: String }, // Teacher's remarks
    conduct: { type: String }, // Student conduct

    // Metadata
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    term: { type: String, default: 'Current Term' },
    academicYear: { type: String, default: '2025/2026' },

}, { timestamps: true });

// Calculate total score for a subject (test + exam)
studentRecordSchema.methods.getSubjectTotal = function (subject) {
    const testScore = this.testScores[subject] || 0;
    const examScore = this.examScores[subject] || 0;
    return testScore + examScore;
};

// Check if teacher can edit a subject
studentRecordSchema.methods.canTeacherEdit = function (teacherSubjects, subject) {
    // Normalize subject names
    const normalizedTeacherSubjects = teacherSubjects.map(s => s.toLowerCase().replace(/\s+/g, ''));
    const normalizedSubject = subject.toLowerCase().replace(/\s+/g, '');

    // Teacher must teach this subject AND it must be published
    return normalizedTeacherSubjects.includes(normalizedSubject) && this.publishedSubjects[normalizedSubject];
};

// Calculate overall total
studentRecordSchema.virtual('totalScore').get(function () {
    const subjects = [
        'mathematics', 'english', 'physics', 'chemistry', 'biology',
        'geography', 'economics', 'commerce', 'accounting', 'government',
        'literature', 'history', 'civicEducation', 'computerScience',
        'furtherMathematics', 'technicalDrawing', 'foodAndNutrition', 'agriculturalScience'
    ];

    let total = 0;
    subjects.forEach(subject => {
        total += (this.testScores[subject] || 0) + (this.examScores[subject] || 0);
    });
    total += this.attendanceScore || 0;

    return total;
});

// Calculate average
studentRecordSchema.virtual('average').get(function () {
    const subjects = [
        'mathematics', 'english', 'physics', 'chemistry', 'biology',
        'geography', 'economics', 'commerce', 'accounting', 'government',
        'literature', 'history', 'civicEducation', 'computerScience',
        'furtherMathematics', 'technicalDrawing', 'foodAndNutrition', 'agriculturalScience'
    ];

    let count = 0;
    let total = 0;

    subjects.forEach(subject => {
        const subjectTotal = (this.testScores[subject] || 0) + (this.examScores[subject] || 0);
        if (subjectTotal > 0) {
            count++;
            total += subjectTotal;
        }
    });

    if (this.attendanceScore > 0) {
        count++;
        total += this.attendanceScore;
    }

    return count > 0 ? total / count : 0;
});

// Enable virtuals in JSON
studentRecordSchema.set('toJSON', { virtuals: true });
studentRecordSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('StudentRecord', studentRecordSchema);

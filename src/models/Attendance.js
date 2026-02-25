const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The teacher who marked it
    classLevel: { type: String, required: true },
    date: { type: Date, required: true }, // Normalized to midnight
    records: [{
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['Present', 'Absent', 'Late'], default: 'Absent' },
        remarks: String
    }],
    isLocked: { type: Boolean, default: false }
}, { timestamps: true });

// Ensure one record per class per day (per teacher? or per class globally?)
// Usually class attendance is once per day. Let's scope it by School + Class + Date.
attendanceSchema.index({ schoolId: 1, classLevel: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);

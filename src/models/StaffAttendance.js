const mongoose = require('mongoose');

const staffAttendanceSchema = new mongoose.Schema({
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    date: { type: Date, required: true }, // Normalized to midnight
    timeIn: { type: String }, // Format: HH:mm:ss
    timeOut: { type: String }, // Format: HH:mm:ss
    status: { type: String, enum: ['Present', 'Late', 'Absent'], default: 'Present' },
    logs: [{
        action: String, // 'Time In', 'Time Out'
        timestamp: Date
    }]
}, { timestamps: true });

// Ensure one record per teacher per day
staffAttendanceSchema.index({ teacherId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('StaffAttendance', staffAttendanceSchema);

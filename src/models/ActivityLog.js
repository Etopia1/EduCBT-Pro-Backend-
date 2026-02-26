const mongoose = require('mongoose');

// Logs every significant action performed by any user in the school
const activityLogSchema = new mongoose.Schema({
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String },
    userRole: { type: String },
    
    // What happened
    action: { 
        type: String, 
        required: true,
        enum: [
            // Auth
            'USER_LOGIN', 'USER_LOGOUT', 'PASSWORD_CHANGE',
            // Student
            'EXAM_START', 'EXAM_SUBMIT', 'EXAM_VIOLATION', 'EXAM_TERMINATED',
            // Teacher
            'EXAM_CREATED', 'EXAM_UPDATED', 'EXAM_DELETED', 'EXAM_ACTIVATED', 'EXAM_STOPPED',
            'GRADE_SUBMITTED', 'ATTENDANCE_MARKED', 'RESULT_PUBLISHED',
            // Chat / Community
            'MESSAGE_SENT', 'GROUP_CREATED', 'GROUP_JOINED', 'DM_OPENED', 'FILE_SHARED',
            'CALL_INITIATED', 'CALL_ENDED',
            // Admin
            'USER_BLOCKED', 'USER_UNBLOCKED', 'USER_DELETED', 'USER_APPROVED',
            'RECORD_UPDATED', 'DATA_DOWNLOADED', 'SETTINGS_CHANGED',
            // Generic
            'PAGE_VISIT', 'OTHER'
        ]
    },
    
    // Extra context
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    // e.g. { examId, examTitle, score, targetUserId, groupId, message: 'first 50 chars' }
    
    // For admin monitoring of messages
    messagePreview: { type: String }, // First 100 chars of message (unencrypted summary)
    
    ipAddress: { type: String },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
    
    createdAt: { type: Date, default: Date.now, index: true }
});

// Index for efficient querying
activityLogSchema.index({ schoolId: 1, createdAt: -1 });
activityLogSchema.index({ schoolId: 1, userId: 1 });
activityLogSchema.index({ schoolId: 1, action: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);

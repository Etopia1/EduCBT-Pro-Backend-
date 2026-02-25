const mongoose = require('mongoose');

const resultTemplateSchema = new mongoose.Schema({
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        unique: true // One template per school
    },
    templateName: { type: String, default: 'Result Sheet' },
    // Raw Excel file stored as base64 string
    fileBase64: { type: String, required: true },
    // Mapping: placeholder key in template → data field path
    // e.g. { "STUDENT_NAME": "fullName", "MATH_TEST": "testScores.mathematics" }
    fieldMappings: {
        type: Map,
        of: String,
        default: {}
    },
    // Metadata of placeholders found in the uploaded template
    detectedPlaceholders: [{ type: String }],
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ResultTemplate', resultTemplateSchema);

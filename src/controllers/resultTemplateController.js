const ResultTemplate = require('../models/ResultTemplate');
const multer = require('multer');

// Use memory storage — keep file in buffer
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel',  // .xls
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
}).single('template');

// ── Upload template ──────────────────────────────────────────────────
const uploadTemplate = async (req, res) => {
    upload(req, res, async (err) => {
        if (err) return res.status(400).json({ message: err.message });
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        try {
            const schoolId = req.user.schoolId;
            const fileBase64 = req.file.buffer.toString('base64');
            const templateName = req.body.templateName || req.file.originalname;

            // Parse detected placeholders sent from frontend
            let detectedPlaceholders = [];
            try {
                detectedPlaceholders = JSON.parse(req.body.detectedPlaceholders || '[]');
            } catch (_) { /* ignore */ }

            // Build default auto-mappings for common placeholders
            const defaultMappings = buildDefaultMappings(detectedPlaceholders);

            const existing = await ResultTemplate.findOne({ schoolId });
            if (existing) {
                existing.fileBase64 = fileBase64;
                existing.templateName = templateName;
                existing.detectedPlaceholders = detectedPlaceholders;
                existing.fieldMappings = defaultMappings;
                await existing.save();
                return res.json({ message: 'Template updated', template: sanitize(existing) });
            }

            const template = await ResultTemplate.create({
                schoolId,
                fileBase64,
                templateName,
                detectedPlaceholders,
                fieldMappings: defaultMappings,
            });

            res.status(201).json({ message: 'Template uploaded', template: sanitize(template) });
        } catch (error) {
            console.error('Upload template error:', error);
            res.status(500).json({ message: 'Failed to save template' });
        }
    });
};

// ── Get template (metadata + file for download) ───────────────────────
const getTemplate = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        const template = await ResultTemplate.findOne({ schoolId });
        if (!template) return res.status(404).json({ message: 'No template uploaded yet' });
        res.json({ template: sanitize(template) });
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ message: 'Failed to fetch template' });
    }
};

// ── Update field mappings ─────────────────────────────────────────────
const updateMappings = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        const { mappings } = req.body; // { placeholder: dataField, ... }

        const template = await ResultTemplate.findOne({ schoolId });
        if (!template) return res.status(404).json({ message: 'No template found' });

        template.fieldMappings = mappings;
        await template.save();

        res.json({ message: 'Mappings saved', template: sanitize(template) });
    } catch (error) {
        console.error('Update mappings error:', error);
        res.status(500).json({ message: 'Failed to update mappings' });
    }
};

// ── Download raw template file ────────────────────────────────────────
const downloadTemplate = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        const template = await ResultTemplate.findOne({ schoolId });
        if (!template) return res.status(404).json({ message: 'No template found' });

        const buffer = Buffer.from(template.fileBase64, 'base64');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${template.templateName}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Download template error:', error);
        res.status(500).json({ message: 'Failed to download template' });
    }
};

// ── Delete template ───────────────────────────────────────────────────
const deleteTemplate = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        await ResultTemplate.deleteOne({ schoolId });
        res.json({ message: 'Template deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete template' });
    }
};

// ── Helpers ────────────────────────────────────────────────────────────

// Returns template without the large base64 field unless specifically needed
const sanitize = (t) => ({
    _id: t._id,
    templateName: t.templateName,
    detectedPlaceholders: t.detectedPlaceholders,
    fieldMappings: Object.fromEntries(t.fieldMappings),
    fileBase64: t.fileBase64, // include for frontend processing
    updatedAt: t.updatedAt,
});

// Auto-map common placeholder patterns to data fields
const buildDefaultMappings = (placeholders) => {
    const auto = {
        // Student info
        STUDENT_NAME: 'fullName',
        FULL_NAME: 'fullName',
        NAME: 'fullName',
        REG_NO: 'registrationNumber',
        REG_NUMBER: 'registrationNumber',
        REGISTRATION_NUMBER: 'registrationNumber',
        GENDER: 'gender',
        CLASS: 'classLevel',
        CLASS_LEVEL: 'classLevel',
        TERM: 'term',
        ACADEMIC_YEAR: 'academicYear',
        ATTENDANCE: 'attendanceScore',
        TOTAL_SCORE: 'totalScore',
        AVERAGE: 'average',
        POSITION: 'position',
        REMARKS: 'remarks',
        CONDUCT: 'conduct',
        // Maths
        MATH_TEST: 'testScores.mathematics',
        MATH_EXAM: 'examScores.mathematics',
        MATH_TOTAL: 'subjectTotals.mathematics',
        MATHEMATICS_TEST: 'testScores.mathematics',
        MATHEMATICS_EXAM: 'examScores.mathematics',
        MATHEMATICS_TOTAL: 'subjectTotals.mathematics',
        // English
        ENGLISH_TEST: 'testScores.english',
        ENGLISH_EXAM: 'examScores.english',
        ENGLISH_TOTAL: 'subjectTotals.english',
        // Physics
        PHYSICS_TEST: 'testScores.physics',
        PHYSICS_EXAM: 'examScores.physics',
        PHYSICS_TOTAL: 'subjectTotals.physics',
        // Chemistry
        CHEMISTRY_TEST: 'testScores.chemistry',
        CHEMISTRY_EXAM: 'examScores.chemistry',
        CHEMISTRY_TOTAL: 'subjectTotals.chemistry',
        // Biology
        BIOLOGY_TEST: 'testScores.biology',
        BIOLOGY_EXAM: 'examScores.biology',
        BIOLOGY_TOTAL: 'subjectTotals.biology',
        // Geography
        GEOGRAPHY_TEST: 'testScores.geography',
        GEOGRAPHY_EXAM: 'examScores.geography',
        GEOGRAPHY_TOTAL: 'subjectTotals.geography',
        // Economics
        ECONOMICS_TEST: 'testScores.economics',
        ECONOMICS_EXAM: 'examScores.economics',
        ECONOMICS_TOTAL: 'subjectTotals.economics',
        // Commerce
        COMMERCE_TEST: 'testScores.commerce',
        COMMERCE_EXAM: 'examScores.commerce',
        COMMERCE_TOTAL: 'subjectTotals.commerce',
        // Accounting
        ACCOUNTING_TEST: 'testScores.accounting',
        ACCOUNTING_EXAM: 'examScores.accounting',
        ACCOUNTING_TOTAL: 'subjectTotals.accounting',
        // Government
        GOVERNMENT_TEST: 'testScores.government',
        GOVERNMENT_EXAM: 'examScores.government',
        GOVERNMENT_TOTAL: 'subjectTotals.government',
        // Literature
        LITERATURE_TEST: 'testScores.literature',
        LITERATURE_EXAM: 'examScores.literature',
        LITERATURE_TOTAL: 'subjectTotals.literature',
        // Computer Science
        CS_TEST: 'testScores.computerScience',
        CS_EXAM: 'examScores.computerScience',
        CS_TOTAL: 'subjectTotals.computerScience',
        COMPUTER_SCIENCE_TEST: 'testScores.computerScience',
        COMPUTER_SCIENCE_EXAM: 'examScores.computerScience',
        COMPUTER_SCIENCE_TOTAL: 'subjectTotals.computerScience',
    };

    const mapped = {};
    placeholders.forEach(p => {
        const key = p.replace(/[{}]/g, '').toUpperCase().trim();
        if (auto[key]) mapped[p] = auto[key];
    });

    return mapped;
};

module.exports = { uploadTemplate, getTemplate, updateMappings, downloadTemplate, deleteTemplate };

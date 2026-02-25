const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
    uploadTemplate,
    getTemplate,
    updateMappings,
    downloadTemplate,
    deleteTemplate
} = require('../controllers/resultTemplateController');

// All routes require authentication
// Role checks inside controllers via req.user.role
router.post('/upload', authMiddleware, uploadTemplate);
router.get('/', authMiddleware, getTemplate);
router.put('/mappings', authMiddleware, updateMappings);
router.get('/download', authMiddleware, downloadTemplate);
router.delete('/', authMiddleware, deleteTemplate);

module.exports = router;

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');
const { parser, cloudinaryUpload } = require('../utils/cloudinaryConfig');

router.use(authenticate);

// Groups list + create
router.get('/groups', chatController.getMyGroups);
router.post('/groups', chatController.createGroup);

// DM channel
router.post('/dm', chatController.openDM);

// Messages in a group
router.get('/groups/:groupId/messages', chatController.getMessages);
router.post('/groups/:groupId/messages', chatController.sendMessage);

// Add members to group
router.post('/groups/:groupId/members', chatController.addMembers);

// All school staff (for DM directory)
router.get('/staff', chatController.getSchoolStaff);

// Upload attachment
router.post('/upload', parser.single('file'), cloudinaryUpload, (req, res) => {
    if (!req.cloudinaryResult) return res.status(400).json({ message: 'Upload failed' });
    const fileType = req.file?.mimetype?.startsWith('image/') ? 'image' :
                     req.file?.mimetype?.startsWith('video/') ? 'video' : 'document';
    res.json({ url: req.cloudinaryResult.secure_url, type: fileType, name: req.file?.originalname });
});

module.exports = router;

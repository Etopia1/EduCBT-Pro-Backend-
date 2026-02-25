const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const { authenticate } = require('../middleware/auth');
const { parser, cloudinaryUpload } = require('../utils/cloudinaryConfig');

// All routes require authentication
router.use(authenticate);

// Get Feed
router.get('/feed', communityController.getSchoolFeed);

// Create Post
router.post('/create', communityController.createPost);

// Like Post
router.post('/like', communityController.toggleLike);

// Upload Attachment
router.post('/upload', parser.single('file'), cloudinaryUpload, communityController.uploadAttachment);

module.exports = router;

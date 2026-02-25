const CommunityPost = require('../models/CommunityPost');
const User = require('../models/User');

// Get all posts for the user's school
exports.getSchoolFeed = async (req, res) => {
    try {
        const schoolId = req.user.schoolId;
        const { page = 1, limit = 50 } = req.query;

        const posts = await CommunityPost.find({ schoolId })
            .sort({ createdAt: -1 }) // Newest first
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        res.json(posts.reverse()); // Return in chronological order for chat view
    } catch (error) {
        console.error('Error fetching community feed:', error);
        res.status(500).json({ message: 'Error fetching feed' });
    }
};

// Create a new post
exports.createPost = async (req, res) => {
    try {
        const { content, attachments } = req.body;

        // Validation: Must have content or attachments
        if (!content && (!attachments || attachments.length === 0)) {
            return res.status(400).json({ message: 'Post cannot be empty' });
        }

        const newPost = new CommunityPost({
            schoolId: req.user.schoolId,
            senderId: req.user._id,
            senderName: req.user.fullName,
            senderRole: req.user.role,
            senderAvatar: req.user.profilePicture, // Assuming this field exists on User
            content,
            attachments: attachments || []
        });

        const savedPost = await newPost.save();

        // Socket.IO is attached to app, but we can also emit here if we have access to io
        // We will rely on the frontend to emit the socket event OR access io via request (if set)
        const io = req.app.get('io');
        if (io) {
            io.to(`school_community_${req.user.schoolId}`).emit('new_post', savedPost);
        }

        res.status(201).json(savedPost);
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ message: 'Failed to create post' });
    }
};

// Like a post
exports.toggleLike = async (req, res) => {
    try {
        const { postId } = req.body;
        const userId = req.user._id;

        const post = await CommunityPost.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found' });

        const index = post.likes.indexOf(userId);
        if (index === -1) {
            post.likes.push(userId);
        } else {
            post.likes.splice(index, 1);
        }

        await post.save();
        res.json(post);
    } catch (error) {
        res.status(500).json({ message: 'Error updating like' });
    }
};

// Upload attachment
exports.uploadAttachment = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Determine type based on mimetype
        const mime = req.file.mimetype;
        let type = 'document';
        if (mime.startsWith('image/')) type = 'image';
        if (mime.startsWith('video/')) type = 'video';

        res.json({
            url: req.file.path, // Cloudinary URL
            type: type,
            name: req.file.originalname,
            public_id: req.file.filename
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Upload failed' });
    }
};

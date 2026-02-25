const jwt = require('jsonwebtoken');

module.exports = async (req, res, next) => {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Fetch full user to get schoolId if not in token (or put schoolId in token)
        // For now, let's assume token has minimal info, fetch user
        const User = require('../models/User'); // Lazy load
        const user = await User.findById(decoded.id).select('-password');
        if (!user) return res.status(401).json({ message: 'User not found' });

        // Check status
        if (user.status !== 'verified' && user.role !== 'admin') { // Allow legacy admin or check
            // If generic admin from seed, might not have status. 
            // But for new system:
            if (user.role !== 'admin' && user.status !== 'verified') { // 'admin' is legacy super admin
                return res.status(403).json({ message: 'Account pending approval or suspended' });
            }
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

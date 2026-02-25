const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const VerificationToken = require('../models/VerificationToken');
const { sendVerificationEmail } = require('../utils/emailService');

const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

exports.login = async (req, res) => {
    // Support both 'username' and 'loginId' fields for flexibility
    const { username, loginId, password } = req.body;
    const loginIdentifier = (username || loginId)?.trim();

    try {
        // Find user by Unique Login ID (SCH-..., TCH-..., STD-...)
        let user = await User.findOne({ uniqueLoginId: loginIdentifier });

        // Case-insensitive fallback
        if (!user) {
            user = await User.findOne({
                uniqueLoginId: { $regex: new RegExp(`^${loginIdentifier}$`, 'i') }
            });
        }

        if (!user) {
            console.log(`User not found: ${loginIdentifier}`);
            return res.status(401).json({ message: 'Invalid ID' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            console.log('Password mismatch');
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        console.log(`[LOGIN ATTEMPT] User: ${user.username}, Role: ${user.role}, Status: ${user.status}, Verified: ${user.verified}`);

        // Check Verification Status
        if (!user.verified && user.role === 'school_admin') {
            console.log('[LOGIN BLOCK] School Admin not verified');
            // Logic to auto-resend verification link
            let emailToSend = user.email;

            // Fallback: If user has no email, fetch from School model
            if (!emailToSend && user.schoolId) {
                const School = require('../models/School');
                const school = await School.findById(user.schoolId);
                if (school) emailToSend = school.email;
            }

            if (!emailToSend) {
                return res.status(500).json({ message: 'System Error: User email not found. Cannot send verification.' });
            }

            // 1. Check if valid token exists
            let tokenData = await VerificationToken.findOne({ userId: user.schoolId }); // School Admin verifies the School

            if (!tokenData) {
                // Create new token
                const token = crypto.randomBytes(32).toString('hex');
                tokenData = new VerificationToken({
                    userId: user.schoolId,
                    modelType: 'School',
                    token,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                });
                await tokenData.save();
            }

            // 2. Resend Email
            await sendVerificationEmail(emailToSend, tokenData.token, {
                loginId: user.uniqueLoginId
            });

            return res.status(403).json({ message: 'Account not verified. A new verification link has been sent to your email.' });
        } else if (user.status === 'pending' && user.role !== 'school_admin') {
            console.log('[LOGIN BLOCK] Account pending');
            return res.status(403).json({ message: 'Account pending approval. Please wait for your school admin to approve your request.' });
        } else if (user.status === 'suspended') {
            console.log('[LOGIN BLOCK] Account suspended');
            return res.status(403).json({ message: 'Account suspended. Please contact your school admin.' });
        } else if (!user.verified && user.role !== 'school_admin') {
            // Catch-all for other unverified (like students/teachers who might have verified=false if not auto-verified)
            console.log('[LOGIN BLOCK] Account not verified (catch-all)');
            return res.status(403).json({ message: 'Account not verified.' });
        }

        const token = generateToken(user._id, user.role);
        let inviteToken = null;

        if (user.role === 'school_admin' && user.schoolId && user.verified) {
            const Invite = require('../models/Invite');
            const School = require('../models/School');

            // Use the JWT token as the invite token
            inviteToken = token;

            // Create the Invite record so it passes validation
            // Note: Since JWT expires in 1d (24h), we match the invite expiration
            try {
                // Remove any old invites with this token (though unlikely for new JWTs) just in case
                // Or simply create new, allowing multiple valid tokens if needed
                await new Invite({
                    token: inviteToken,
                    schoolId: user.schoolId,
                    role: 'teacher', // Default to teacher invite power, or admin power if needed
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                }).save();

                // Save to School model
                await School.findByIdAndUpdate(user.schoolId, { inviteToken: inviteToken });
            } catch (err) {
                console.error("Error saving invite token on login:", err);
                // Proceed without failing login, though invite feature might break for this session
            }
        }

        // Populate school name if applicable
        let schoolName = 'School Management System';
        if (user.schoolId) {
            const School = require('../models/School');
            const school = await School.findById(user.schoolId);
            if (school) schoolName = school.name;
        }

        // Construct response user object
        const userResponse = {
            id: user._id,
            schoolId: user.schoolId,
            schoolName: schoolName,
            uniqueLoginId: user.uniqueLoginId,
            role: user.role,
            fullName: user.fullName,
            info: user.info // Include info for classLevel, etc.
        };

        if (inviteToken) {
            userResponse.inviteToken = inviteToken;
        }

        res.json({ token, user: userResponse });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.register = async (req, res) => {
    // Mostly for seeding/admin use
    const { username, password, fullName, role } = req.body;
    try {
        const user = new User({ username, password, fullName, role });
        await user.save();
        res.status(201).json({ message: 'User created' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
};

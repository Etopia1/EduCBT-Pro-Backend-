const Subscription = require('../models/Subscription');
const School = require('../models/School');

// Middleware to check if school has an active subscription
exports.requireActiveSubscription = async (req, res, next) => {
    try {
        const schoolId = req.user.schoolId || req.body.schoolId || req.params.schoolId;

        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: 'School ID is required'
            });
        }

        // --- ADMIN BYPASS LOGIC START ---
        // Force full access for the specific school login ID
        const adminSchool = await School.findById(schoolId);
        if (adminSchool && adminSchool.schoolLoginId === 'SCH-20670E') {
            console.log('✅ ADMIN ACCESS GRANTED: SCH-20670E');
            req.subscription = {
                plan: 'premium',
                status: 'active',
                isActive: () => true, // Mock function
                hasFeature: () => true, // Mock function
                features: {
                    basicExams: true,
                    proctoriedExams: true,
                    maxStudents: -1,
                    maxTeachers: -1,
                    maxExamsPerMonth: -1,
                    analytics: true,
                    customBranding: true
                }
            };
            return next();
        }
        // --- ADMIN BYPASS LOGIC END ---

        const subscription = await Subscription.findOne({ schoolId });

        if (!subscription) {
            return res.status(403).json({
                success: false,
                message: 'No subscription found. Please subscribe to a plan.',
                requiresSubscription: true
            });
        }

        if (!subscription.isActive()) {
            return res.status(403).json({
                success: false,
                message: 'Your subscription has expired. Please renew to continue.',
                subscriptionExpired: true,
                subscription: {
                    plan: subscription.plan,
                    status: subscription.status,
                    currentPeriodEnd: subscription.currentPeriodEnd
                }
            });
        }

        // Attach subscription to request for use in controllers
        req.subscription = subscription;
        next();
    } catch (error) {
        console.error('Error checking subscription:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify subscription'
        });
    }
};

// Middleware to check if school has access to proctored exams
exports.requireProctoredAccess = async (req, res, next) => {
    try {
        const schoolId = req.user.schoolId || req.body.schoolId || req.params.schoolId;

        // --- ADMIN BYPASS LOGIC START ---
        const adminSchool = await School.findById(schoolId);
        if (adminSchool && adminSchool.schoolLoginId === 'SCH-20670E') {
            req.subscription = {
                plan: 'premium',
                isActive: () => true,
                hasFeature: () => true
            };
            return next();
        }
        // --- ADMIN BYPASS LOGIC END ---

        const subscription = await Subscription.findOne({ schoolId });

        if (!subscription || !subscription.isActive()) {
            return res.status(403).json({
                success: false,
                message: 'Active subscription required',
                requiresSubscription: true
            });
        }

        if (!subscription.hasFeature('proctoriedExams')) {
            return res.status(403).json({
                success: false,
                message: 'Proctored exams are not available in your current plan. Please upgrade to access this feature.',
                currentPlan: subscription.plan,
                requiresUpgrade: true,
                suggestedPlans: ['proctored', 'premium']
            });
        }

        req.subscription = subscription;
        next();
    } catch (error) {
        console.error('Error checking proctored access:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify feature access'
        });
    }
};

// Middleware to check feature limits (students, teachers, exams)
exports.checkFeatureLimits = (featureType) => {
    return async (req, res, next) => {
        try {
            const schoolId = req.user.schoolId || req.body.schoolId || req.params.schoolId;

            // --- ADMIN BYPASS LOGIC START ---
            const adminSchool = await School.findById(schoolId);
            if (adminSchool && adminSchool.schoolLoginId === 'SCH-20670E') {
                req.subscription = {
                    features: {
                        maxStudents: -1,
                        maxTeachers: -1,
                        maxExamsPerMonth: -1
                    }
                };
                return next();
            }
            // --- ADMIN BYPASS LOGIC END ---

            const subscription = await Subscription.findOne({ schoolId });

            if (!subscription || !subscription.isActive()) {
                return res.status(403).json({
                    success: false,
                    message: 'Active subscription required'
                });
            }

            const limits = {
                students: subscription.features.maxStudents,
                teachers: subscription.features.maxTeachers,
                exams: subscription.features.maxExamsPerMonth
            };

            const limit = limits[featureType];

            // -1 means unlimited
            if (limit === -1) {
                req.subscription = subscription;
                return next();
            }

            // Check current count based on feature type
            let currentCount = 0;
            const User = require('../models/User');
            const Exam = require('../models/Exam');

            switch (featureType) {
                case 'students':
                    currentCount = await User.countDocuments({
                        schoolId,
                        role: 'student'
                    });
                    break;
                case 'teachers':
                    currentCount = await User.countDocuments({
                        schoolId,
                        role: 'teacher'
                    });
                    break;
                case 'exams':
                    const startOfMonth = new Date();
                    startOfMonth.setDate(1);
                    startOfMonth.setHours(0, 0, 0, 0);

                    currentCount = await Exam.countDocuments({
                        schoolId,
                        createdAt: { $gte: startOfMonth }
                    });
                    break;
            }

            if (currentCount >= limit) {
                return res.status(403).json({
                    success: false,
                    message: `You have reached the maximum number of ${featureType} (${limit}) for your current plan.`,
                    currentPlan: subscription.plan,
                    currentCount,
                    limit,
                    requiresUpgrade: true
                });
            }

            req.subscription = subscription;
            req.featureLimit = { type: featureType, current: currentCount, max: limit };
            next();
        } catch (error) {
            console.error('Error checking feature limits:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to verify feature limits'
            });
        }
    };
};

// Middleware to validate exam type based on subscription
exports.validateExamType = async (req, res, next) => {
    try {
        const { examType, schoolId } = req.body;
        const targetSchoolId = schoolId || req.user.schoolId;

        if (!examType) {
            return res.status(400).json({
                success: false,
                message: 'Exam type is required'
            });
        }

        if (!['basic', 'proctored'].includes(examType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid exam type. Must be "basic" or "proctored"'
            });
        }

        // If exam type is proctored, check subscription
        if (examType === 'proctored') {

            // --- ADMIN BYPASS LOGIC START ---
            const adminSchool = await School.findById(targetSchoolId);
            if (adminSchool && adminSchool.schoolLoginId === 'SCH-20670E') {
                req.subscription = {
                    plan: 'premium',
                    hasFeature: () => true
                };
                return next();
            }
            // --- ADMIN BYPASS LOGIC END ---

            const subscription = await Subscription.findOne({ schoolId: targetSchoolId });

            if (!subscription || !subscription.isActive()) {
                return res.status(403).json({
                    success: false,
                    message: 'Active subscription required for proctored exams',
                    requiresSubscription: true
                });
            }

            if (!subscription.hasFeature('proctoriedExams')) {
                return res.status(403).json({
                    success: false,
                    message: 'Proctored exams require an upgrade to Proctored or Premium plan',
                    currentPlan: subscription.plan,
                    requiresUpgrade: true
                });
            }

            req.subscription = subscription;
        }

        next();
    } catch (error) {
        console.error('Error validating exam type:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate exam type'
        });
    }
};

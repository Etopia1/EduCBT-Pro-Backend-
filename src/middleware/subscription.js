const Subscription = require('../models/Subscription');
const School = require('../models/School');

// Mock subscription for free access
const freeSubscription = {
    plan: 'premium',
    status: 'active',
    isActive: () => true,
    hasFeature: () => true,
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

// Middleware to check if school has an active subscription
exports.requireActiveSubscription = async (req, res, next) => {
    req.subscription = freeSubscription;
    next();
};

// Middleware to check if school has access to proctored exams
exports.requireProctoredAccess = async (req, res, next) => {
    req.subscription = freeSubscription;
    next();
};

// Middleware to check feature limits (students, teachers, exams)
exports.checkFeatureLimits = (featureType) => {
    return async (req, res, next) => {
        req.subscription = freeSubscription;
        req.featureLimit = { type: featureType, current: 0, max: -1 };
        next();
    };
};

// Middleware to check for proctored exam creation
exports.validateExamType = async (req, res, next) => {
    req.subscription = freeSubscription;
    next();
};

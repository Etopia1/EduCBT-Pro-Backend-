const authenticate = require('./authMiddleware');
const authorize = require('./roleMiddleware');

// Wrapper for authorizeRoles to match the expected API
const authorizeRoles = (...roles) => authorize(...roles);

module.exports = {
    authenticate,
    authorizeRoles
};

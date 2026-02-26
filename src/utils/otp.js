const crypto = require('crypto');

/**
 * Generate a random numeric OTP of specified length
 * @param {number} length - Length of OTP (default 6)
 * @returns {string} - The generated OTP
 */
exports.generateOTP = (length = 6) => {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[crypto.randomInt(0, 10)];
    }
    return otp;
};

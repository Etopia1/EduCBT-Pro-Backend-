const crypto = require('crypto');

/**
 * Generates a unique ID with a prefix.
 * Format: PREFIX-XXXXXX (6 alphanumeric chars)
 * @param {string} prefix - The prefix (e.g., SCH, TCH, STD)
 * @returns {string} - The generated ID
 */
exports.generateUniqueId = (prefix) => {
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${randomPart}`;
};

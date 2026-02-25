const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config();

// Configure Cloudinary with credentials from .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Use memory storage — files are held in buffer, then streamed to Cloudinary
const storage = multer.memoryStorage();
const parser = multer({ storage });

/**
 * Upload a file buffer to Cloudinary v2 via upload_stream.
 * @param {Buffer} buffer  - The file buffer from multer memoryStorage
 * @param {Object} options - Cloudinary upload options (folder, resource_type, public_id, etc.)
 * @returns {Promise<Object>} Cloudinary upload result
 */
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    uploadStream.end(buffer);
  });
}

/**
 * Express middleware that uploads req.file (from multer) to Cloudinary
 * and attaches the result to req.cloudinaryResult.
 * Supports images, videos, and raw files based on mimetype.
 */
async function cloudinaryUpload(req, res, next) {
  if (!req.file) return next();

  try {
    let resource_type = 'image';
    if (req.file.mimetype.startsWith('video/')) resource_type = 'video';
    if (
      req.file.mimetype.startsWith('application/') ||
      req.file.mimetype.startsWith('text/')
    ) resource_type = 'raw';

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'cbt_schools',
      resource_type,
      public_id: req.file.originalname.split('.')[0] + '-' + Date.now()
    });

    // Attach result so controllers can access secure_url, public_id, etc.
    req.cloudinaryResult = result;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { parser, cloudinary, uploadToCloudinary, cloudinaryUpload };

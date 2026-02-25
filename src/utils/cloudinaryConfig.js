const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config();

// Ensure Cloudinary is configured
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let resource_type = 'image';
    if (file.mimetype.startsWith('video/')) resource_type = 'video';
    if (file.mimetype.startsWith('application/') || file.mimetype.startsWith('text/')) resource_type = 'raw';

    return {
      folder: 'cbt_schools',
      resource_type: resource_type,
      public_id: file.originalname.split('.')[0] + '-' + Date.now().toString()
    };
  },
});

const parser = multer({ storage: storage });

module.exports = { parser, cloudinary };

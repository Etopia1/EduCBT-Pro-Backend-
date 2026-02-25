const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    uniqueLoginId: { type: String, unique: true }, // TCH-XXX or STD-XXX or SCH-XXX
    username: { type: String, unique: true, sparse: true }, // Added to satisfy legacy index or future use
    email: { type: String }, // Optional for students, required for teachers?
    password: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'school_admin', 'teacher', 'student'], default: 'student' },
    fullName: { type: String, required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] }, // Added Gender
    profilePicture: { type: String }, // Cloudinary URL for profile picture
    verified: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'verified', 'suspended'], default: 'pending' },
    info: {
        registrationNumber: String,
        classLevel: String,
        subjects: [String],
        phone: String,
        location: String,
        dateOfBirth: Date // Added DOB for age calculation
    }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

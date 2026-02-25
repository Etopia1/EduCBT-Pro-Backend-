const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const School = require('../models/School');
const VerificationToken = require('../models/VerificationToken');
const Invite = require('../models/Invite'); // Optional if you have invites

dotenv.config();

const resetDb = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        await User.deleteMany({});
        console.log('Deleted all Users');

        await School.deleteMany({});
        console.log('Deleted all Schools');

        await VerificationToken.deleteMany({});
        console.log('Deleted all Verification Tokens');

        await Invite.deleteMany({});
        console.log('Deleted all Invites');

        console.log('Database Reset Complete');
        process.exit(0);
    } catch (error) {
        console.error('Error resetting database:', error);
        process.exit(1);
    }
};

resetDb();

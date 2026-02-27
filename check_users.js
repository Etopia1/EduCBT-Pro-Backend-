const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config({ path: '.env' });

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const admins = await User.find({ role: 'school_admin' }).select('fullName role status verified schoolId');
        console.log('--- SCHOOL ADMINS ---');
        console.log(JSON.stringify(admins, null, 2));
        
        const count = await User.countDocuments({ role: 'school_admin' });
        console.log(`Total school admins: ${count}`);

        process.exit(0);
    } catch (err) {
        console.error("Diagnostic failed", err);
        process.exit(1);
    }
}

checkUsers();

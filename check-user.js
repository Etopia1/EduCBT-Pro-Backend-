const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config({ path: '.env' });

async function checkUser() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const id = "SCH-20670E";
        const userByUniqueId = await User.findOne({ uniqueLoginId: id });
        console.log(`Searching for uniqueLoginId: ${id}`);
        if (userByUniqueId) {
            console.log("SUCCESS: User found!");
            console.log(JSON.stringify(userByUniqueId, null, 2));
        } else {
            console.log("FAILURE: User NOT found in uniqueLoginId field.");

            // Try searching other fields just in case
            const userByUsername = await User.findOne({ username: id });
            if (userByUsername) {
                console.log("HINT: Found user by 'username' field, but not 'uniqueLoginId'!");
            } else {
                console.log("Checking all users to see if any exist...");
                const allUsers = await User.find({}).limit(5).select('uniqueLoginId username role');
                console.log("First 5 users in DB:", allUsers);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error("Diagnostic failed", err);
        process.exit(1);
    }
}

checkUser();

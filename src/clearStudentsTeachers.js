const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');

async function deleteStudentsAndTeachers() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        console.log('Deleting students and teachers...');
        const result = await User.deleteMany({
            role: { $in: ["student", "teacher"] }
        });

        console.log(`✅ Successfully deleted ${result.deletedCount} users`);
        console.log('   - Students and teachers have been removed');
        console.log('   - School admins are preserved');

        await mongoose.connection.close();
        console.log('Database connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

deleteStudentsAndTeachers();

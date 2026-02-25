const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const clearDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cbt_system');
        console.log('Connected to MongoDB...');

        const collections = ['users', 'schools', 'invites', 'verificationtokens', 'exams', 'sessions'];

        for (const collectionName of collections) {
            try {
                await mongoose.connection.collection(collectionName).drop();
                console.log(`Dropped collection: ${collectionName}`);
            } catch (err) {
                if (err.code === 26) {
                    console.log(`Collection ${collectionName} not found (already empty).`);
                } else {
                    console.log(`Error dropping ${collectionName}:`, err.message);
                }
            }
        }

        console.log('Database cleared successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error clearing database:', error);
        process.exit(1);
    }
};

clearDatabase();

const mongoose = require('mongoose');
const User = require('./models/User');
const Exam = require('./models/Exam');
const bcrypt = require('bcryptjs');

// FORCE LOCAL CONNECTION STRING
const MONGO_URI = "mongodb://127.0.0.1:27017/cbt_system";

const seedData = async () => {
    try {
        console.log('Connecting to MongoDB...', MONGO_URI);
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('MongoDB Connected');

        // Clear existing data
        console.log('Clearing existing data...');
        await User.deleteMany({});
        await Exam.deleteMany({});

        // Create Admin
        console.log('Creating Admin...');
        const admin = new User({
            username: 'admin',
            password: 'password123', // Will be hashed by pre-save hook
            role: 'admin',
            fullName: 'System Admin'
        });
        await admin.save();

        // Create Student
        console.log('Creating Student...');
        const student = new User({
            username: 'student',
            password: 'password123', // Will be hashed by pre-save hook
            role: 'student',
            fullName: 'John Doe'
        });
        await student.save();

        // Create Exam
        console.log('Creating Exam...');
        const exam = new Exam({
            title: 'General Knowledge Test',
            durationMinutes: 30,
            questions: [
                {
                    text: 'What is the capital of France?',
                    options: ['Berlin', 'Madrid', 'Paris', 'Lisbon'],
                    correctOption: 2
                },
                {
                    text: 'Which planet is known as the Red Planet?',
                    options: ['Earth', 'Mars', 'Jupiter', 'Saturn'],
                    correctOption: 1
                },
                {
                    text: 'What is 2 + 2?',
                    options: ['3', '4', '5', '6'],
                    correctOption: 1
                }
            ]
        });
        await exam.save();

        console.log('Data Seeded Successfully');
        process.exit();
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

seedData();

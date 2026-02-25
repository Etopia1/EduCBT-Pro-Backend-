const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Exam = require('./models/Exam');

dotenv.config();

const seedData = async () => {
    try {
        console.log('Connecting to MongoDB...', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI, {
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
            password: 'password123',
            role: 'admin',
            fullName: 'System Admin'
        });
        await admin.save();

        // Create Student
        console.log('Creating Student...');
        const student = new User({
            username: 'student',
            password: 'password123',
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

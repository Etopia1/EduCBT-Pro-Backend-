const mongoose = require('mongoose');
const Exam = require('./models/Exam');
const User = require('./models/User'); // Required for population/references
const School = require('./models/School'); // Required for population/references
require('dotenv').config();

async function checkExams() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const schoolId = '697f7679639bd98ff41decf9'; // From logs
        const exams = await Exam.find({ schoolId });

        console.log(`Found ${exams.length} exams for school ${schoolId}:`);
        exams.forEach(exam => {
            console.log(`ID: ${exam._id}`);
            console.log(`Title: ${exam.title}`);
            console.log(`Status: ${exam.status}`);
            console.log(`IsActive: ${exam.isActive}`);
            console.log(`ClassLevel: '${exam.classLevel}'`); // Quote to see spaces/undefined
            console.log('---');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkExams();

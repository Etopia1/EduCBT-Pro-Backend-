require('dotenv').config();
const mongoose = require('mongoose');
const Exam = require('./models/Exam');

const checkExams = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI + 'cbt_system');

        const exams = await Exam.find();
        console.log(`Total exams: ${exams.length}\n`);

        exams.forEach(e => {
            console.log(`Exam: ${e.title}`);
            console.log(`  isActive: ${e.isActive}`);
            console.log(`  status: ${e.status}`);
            console.log(`  classLevel: ${e.classLevel}`);
            console.log('');
        });

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkExams();

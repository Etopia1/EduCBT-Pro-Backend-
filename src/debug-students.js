require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Exam = require('./models/Exam');
const School = require('./models/School');

const debug = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI + 'cbt_system');
        console.log('MongoDB Connected ✅\n');

        // Find all schools
        const schools = await School.find();
        console.log(`📚 Total Schools: ${schools.length}`);
        schools.forEach(s => console.log(`   - ${s.schoolName} (ID: ${s._id})`));

        // Find all students
        const students = await User.find({ role: 'student' });
        console.log(`\n👨‍🎓 Total Students: ${students.length}`);
        students.forEach(s => {
            console.log(`   - ${s.fullName || s.username}`);
            console.log(`     Username: ${s.username}`);
            console.log(`     School: ${s.schoolId}`);
            console.log(`     Class Level: ${s.info?.classLevel || 'NOT SET ❌'}`);
            console.log('');
        });

        // Find all teachers
        const teachers = await User.find({ role: 'teacher' });
        console.log(`👨‍🏫 Total Teachers: ${teachers.length}`);
        teachers.forEach(t => {
            console.log(`   - ${t.fullName || t.username}`);
            console.log(`     Username: ${t.username}`);
            console.log(`     School: ${t.schoolId}`);
            console.log(`     Subjects: ${t.info?.subjects?.join(', ') || 'None'}`);
            console.log('');
        });

        // Find all exams
        const exams = await Exam.find().populate('teacherId', 'fullName');
        console.log(`📝 Total Exams: ${exams.length}`);
        exams.forEach(e => {
            console.log(`   - ${e.title}`);
            console.log(`     Subject: ${e.subject}`);
            console.log(`     Class Level: ${e.classLevel || 'NOT SET ❌'}`);
            console.log(`     School: ${e.schoolId}`);
            console.log(`     Teacher: ${e.teacherId?.fullName || 'Unknown'}`);
            console.log(`     Active: ${e.isActive ? '✅' : '❌'}`);
            console.log(`     Questions: ${e.questions?.length || 0}`);
            console.log('');
        });

        // Test student exam fetch logic
        console.log('🔍 Testing Student Exam Fetch Logic:\n');
        for (const student of students) {
            if (!student.info?.classLevel) {
                console.log(`❌ Student ${student.username} has NO class level assigned!`);
                continue;
            }

            const matchingExams = await Exam.find({
                schoolId: student.schoolId,
                classLevel: student.info.classLevel,
                isActive: true
            });

            console.log(`Student: ${student.fullName || student.username} (${student.info.classLevel})`);
            console.log(`Should see ${matchingExams.length} exam(s):`);
            matchingExams.forEach(e => console.log(`   ✅ ${e.title} (${e.subject})`));
            console.log('');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

debug();

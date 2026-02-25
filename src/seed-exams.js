require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Exam = require('./models/Exam');
const School = require('./models/School');

const seedData = async () => {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(process.env.MONGO_URI + 'cbt_system');
        console.log('MongoDB Connected ✅\n');

        // Clear existing data (OPTIONAL - comment out if you want to keep existing data)
        console.log('Clearing test data...');
        await Exam.deleteMany({ title: { $regex: /Test Exam|Mathematics Quiz|Science Quiz/i } });

        // Find an existing school, teacher, and student (assuming you already have them)
        const school = await School.findOne();
        if (!school) {
            console.log('❌ No school found! Please create a school first.');
            process.exit(1);
        }
        console.log(`✅ Using school: ${school.schoolName}`);

        // Find a teacher
        const teacher = await User.findOne({ role: 'teacher', schoolId: school._id });
        if (!teacher) {
            console.log('❌ No teacher found! Please create a teacher first.');
            process.exit(1);
        }
        console.log(`✅ Using teacher: ${teacher.fullName} (Subject: ${teacher.info?.subject || 'N/A'})`);

        // Find students
        const students = await User.find({ role: 'student', schoolId: school._id });
        console.log(`✅ Found ${students.length} students\n`);

        // Create exams for different class levels
        const classLevels = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];

        for (const classLevel of classLevels) {
            const exam = new Exam({
                title: `${teacher.info?.subject || 'General'} Test - ${classLevel}`,
                subject: teacher.info?.subject || 'General Knowledge',
                classLevel: classLevel,
                durationMinutes: 30,
                teacherId: teacher._id,
                schoolId: school._id,
                questions: [
                    {
                        text: `What is the capital of Nigeria? (${classLevel})`,
                        options: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt'],
                        correctOptions: [1]
                    },
                    {
                        text: `How many states are in Nigeria?`,
                        options: ['32', '34', '36', '38'],
                        correctOptions: [2]
                    },
                    {
                        text: `What is 15 + 25?`,
                        options: ['30', '35', '40', '45'],
                        correctOptions: [2]
                    },
                    {
                        text: `Which planet is closest to the sun?`,
                        options: ['Venus', 'Earth', 'Mercury', 'Mars'],
                        correctOptions: [2]
                    },
                    {
                        text: `What is the square root of 144?`,
                        options: ['10', '11', '12', '13'],
                        correctOptions: [2]
                    }
                ],
                passingPercentage: 60,
                isActive: true
            });
            await exam.save();
            console.log(`✅ Created exam for ${classLevel}`);
        }

        console.log('\n=== Seed Data Created Successfully ✅ ===');
        console.log('\nNow students will see exams based on their class level:');
        students.forEach(s => {
            console.log(`- ${s.fullName} (${s.info?.classLevel || 'No class'}) will see ${s.info?.classLevel || 'no'} exams`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding data:', error);
        process.exit(1);
    }
};

seedData();

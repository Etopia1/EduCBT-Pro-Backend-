const mongoose = require('mongoose');
const User = require('./models/User');
const Exam = require('./models/Exam');
const School = require('./models/School');

// FORCE LOCAL CONNECTION STRING
const MONGO_URI = "mongodb://127.0.0.1:27017/cbt_system";

const seedData = async () => {
    try {
        console.log('Connecting to MongoDB...', MONGO_URI);
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('MongoDB Connected ✅');

        // Clear existing data
        console.log('Clearing existing data...');
        await User.deleteMany({});
        await Exam.deleteMany({});
        await School.deleteMany({});

        // 1. Create School
        console.log('Creating School...');
        const school = new School({
            schoolName: 'Demo High School',
            email: 'admin@demohighschool.com',
            address: '123 Education Street',
            phone: '123-456-7890'
        });
        await school.save();
        console.log('School created:', school.schoolName, '| ID:', school._id);

        // 2. Create School Admin
        console.log('Creating School Admin...');
        const schoolAdmin = new User({
            username: 'schooladmin',
            password: 'password123',
            role: 'school_admin',
            fullName: 'School Administrator',
            email: 'admin@demohighschool.com',
            schoolId: school._id,
            schoolName: school.schoolName,
            schoolLogo: school.logoUrl
        });
        await schoolAdmin.save();
        console.log('School Admin created ✅');

        // 3. Create Teacher
        console.log('Creating Teacher...');
        const teacher = new User({
            username: 'teacher1',
            password: 'password123',
            role: 'teacher',
            fullName: 'Mr. John Smith',
            email: 'teacher1@demohighschool.com',
            schoolId: school._id,
            schoolName: school.schoolName,
            schoolLogo: school.logoUrl,
            info: {
                classLevel: 'Grade 10',
                subject: 'Mathematics'
            }
        });
        await teacher.save();
        console.log('Teacher created:', teacher.fullName, '| Class:', teacher.info.classLevel);

        // 4. Create Student
        console.log('Creating Student...');
        const student = new User({
            username: 'student1',
            password: 'password123',
            role: 'student',
            fullName: 'Jane Doe',
            email: 'student1@demohighschool.com',
            schoolId: school._id,
            schoolName: school.schoolName,
            schoolLogo: school.logoUrl,
            info: {
                classLevel: 'Grade 10' // MUST match teacher's classLevel
            }
        });
        await student.save();
        console.log('Student created:', student.fullName, '| Class:', student.info.classLevel);

        // 5. Create Exam
        console.log('Creating Exam...');
        const exam = new Exam({
            title: 'Mathematics Quiz - Algebra',
            subject: 'Mathematics',
            durationMinutes: 30,
            teacherId: teacher._id,
            schoolId: school._id,
            classLevel: 'Grade 10',
            questions: [
                {
                    text: 'What is the value of x in the equation 2x + 5 = 15?',
                    options: ['5', '10', '7.5', '3'],
                    correctOptions: [0]
                },
                {
                    text: 'Which of the following is a prime number?',
                    options: ['15', '17', '21', '25'],
                    correctOptions: [1]
                },
                {
                    text: 'What is the area of a rectangle with length 8 and width 5?',
                    options: ['13', '26', '40', '80'],
                    correctOptions: [2]
                },
                {
                    text: 'Solve: 3(x + 2) = 21. What is x?',
                    options: ['5', '6', '7', '9'],
                    correctOptions: [0]
                },
                {
                    text: 'What is 15% of 200?',
                    options: ['20', '25', '30', '35'],
                    correctOptions: [2]
                }
            ],
            passingPercentage: 60,
            isActive: true
        });
        await exam.save();
        console.log('Exam created:', exam.title, '| Questions:', exam.questions.length);

        // 6. Create another exam
        console.log('Creating second exam...');
        const exam2 = new Exam({
            title: 'Science Quiz - Physics',
            subject: 'Science',
            durationMinutes: 45,
            teacherId: teacher._id,
            schoolId: school._id,
            classLevel: 'Grade 10',
            questions: [
                {
                    text: 'What is the SI unit of force?',
                    options: ['Joule', 'Newton', 'Watt', 'Pascal'],
                    correctOptions: [1]
                },
                {
                    text: 'What is the speed of light in vacuum?',
                    options: ['3 × 10^8 m/s', '3 × 10^6 m/s', '3 × 10^10 m/s', '3 × 10^5 m/s'],
                    correctOptions: [0]
                },
                {
                    text: 'Which planet is closest to the Sun?',
                    options: ['Venus', 'Earth', 'Mercury', 'Mars'],
                    correctOptions: [2]
                }
            ],
            passingPercentage: 70,
            isActive: true
        });
        await exam2.save();
        console.log('Second exam created:', exam2.title);

        console.log('\n=== Data Seeded Successfully ✅ ===');
        console.log('\nLogin Credentials:');
        console.log('School Admin: username=schooladmin, password=password123');
        console.log('Teacher: username=teacher1, password=password123');
        console.log('Student: username=student1, password=password123');
        console.log('\nStudent should see', 2, 'exams for Grade 10');

        process.exit();
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

seedData();

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Exam = require('./models/Exam');
const School = require('./models/School');

const fullSeed = async () => {
    try {
        console.log('🔌 Connecting to MongoDB Atlas...');
        await mongoose.connect(process.env.MONGO_URI + 'cbt_system');
        console.log('✅ MongoDB Connected!\n');

        // Clear existing data
        console.log('🗑️  Clearing existing data...');
        await User.deleteMany({});
        await Exam.deleteMany({});
        await School.deleteMany({});
        console.log('✅ Data cleared!\n');

        // 1. Create School
        console.log('🏫 Creating School...');
        const school = new School({
            name: 'Lagos Model College',
            email: 'admin@lagosmodel.edu.ng',
            address: '123 Victoria Island, Lagos',
            phone: '080-1234-5678',
            logoUrl: 'https://res.cloudinary.com/dujccg008/image/upload/v1/school_logos/default_logo.png',
            verified: true,
            status: 'active'
        });
        await school.save();
        console.log(`✅ School created: ${school.name}\n`);

        // 2. Create School Admin
        console.log('👨‍💼 Creating School Admin...');
        const schoolAdmin = new User({
            uniqueLoginId: 'SCH-ADM-001',
            username: 'admin123',
            password: 'password123',
            role: 'school_admin',
            fullName: 'Mr. Administrator',
            email: 'admin@lagosmodel.edu.ng',
            schoolId: school._id,
            schoolName: school.name,
            schoolLogo: school.logoUrl,
            status: 'verified',
            emailVerified: true
        });
        await schoolAdmin.save();
        console.log(`✅ Admin created: ${schoolAdmin.username}\n`);

        // 3. Create Teachers for different subjects
        console.log('👨‍🏫 Creating Teachers...');
        const mathTeacher = new User({
            uniqueLoginId: 'TCH-MATH-001',
            username: 'teacher_math',
            password: 'password123',
            role: 'teacher',
            fullName: 'Mrs. Adebayo',
            email: 'adebayo@lagosmodel.edu.ng',
            schoolId: school._id,
            schoolName: school.name,
            schoolLogo: school.logoUrl,
            status: 'verified',
            emailVerified: true,
            info: {
                subjects: ['Mathematics'],
                phone: '080-1111-2222'
            }
        });
        await mathTeacher.save();
        console.log(`✅ Math Teacher: ${mathTeacher.fullName}`);

        const scienceTeacher = new User({
            uniqueLoginId: 'TCH-SCI-001',
            username: 'teacher_science',
            password: 'password123',
            role: 'teacher',
            fullName: 'Mr. Okonkwo',
            email: 'okonkwo@lagosmodel.edu.ng',
            schoolId: school._id,
            schoolName: school.name,
            schoolLogo: school.logoUrl,
            status: 'verified',
            emailVerified: true,
            info: {
                subjects: ['Physics', 'Chemistry', 'Biology'],
                phone: '080-3333-4444'
            }
        });
        await scienceTeacher.save();
        console.log(`✅ Science Teacher: ${scienceTeacher.fullName}\n`);

        // 4. Create Students for different classes
        console.log('👨‍🎓 Creating Students...');

        const student1 = new User({
            uniqueLoginId: 'STD-JSS1-001',
            username: 'student_jss1',
            password: 'password123',
            role: 'student',
            fullName: 'Ahmed Ibrahim',
            email: 'ahmed@student.lagosmodel.edu.ng',
            schoolId: school._id,
            schoolName: school.name,
            schoolLogo: school.logoUrl,
            status: 'verified',
            emailVerified: true,
            info: {
                classLevel: 'JSS1',
                phone: '080-5555-6666'
            }
        });
        await student1.save();
        console.log(`✅ Student JSS1: ${student1.fullName} (${student1.username})`);

        const student2 = new User({
            uniqueLoginId: 'STD-SS2-001',
            username: 'student_ss2',
            password: 'password123',
            role: 'student',
            fullName: 'Fatima Mohammed',
            email: 'fatima@student.lagosmodel.edu.ng',
            schoolId: school._id,
            schoolName: school.name,
            schoolLogo: school.logoUrl,
            status: 'verified',
            emailVerified: true,
            info: {
                classLevel: 'SS2',
                phone: '080-7777-8888'
            }
        });
        await student2.save();
        console.log(`✅ Student SS2: ${student2.fullName} (${student2.username})\n`);

        // 5. Create Exams for different classes
        console.log('📝 Creating Exams...');

        // JSS1 Math Exam
        const jss1MathExam = new Exam({
            title: 'Mathematics - Basic Arithmetic',
            subject: 'Mathematics',
            classLevel: 'JSS1',
            durationMinutes: 30,
            teacherId: mathTeacher._id,
            schoolId: school._id,
            questions: [
                {
                    text: 'What is 25 + 17?',
                    options: ['40', '42', '43', '45'],
                    correctOptions: [1]
                },
                {
                    text: 'What is 8 × 7?',
                    options: ['54', '56', '58', '60'],
                    correctOptions: [1]
                },
                {
                    text: 'What is 100 - 37?',
                    options: ['61', '62', '63', '64'],
                    correctOptions: [2]
                },
                {
                    text: 'What is half of 50?',
                    options: ['20', '25', '30', '35'],
                    correctOptions: [1]
                },
                {
                    text: 'How many sides does a triangle have?',
                    options: ['2', '3', '4', '5'],
                    correctOptions: [1]
                }
            ],
            passingPercentage: 60,
            isActive: true,
            totalMarks: 100
        });
        await jss1MathExam.save();
        console.log(`✅ Created: ${jss1MathExam.title} (JSS1)`);

        // SS2 Math Exam
        const ss2MathExam = new Exam({
            title: 'Mathematics - Algebra & Equations',
            subject: 'Mathematics',
            classLevel: 'SS2',
            durationMinutes: 45,
            teacherId: mathTeacher._id,
            schoolId: school._id,
            questions: [
                {
                    text: 'Solve for x: 2x + 5 = 15',
                    options: ['x = 3', 'x = 5', 'x = 7', 'x = 10'],
                    correctOptions: [1]
                },
                {
                    text: 'What is the slope of the line y = 3x + 2?',
                    options: ['2', '3', '5', '6'],
                    correctOptions: [1]
                },
                {
                    text: 'Simplify: (x²)(x³)',
                    options: ['x⁵', 'x⁶', '2x⁵', 'x⁸'],
                    correctOptions: [0]
                },
                {
                    text: 'What is the square root of 144?',
                    options: ['10', '11', '12', '13'],
                    correctOptions: [2]
                }
            ],
            passingPercentage: 70,
            isActive: true,
            totalMarks: 100
        });
        await ss2MathExam.save();
        console.log(`✅ Created: ${ss2MathExam.title} (SS2)`);

        // SS2 Physics Exam
        const ss2PhysicsExam = new Exam({
            title: 'Physics - Motion and Forces',
            subject: 'Physics',
            classLevel: 'SS2',
            durationMinutes: 40,
            teacherId: scienceTeacher._id,
            schoolId: school._id,
            questions: [
                {
                    text: 'What is the SI unit of force?',
                    options: ['Joule', 'Newton', 'Watt', 'Pascal'],
                    correctOptions: [1]
                },
                {
                    text: 'What is the formula for velocity?',
                    options: ['v = d/t', 'v = t/d', 'v = d×t', 'v = t-d'],
                    correctOptions: [0]
                },
                {
                    text: 'What is the acceleration due to gravity?',
                    options: ['8.9 m/s²', '9.8 m/s²', '10.8 m/s²', '11.8 m/s²'],
                    correctOptions: [1]
                }
            ],
            passingPercentage: 65,
            isActive: true,
            totalMarks: 100
        });
        await ss2PhysicsExam.save();
        console.log(`✅ Created: ${ss2PhysicsExam.title} (SS2)\n`);

        // Summary
        console.log('═══════════════════════════════════════════');
        console.log('✅ DATABASE SEEDED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════\n');

        console.log('📋 LOGIN CREDENTIALS:\n');
        console.log('School Admin:');
        console.log(`  Username: admin123`);
        console.log(`  Password: password123\n`);

        console.log('Teachers:');
        console.log(`  Math Teacher - Username: teacher_math, Password: password123`);
        console.log(`  Science Teacher - Username: teacher_science, Password: password123\n`);

        console.log('Students:');
        console.log(`  JSS1 Student - Username: student_jss1, Password: password123`);
        console.log(`  SS2 Student - Username: student_ss2, Password: password123\n`);

        console.log('📝 EXAM SUMMARY:');
        console.log(`  student_jss1 (JSS1) should see: 1 exam (Mathematics)`);
        console.log(`  student_ss2 (SS2) should see: 2 exams (Mathematics, Physics)\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

fullSeed();

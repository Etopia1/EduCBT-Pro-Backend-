const mongoose = require('mongoose');
const dotenv = require('dotenv');
const School = require('../src/models/School');
const Subscription = require('../src/models/Subscription');

dotenv.config({ path: '../.env' }); // Adjust path if needed

const SCHOOL_LOGIN_ID = 'SCH-20670E';

const upgradeSchool = async () => {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        console.log(`Searching for school: ${SCHOOL_LOGIN_ID}...`);
        // Note: Regex to match case insensitive if needed, but ID is usually exact.
        // I'll try exact first.
        const school = await School.findOne({ schoolLoginId: SCHOOL_LOGIN_ID });

        if (!school) {
            console.error('School not found!');
            process.exit(1);
        }

        console.log(`Found School: ${school.name} (${school._id})`);

        if (!school.subscriptionId) {
            console.log('School has no subscription linked. Creating Premium one...');
            const newSub = new Subscription({
                schoolId: school._id,
                plan: 'premium',
                status: 'active',
                billingCycle: 'yearly',
                startDate: new Date(),
                endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 100)), // LIFETIME
                features: {
                    maxStudents: 999999,
                    maxTeachers: 999999,
                    maxConcurrentExams: 9999,
                    storageGB: 1000,
                    customDomain: true,
                    apiAccess: true,
                    proctoriedExams: true,
                    aiGrading: true,
                    whitelabel: true
                }
            });
            await newSub.save();
            school.subscriptionId = newSub._id;
            await school.save();
            console.log('Created and linked new Premium subscription.');
        } else {
            console.log(`Updating existing subscription: ${school.subscriptionId}`);
            const sub = await Subscription.findById(school.subscriptionId);
            if (sub) {
                sub.plan = 'premium';
                sub.status = 'active';
                sub.features = {
                    maxStudents: 999999,
                    maxTeachers: 999999,
                    maxConcurrentExams: 9999,
                    storageGB: 1000,
                    customDomain: true,
                    apiAccess: true,
                    proctoriedExams: true,
                    aiGrading: true,
                    whitelabel: true
                };
                sub.endDate = new Date(new Date().setFullYear(new Date().getFullYear() + 100)); // Lifetime
                await sub.save();
                console.log('Subscription updated to Premium.');
            } else {
                console.error('Subscription ID exists but doc not found.');
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Done.');
    }
};

upgradeSchool();

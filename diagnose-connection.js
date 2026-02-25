const mongoose = require('mongoose');
const dns = require('dns').promises;
require('dotenv').config();

async function diagnoseConnection() {
    console.log('🔍 MongoDB Connection Diagnostics\n');
    console.log('='.repeat(50));

    // Step 1: Check environment variable
    console.log('\n1️⃣ Checking MONGO_URI environment variable...');
    if (!process.env.MONGO_URI) {
        console.error('❌ MONGO_URI is not defined in .env file!');
        process.exit(1);
    }
    console.log('✅ MONGO_URI is defined');

    // Parse the connection string (hide password)
    const uriParts = process.env.MONGO_URI.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^\/]+)\/(.+)/);
    if (uriParts) {
        console.log(`   Username: ${uriParts[1]}`);
        console.log(`   Password: ${'*'.repeat(uriParts[2].length)}`);
        console.log(`   Cluster: ${uriParts[3]}`);
        console.log(`   Database: ${uriParts[4]}`);
    }

    // Step 2: DNS Resolution Test
    console.log('\n2️⃣ Testing DNS resolution...');
    try {
        const hostname = 'cluster0.x8ikutc.mongodb.net';
        console.log(`   Resolving: ${hostname}`);
        const addresses = await dns.resolve4(hostname);
        console.log(`✅ DNS resolution successful!`);
        console.log(`   IP addresses: ${addresses.join(', ')}`);
    } catch (err) {
        console.error('❌ DNS resolution failed!');
        console.error(`   Error: ${err.message}`);
        console.error('\n💡 Possible solutions:');
        console.error('   - Check your internet connection');
        console.error('   - Try flushing DNS cache: ipconfig /flushdns');
        console.error('   - Try using a different DNS server (e.g., Google DNS: 8.8.8.8)');
        console.error('   - Check if your firewall is blocking DNS queries');
        process.exit(1);
    }

    // Step 3: MongoDB Connection Test
    console.log('\n3️⃣ Testing MongoDB connection...');
    try {
        console.log('   Attempting to connect (timeout: 10s)...');
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });

        console.log('✅ MongoDB connection successful!');
        console.log(`   Database: ${mongoose.connection.name}`);
        console.log(`   Host: ${mongoose.connection.host}`);
        console.log(`   Port: ${mongoose.connection.port}`);

        // Step 4: Test database operations
        console.log('\n4️⃣ Testing database operations...');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`✅ Found ${collections.length} collections:`);
        collections.forEach(col => console.log(`   - ${col.name}`));

        // Step 5: Check for users
        console.log('\n5️⃣ Checking users collection...');
        const User = require('./src/models/User');
        const userCount = await User.countDocuments();
        console.log(`✅ Found ${userCount} users in database`);

        if (userCount > 0) {
            const sampleUsers = await User.find({}).limit(3).select('username role uniqueLoginId');
            console.log('\n   Sample users:');
            sampleUsers.forEach(user => {
                console.log(`   - ${user.username} (${user.role}) - ID: ${user.uniqueLoginId || 'N/A'}`);
            });
        } else {
            console.log('\n⚠️  No users found in database!');
            console.log('   You may need to seed the database with initial users.');
        }

        console.log('\n' + '='.repeat(50));
        console.log('✅ All diagnostics passed successfully!');

    } catch (err) {
        console.error('❌ MongoDB connection failed!');
        console.error(`   Error: ${err.message}`);
        console.error(`   Code: ${err.code || 'N/A'}`);

        console.error('\n💡 Possible solutions:');
        console.error('   1. Check MongoDB Atlas dashboard - cluster might be paused');
        console.error('   2. Verify your IP address is whitelisted (or use 0.0.0.0/0 for testing)');
        console.error('   3. Confirm username and password are correct');
        console.error('   4. Check if cluster is in the correct region');
        console.error('   5. Try creating a new database user in MongoDB Atlas');

        if (err.message.includes('ESERVFAIL')) {
            console.error('\n🔴 DNS Service Failure detected!');
            console.error('   This usually means:');
            console.error('   - Your DNS server cannot resolve MongoDB Atlas hostname');
            console.error('   - Try changing your DNS to 8.8.8.8 (Google DNS)');
            console.error('   - Or try: ipconfig /flushdns in PowerShell');
        }

        if (err.message.includes('authentication failed')) {
            console.error('\n🔴 Authentication failure!');
            console.error('   - Double-check username and password in .env file');
            console.error('   - Ensure password special characters are URL-encoded');
        }
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

diagnoseConnection();

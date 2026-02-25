const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
        methods: ["GET", "POST"]
    }
});
app.set('io', io); // Allow access to io in controllers

// Middleware
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    credentials: true
}));
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
        console.error('Please check:');
        console.error('1. Your internet connection');
        console.error('2. MongoDB Atlas cluster is running');
        console.error('3. IP address is whitelisted in MongoDB Atlas');
        console.error('4. Connection string is correct');
    });

// Socket.IO Logic
io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('join_exam', (sessionId) => {
        socket.join(sessionId);
        console.log(`User joined session: ${sessionId}`);
    });

    socket.on('enter_exam_room', (examId) => {
        socket.join(`exam_${examId}`);
        console.log(`User joined exam room: ${examId}`);
    });

    socket.on('report_violation', async (data) => {
        // data: { sessionId, examId, violationType }
        // We need examId to route to the correct teacher
        if (data.examId) {
            // Broadcast to the exam monitoring room
            io.to(`monitor_exam_${data.examId}`).emit('violation_logged', data);
        }
        // Also log to console
        console.log(`Violation reported in session ${data.sessionId}: ${data.type}`);
    });

    socket.on('join_admin', () => {
        socket.join('admin_room');
        console.log('Admin joined monitoring room');
    });

    // --- WebRTC Signaling for Screen Monitoring ---

    // Teacher joins a monitoring room for a specific exam
    socket.on('join_monitor', (examId) => {
        socket.join(`monitor_exam_${examId}`);
        console.log(`Teacher joined monitoring for exam: ${examId}`);
    });

    // Student sends their screen offer
    socket.on('screen_offer', (data) => {
        // data: { examId, sessionId, offer, socketId: socket.id }
        console.log(`Screen Offer from ${data.sessionId} for exam ${data.examId}`);
        // Forward to the teacher monitoring this exam
        socket.to(`monitor_exam_${data.examId}`).emit('student_screen_offer', {
            sessionId: data.sessionId,
            offer: data.offer,
            studentSocketId: socket.id
        });
    });

    // Teacher answers the offer
    socket.on('screen_answer', (data) => {
        // data: { studentSocketId, answer }
        console.log(`Screen Answer to student ${data.studentSocketId}`);
        io.to(data.studentSocketId).emit('teacher_screen_answer', {
            answer: data.answer,
            teacherSocketId: socket.id // Send teacher ID so student can send ICE candidates back
        });
    });

    // ICE Candidates exchange
    socket.on('ice_candidate', (data) => {
        // data: { targetSocketId, candidate }
        // Forward candidate to the specific target (Teacher <-> Student)
        io.to(data.targetSocketId).emit('remote_ice_candidate', {
            candidate: data.candidate,
            senderSocketId: socket.id
        });
    });

    // --- School Community Chat ---
    socket.on('join_school_community', (schoolId) => {
        socket.join(`school_community_${schoolId}`);
        // console.log(`Joined community: ${schoolId}`);
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected', socket.id);
    });
});

// Routes
app.use('/auth', require('./routes/authRoutes'));
app.use('/exam', require('./routes/examRoutes'));
app.use('/violation', require('./routes/violationRoutes'));
app.use('/school', require('./routes/schoolRoutes'));
app.use('/student-records', require('./routes/studentRecordRoutes'));
app.use('/subscription', require('./routes/subscriptionRoutes'));
app.use('/community', require('./routes/communityRoutes'));
app.use('/result-template', require('./routes/resultTemplateRoutes'));

// Debug Route
app.get('/debug/users', async (req, res) => {
    try {
        const users = await require('./models/User').find({});
        res.json({
            count: users.length,
            db: mongoose.connection.name,
            host: mongoose.connection.host,
            users: users.map(u => ({ username: u.username, role: u.role }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Debug Seed Route
app.get('/debug/seed', async (req, res) => {
    try {
        const User = require('./models/User');
        await User.deleteMany({});

        const admin = new User({
            username: 'admin',
            password: 'password123',
            role: 'admin',
            fullName: 'System Admin'
        });
        await admin.save();

        res.json({ message: 'Admin user created manually', admin });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send('CBT System API is running');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

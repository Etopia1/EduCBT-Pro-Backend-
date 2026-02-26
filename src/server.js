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
        origin: [process.env.FRONTEND_URL, "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
        methods: ["GET", "POST"]
    }
});
app.set('io', io); // Allow access to io in controllers

// Middleware
app.use(cors({
    origin: [process.env.FRONTEND_URL, "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
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

    // Student announces presence to teacher monitor room
    socket.on('student_joined_monitor', (data) => {
        socket.join(`exam_${data.examId}`);
        socket.to(`monitor_exam_${data.examId}`).emit('student_ready', {
            sessionId: data.sessionId,
            studentName: data.studentName,
            studentSocketId: socket.id
        });
    });

    // Teacher requests student's screen stream
    socket.on('request_screen', (data) => {
        io.to(data.studentSocketId).emit('request_screen', { teacherSocketId: socket.id });
    });

    // Student sends their screen offer → forward to teacher monitoring that exam
    socket.on('screen_offer', (data) => {
        // data: { examId, sessionId, offer, socketId }
        console.log(`[WEBRTC] Screen offer from student ${socket.id} for exam ${data.examId}`);
        socket.to(`monitor_exam_${data.examId}`).emit('screen_offer', {
            offer: data.offer,
            sessionId: data.sessionId,
            socketId: socket.id   // student's socket ID so teacher can reply
        });
    });

    // Teacher sends SDP answer → forward to specific student
    socket.on('screen_answer', (data) => {
        // data: { studentSocketId, answer }
        console.log(`[WEBRTC] Screen answer from teacher to student ${data.studentSocketId}`);
        io.to(data.studentSocketId).emit('screen_answer', {
            answer: data.answer,
            teacherSocketId: socket.id
        });
    });

    // ICE candidate exchange (bidirectional Teacher <-> Student)
    socket.on('ice_candidate', (data) => {
        // data: { targetSocketId, candidate }
        io.to(data.targetSocketId).emit('ice_candidate', {
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

// Debug Route - Users
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

// Debug Route - All exams with visibility explanation
// GET /debug/exams              → all exams in DB
// GET /debug/exams?class=SS2   → all exams, shows if SS2 students can see them
app.get('/debug/exams', async (req, res) => {
    try {
        const Exam = require('./models/Exam');
        const classLevel = (req.query.class || '').trim();
        const normalize = s => (s || '').replace(/\s+/g, '').toLowerCase();

        // Fetch ALL exams from DB regardless of status
        const exams = await Exam.find({})
            .select('title subject classLevel status isActive durationMinutes questions createdAt startTime endTime schoolId')
            .sort({ createdAt: -1 });

        const now = new Date();

        const summary = exams.map(e => {
            const reasons = [];
            let visible = true;

            // Status check
            if (!['active', 'scheduled'].includes(e.status)) {
                visible = false;
                reasons.push(`status='${e.status}' — must be 'active' or 'scheduled'`);
            }

            // Class check (only if student class provided)
            if (classLevel) {
                const examClass = (e.classLevel || '').trim();
                if (examClass && normalize(examClass) !== normalize(classLevel)) {
                    visible = false;
                    reasons.push(`classLevel='${examClass}' does NOT match student class '${classLevel}'`);
                }
            }

            // End time check
            if (e.endTime && e.endTime < now) {
                visible = false;
                reasons.push(`endTime '${e.endTime.toISOString()}' has already passed`);
            }

            return {
                id: e._id,
                title: e.title,
                subject: e.subject,
                classLevel: e.classLevel || '(All classes — blank)',
                status: e.status,
                isActive: e.isActive,
                canStudentSee: visible ? '✅ YES' : '❌ NO',
                hiddenReasons: visible ? [] : reasons,
                questions: e.questions?.length || 0,
                startTime: e.startTime || 'Not set',
                endTime: e.endTime || 'Not set',
            };
        });

        // Console log
        console.log(`\n========= DEBUG EXAMS (student class filter: "${classLevel || 'none'}") =========`);
        summary.forEach((e, i) => {
            const vis = e.canStudentSee;
            console.log(`${i + 1}. ${vis} [${e.status.toUpperCase()}] "${e.title}" | ${e.subject} | Class: "${e.classLevel}"`);
            if (e.hiddenReasons.length) e.hiddenReasons.forEach(r => console.log(`      ↳ HIDDEN: ${r}`));
        });
        console.log(`Total: ${summary.length}\n`);

        res.json({ filterByClass: classLevel || '(none)', total: summary.length, exams: summary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Quick fix route: force an exam to be active/visible
// GET /debug/activate-exam/:examId
app.get('/debug/activate-exam/:examId', async (req, res) => {
    try {
        const Exam = require('./models/Exam');
        const exam = await Exam.findById(req.params.examId);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        exam.status = 'active';
        exam.isActive = true;
        await exam.save();
        console.log(`[DEBUG] Force-activated exam: ${exam.title}`);
        res.json({ message: `✅ Exam "${exam.title}" is now ACTIVE and visible to students`, exam: { id: exam._id, title: exam.title, status: exam.status, isActive: exam.isActive } });
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

if (process.env.NODE_ENV !== 'production') {
    try {
        require('dotenv').config();
        console.log('✅ Loaded .env file');
    } catch (err) {
        console.warn('⚠️ Could not load .env file:', err.message);
    }
}

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { Expo } = require('expo-server-sdk');
const messagesRouter = require('./routes/messages');

// Routes
const numbers = require('./routes/numbers');
const householdItemsRouter = require('./routes/householdItems');
const bodyPartsRouter = require('./routes/bodyParts');
const peopleRouter = require('./routes/people');
const animalsRouter = require('./routes/animals');

// Models
const Message = require('./models/Message');
const UserStatus = require('./models/UserStatus');


const app = express();
const server = http.createServer(app);
const expo = new Expo();

// =================== CONFIG ===================
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB Atlas'))
.catch(err => console.error('❌ MongoDB connection error:', err));

mongoose.connection.on('error', err => console.error('❌ MongoDB error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('🔗 MongoDB reconnected'));

// Routes
app.use('/api/messages', messagesRouter);
app.use('/api/numbers', numbers);
app.use('/api/household-items', householdItemsRouter);
app.use('/api/body-parts', bodyPartsRouter);
app.use('/api/people', peopleRouter);
app.use('/api/animals', animalsRouter);

// =================== UPLOADS ===================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadDir));

// =================== SOCKET.IO ===================
const io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
    transports: ['websocket', 'polling']
});

const connectedUsers = {};
const userPushTokens = {};

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('join', async (userData) => {
        const { userId, name } = userData;
        connectedUsers[userId] = socket.id;
        socket.userId = userId;
        socket.userName = name;
        console.log(`👤 User ${name} joined`);

        try {
            const pendingMessages = await Message.find({
                receiverId: userId,
                seenBy: { $ne: userId },
                isDeleted: false
            }).sort({ createdAt: 1 });
            if (pendingMessages.length) socket.emit('pending-messages', pendingMessages);
        } catch (err) {
            console.error('❌ Error fetching pending messages:', err);
        }
    });

    socket.on('message', async (messageData) => {
        try {
            if (!messageData._id || !messageData.user?._id) throw new Error('Invalid message data');
            const exists = await Message.findById(messageData._id);
            if (exists) return socket.emit('message-delivered', { messageId: messageData._id, status: 'duplicate' });

            const senderId = messageData.user._id;
            const receiverId = senderId === 'user_1' ? 'user_2' : 'user_1';

            const message = new Message({
                ...messageData,
                createdAt: messageData.createdAt || new Date(),
                seenBy: messageData.seenBy || [senderId],
                receiverId,
                isDeleted: false
            });

            const saved = await message.save();
            io.emit('message', saved.toObject());
            socket.emit('message-delivered', { messageId: saved._id, status: 'delivered', savedAt: new Date() });

            // Push notifications
            if (userPushTokens[receiverId] && Expo.isExpoPushToken(userPushTokens[receiverId])) {
                const pushMessage = {
                    to: userPushTokens[receiverId],
                    sound: 'default',
                    title: `New message from ${saved.user.name}`,
                    body: saved.text?.substring(0, 100) || '(Media message)',
                    data: { messageId: saved._id },
                    badge: 1
                };
                try {
                    await expo.sendPushNotificationsAsync([pushMessage]);
                    saved.pushNotificationSent = true;
                    saved.pushSentAt = new Date();
                    await saved.save();
                } catch (pushErr) { console.error('❌ Push error:', pushErr); }
            }

        } catch (err) {
            console.error('❌ Message error:', err);
            socket.emit('error', { message: 'Failed to save message', details: err.message });
        }
    });

    socket.on('register-push-token', async ({ userId, expoPushToken }) => {
        if (!Expo.isExpoPushToken(expoPushToken)) return socket.emit('push-token-error', { error: 'Invalid token' });
        userPushTokens[userId] = expoPushToken;
        await UserStatus.findOneAndUpdate({ userId }, { userId, expoPushToken, lastSeen: new Date() }, { upsert: true });
        socket.emit('push-token-registered', { success: true });
    });

    socket.on('disconnect', () => {
        if (socket.userId) delete connectedUsers[socket.userId];
        console.log(`👋 User ${socket.userName || socket.userId} disconnected`);
    });
});

// =================== REST ENDPOINTS ===================
app.get('/', (req, res) => res.json({ message: 'Messaging API Server', status: 'online' }));

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl, filename: req.file.filename });
});

app.get('/api/db/status', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState;
        res.json({
            success: true,
            mongoStatus: mongoStatus === 1 ? 'connected' : 'disconnected',
            collections: {
                messages: await Message.countDocuments(),
                userStatus: await UserStatus.countDocuments()
            },
            connectedUsers: Object.keys(connectedUsers).length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', mongo: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy', uptime: process.uptime() });
});

// =================== START SERVER ===================
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// server.js
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
    console.log('✅ Loaded .env');
  } catch (err) {
    console.warn('⚠️ Could not load .env:', err.message);
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
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Expo } = require('expo-server-sdk');

// Routers (assumes these files exist)
const messagesRouter = require('./routes/messages');
const numbers = require('./routes/numbers');
const householdItemsRouter = require('./routes/householdItems');
const bodyPartsRouter = require('./routes/bodyParts');
const peopleRouter = require('./routes/people');
const animalsRouter = require('./routes/animals');

// Models (assumes these exist)
const Message = require('./models/Message');
const UserStatus = require('./models/UserStatus');

const app = express();
const server = http.createServer(app);
const expo = new Expo();

// =================== CONFIG ===================
const PORT = parseInt(process.env.PORT, 10) || 5000;
const MONGO_URI = process.env.MONGO_URI;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production';

// Basic safety checks
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not set. Exiting.');
  process.exit(1);
}

// =================== EXPRESS GLOBALS ===================
app.set('trust proxy', TRUST_PROXY); // important for Render / proxies
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiter (protects endpoints from basic abuse)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser requests (curl, server)
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};
app.use(cors(corsOptions));

// =================== MONGODB ===================
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    // Don't exit here — keep running so health checks return unhealthy instead of crashing
  });

mongoose.connection.on('error', err => console.error('❌ MongoDB error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('🔗 MongoDB reconnected'));

// =================== UPLOADS ===================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

// =================== ROUTES ===================
// API routers (keep implementation in their files)
app.use('/api/messages', messagesRouter);
app.use('/api/numbers', numbers);
app.use('/api/household-items', householdItemsRouter);
app.use('/api/body-parts', bodyPartsRouter);
app.use('/api/people', peopleRouter);
app.use('/api/animals', animalsRouter);

// Simple root and wakeup routes (for render wake)
app.get('/', (req, res) => res.json({ message: 'Messaging API Server', status: 'online' }));
app.get('/health', (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.json({
    status: mongoOk ? 'OK' : 'UNHEALTHY',
    mongoState: mongoose.connection.readyState,
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});
// lightweight wake endpoint used by keep-alive pings
app.get('/wakeup', (req, res) => res.sendStatus(204));

// =================== SOCKET.IO ===================
// Configure Socket.IO with CORS and both websocket + polling enabled for compatibility.
// Use conservative logging to avoid noisy console in production.
const io = socketIO(server, {
  path: '/socket.io',
  cors: {
    origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
});

const connectedUsers = {};     // { userId: socketId }
const userPushTokens = {};     // { userId: pushToken }

// Socket handlers
io.on('connection', (socket) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔌 Client connected:', socket.id);
  }

  socket.on('join', async (userData = {}) => {
    const { userId, name } = userData;
    if (!userId) return;
    connectedUsers[userId] = socket.id;
    socket.userId = userId;
    socket.userName = name || userId;

    // deliver pending messages
    try {
      const pendingMessages = await Message.find({
        receiverId: userId,
        seenBy: { $ne: userId },
        isDeleted: false
      }).sort({ createdAt: 1 }).lean();

      if (pendingMessages && pendingMessages.length > 0) {
        socket.emit('pending-messages', pendingMessages);
      }
    } catch (err) {
      console.error('❌ Error fetching pending messages:', err.message || err);
    }
  });

  socket.on('message', async (messageData) => {
    try {
      if (!messageData || !messageData._id || !messageData.user || !messageData.user._id) {
        return socket.emit('error', { message: 'Invalid message format' });
      }

      // avoid duplicates
      const exists = await Message.findById(messageData._id).lean();
      if (exists) {
        return socket.emit('message-delivered', { messageId: messageData._id, status: 'duplicate' });
      }

      const senderId = messageData.user._id;
      const receiverId = messageData.receiverId || (senderId === 'user_1' ? 'user_2' : 'user_1');

      const message = new Message({
        ...messageData,
        createdAt: messageData.createdAt || new Date(),
        seenBy: messageData.seenBy || [senderId],
        receiverId,
        isDeleted: false
      });

      const saved = await message.save();
      const msgObj = saved.toObject();

      // Broadcast to all clients (you can scope to rooms if you want)
      io.emit('message', msgObj);
      socket.emit('message-delivered', { messageId: saved._id, status: 'delivered', savedAt: new Date() });

      // push notifications via Expo
      try {
        const token = userPushTokens[receiverId];
        if (token && Expo.isExpoPushToken(token)) {
          const pushMessage = {
            to: token,
            sound: 'default',
            title: `New message from ${saved.user?.name || 'Someone'}`,
            body: saved.text?.substring(0, 120) || '(Media)',
            data: { messageId: saved._id },
          };
          await expo.sendPushNotificationsAsync([pushMessage]);
          saved.pushNotificationSent = true;
          saved.pushSentAt = new Date();
          await saved.save();
        }
      } catch (pushErr) {
        console.error('❌ Push error:', pushErr && pushErr.message ? pushErr.message : pushErr);
      }

    } catch (err) {
      console.error('❌ Message save error:', err && err.message ? err.message : err);
      socket.emit('error', { message: 'Failed to save message', details: err.message || err });
    }
  });

  socket.on('register-push-token', async (payload) => {
    try {
      const { userId, expoPushToken } = payload || {};
      if (!userId || !expoPushToken) return socket.emit('push-token-error', { error: 'Missing fields' });
      if (!Expo.isExpoPushToken(expoPushToken)) return socket.emit('push-token-error', { error: 'Invalid token' });

      userPushTokens[userId] = expoPushToken;
      await UserStatus.findOneAndUpdate({ userId }, { userId, expoPushToken, lastSeen: new Date() }, { upsert: true, new: true });

      socket.emit('push-token-registered', { success: true });
    } catch (err) {
      console.error('❌ Error registering token:', err);
      socket.emit('push-token-error', { error: err.message || 'Failed to save token' });
    }
  });

  socket.on('delete-message', async (payload) => {
    try {
      const { messageId, userId } = payload || {};
      if (!messageId || !userId) return socket.emit('delete-error', { messageId, error: 'Missing fields' });

      // Soft delete
      const result = await Message.findByIdAndUpdate(messageId, {
        $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId }
      }, { new: true });

      if (!result) return socket.emit('delete-error', { messageId, error: 'Message not found' });

      io.emit('message-deleted', { messageId: result._id, deletedAt: result.deletedAt, deletedBy: userId });
      socket.emit('delete-success', { messageId: result._id, deletedAt: result.deletedAt });

    } catch (err) {
      console.error('❌ Delete error:', err);
      socket.emit('delete-error', { error: err.message || 'Failed to delete' });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      delete connectedUsers[socket.userId];
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('👋 Client disconnected:', socket.id);
    }
  });

  socket.on('error', (err) => {
    console.error('❌ Socket error:', err);
  });
});

// =================== GRACEFUL SHUTDOWN ===================
const shutdown = async () => {
  console.log('⚠️ Shutting down server...');
  try {
    io.close();
    server.close(() => console.log('Server closed'));
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown();
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// =================== START SERVER ===================
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

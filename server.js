const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { Expo } = require('expo-server-sdk');


const numbers = require('./routes/numbers');
const householdItemsRouter = require('./routes/householdItems');
const bodyPartsRouter = require('./routes/bodyParts');
const peopleRouter = require('./routes/people');
const animalsRouter = require('./routes/animals');

// Import models
const Message = require('./models/Message');
const UserStatus = require('./models/UserStatus');

const app = express();
const server = http.createServer(app);

// Initialize Expo SDK for push notifications
const expo = new Expo();

// Configure CORS for Socket.io
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// MongoDB Connection with enhanced error handling
mongoose.connect('mongodb://localhost:27017/chat-app', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
}).then(() => {
    console.log('✅ Connected to MongoDB successfully');
    console.log('📊 Database: chat-app');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('💡 Make sure MongoDB is running: mongod --dbpath "C:\\data\\db"');
});

// Connection event listeners
mongoose.connection.on('error', err => {
    console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
    console.log('🔗 MongoDB reconnected');
});


// Use routes
app.use('/api/numbers', numbers);
app.use('/api/household-items', householdItemsRouter);
app.use('/api/body-parts', bodyPartsRouter);
app.use('/api/people', peopleRouter);
app.use('/api/animals', animalsRouter);

// Create uploads directory if it doesn't exist
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created uploads directory');
}

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Store push tokens in memory (no user status tracking)
const userPushTokens = {}; // Store: { userId: 'ExpoPushToken[...]' }

// Track connected sockets for messaging (simple connection tracking)
const connectedUsers = {}; // Store: { userId: socketId }

// ==================== SOCKET.IO MESSAGING LOGIC ====================
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // User joins the messaging service
    socket.on('join', (userData) => {
        try {
            const { userId, name, avatar } = userData;
            connectedUsers[userId] = socket.id;
            socket.userId = userId;
            socket.userName = name;
            
            console.log(`👤 User ${name} (${userId}) connected`);
            
            // Send any pending messages for this user
            Message.find({
                receiverId: userId,
                seenBy: { $ne: userId },
                isDeleted: false
            })
            .sort({ createdAt: 1 })
            .then(pendingMessages => {
                if (pendingMessages.length > 0) {
                    console.log(`📬 Sending ${pendingMessages.length} pending messages to ${name}`);
                    socket.emit('pending-messages', pendingMessages);
                }
            })
            .catch(error => {
                console.error('❌ Error fetching pending messages:', error);
            });
            
        } catch (error) {
            console.error('❌ Error in join event:', error);
        }
    });

    // Handle incoming messages (SIMPLE MESSAGING - no typing indicators)
    socket.on('message', async (messageData) => {
        console.log('📩 Message received from:', messageData.user?.name || 'Unknown');
        
        try {
            // Validate message data
            if (!messageData._id || !messageData.user || !messageData.user._id) {
                throw new Error('Invalid message format: Missing required fields');
            }
            
            // Check if this message already exists to prevent duplicates
            const existingMessage = await Message.findById(messageData._id);
            if (existingMessage) {
                console.log(`⚠️ Message ${messageData._id} already exists, ignoring duplicate`);
                socket.emit('message-delivered', { 
                    messageId: messageData._id, 
                    status: 'duplicate',
                    savedAt: new Date()
                });
                return;
            }
            
            // Determine receiver ID (other user in 1-on-1 chat)
            const senderId = messageData.user._id;
            const receiverId = senderId === 'user_1' ? 'user_2' : 'user_1';
            
            // Create message with proper structure
            const message = new Message({
                _id: messageData._id,
                text: messageData.text,
                image: messageData.image,
                file: messageData.file,
                location: messageData.location,
                user: {
                    _id: messageData.user._id,
                    name: messageData.user.name || 'Unknown',
                    avatar: messageData.user.avatar || 'https://i.pravatar.cc/150'
                },
                createdAt: messageData.createdAt || new Date(),
                replyTo: messageData.replyTo,
                linkPreview: messageData.linkPreview,
                type: messageData.type || 'text',
                reactions: messageData.reactions || [],
                seenBy: messageData.seenBy || [messageData.user._id],
                receiverId: receiverId,
                isDeleted: false
            });
            
            // Save to MongoDB
            const savedMessage = await message.save();
            console.log('💾 Message saved to MongoDB with ID:', savedMessage._id);
            
            // Broadcast message to all connected clients
            const messageObj = savedMessage.toObject();
            io.emit('message', messageObj);
            
            // Send delivery confirmation to sender
            socket.emit('message-delivered', { 
                messageId: savedMessage._id, 
                status: 'delivered',
                savedAt: new Date()
            });
            
            // Send push notification if receiver has a push token
            if (userPushTokens[receiverId] && Expo.isExpoPushToken(userPushTokens[receiverId])) {
                try {
                    const pushMessage = {
                        to: userPushTokens[receiverId],
                        sound: 'default',
                        title: `New message from ${savedMessage.user.name}`,
                        body: savedMessage.text?.substring(0, 100) || '(Media message)',
                        data: { 
                            messageId: savedMessage._id,
                            senderName: savedMessage.user.name,
                            type: savedMessage.type
                        },
                        badge: 1
                    };
                    
                    const ticketChunk = await expo.sendPushNotificationsAsync([pushMessage]);
                    console.log(`🔔 Push notification sent for message ${savedMessage._id}`);
                    
                    // Store push notification data
                    savedMessage.pushNotificationSent = true;
                    savedMessage.pushSentAt = new Date();
                    await savedMessage.save();
                    
                } catch (pushError) {
                    console.error('❌ Error sending push notification:', pushError);
                }
            }
            
            // Update message count in console
            const messageCount = await Message.countDocuments({ isDeleted: false });
            console.log(`📊 Total messages in database: ${messageCount}`);
            
        } catch (error) {
            console.error('❌ Error saving message to MongoDB:', error.message);
            socket.emit('error', { 
                message: 'Failed to save message',
                details: error.message 
            });
        }
    });

    // Handle message deletion
    socket.on('delete-message', async (data) => {
        try {
            const { messageId, userId } = data;
            
            console.log(`🗑️ Delete request for message ${messageId} from user ${userId}`);
            
            // Use direct update to avoid validation issues with existing messages
            const result = await Message.updateOne(
                { _id: messageId },
                { 
                    $set: {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: userId
                    }
                }
            );
            
            if (result.nModified === 0) {
                // Message not found or already deleted
                const existingMessage = await Message.findById(messageId);
                
                if (!existingMessage) {
                    socket.emit('delete-error', { 
                        messageId, 
                        error: 'Message not found' 
                    });
                    return;
                }
                
                // Message already deleted
                socket.emit('delete-success', {
                    messageId: existingMessage._id,
                    deletedAt: existingMessage.deletedAt
                });
                return;
            }
            
            // Fetch the updated message for broadcasting
            const updatedMessage = await Message.findById(messageId);
            
            // Check authorization (either sender or receiver)
            const isSender = updatedMessage.user?._id?.toString() === userId;
            
            // Determine receiverId for authorization check
            let receiverId = updatedMessage.receiverId;
            if (!receiverId && updatedMessage.user?._id) {
                receiverId = updatedMessage.user._id === 'user_1' ? 'user_2' : 'user_1';
            }
            const isReceiver = receiverId === userId;
            
            if (!isSender && !isReceiver) {
                // User not authorized - revert deletion
                await Message.updateOne(
                    { _id: messageId },
                    { 
                        $set: {
                            isDeleted: false,
                            deletedAt: null,
                            deletedBy: null
                        }
                    }
                );
                
                socket.emit('delete-error', { 
                    messageId, 
                    error: 'Unauthorized to delete this message' 
                });
                return;
            }
            
            console.log(`✅ Message ${messageId} soft-deleted by user ${userId}`);
            
            // Broadcast deletion to all connected clients
            io.emit('message-deleted', {
                messageId: updatedMessage._id,
                deletedAt: updatedMessage.deletedAt,
                deletedBy: userId
            });
            
            socket.emit('delete-success', {
                messageId: updatedMessage._id,
                deletedAt: updatedMessage.deletedAt
            });
            
        } catch (error) {
            console.error('❌ Error deleting message:', error);
            socket.emit('delete-error', { 
                messageId: data.messageId, 
                error: error.message 
            });
        }
    });

    // Handle push token registration
    socket.on('register-push-token', async (data) => {
        try {
            const { userId, expoPushToken } = data;
            
            if (!Expo.isExpoPushToken(expoPushToken)) {
                console.error('❌ Invalid Expo push token received');
                socket.emit('push-token-error', { error: 'Invalid token format' });
                return;
            }
            
            // Store token in memory and database
            userPushTokens[userId] = expoPushToken;
            
            // Save to database for persistence
            await UserStatus.findOneAndUpdate(
                { userId },
                { 
                    userId,
                    expoPushToken: expoPushToken,
                    lastSeen: new Date()
                },
                { upsert: true, new: true }
            );
            
            console.log(`✅ Push token registered for user ${userId}`);
            socket.emit('push-token-registered', { success: true });
            
        } catch (error) {
            console.error('❌ Error registering push token:', error);
            socket.emit('push-token-error', { error: error.message });
        }
    });

    // Handle message reactions (optional - can keep or remove)
    socket.on('message-reaction', async (data) => {
        try {
            const { messageId, userId, emoji } = data;
            const message = await Message.findById(messageId);
            
            if (message && !message.isDeleted) {
                // Remove existing reaction from same user
                message.reactions = message.reactions.filter(r => r.user !== userId);
                
                // Add new reaction if emoji is provided
                if (emoji) {
                    message.reactions.push({ user: userId, emoji });
                }
                
                await message.save();
                
                // Broadcast updated message
                io.emit('message-reaction-updated', message.toObject());
            }
        } catch (error) {
            console.error('❌ Error updating reaction:', error);
        }
    });

    // Handle disconnection (SIMPLE - no status updates)
    socket.on('disconnect', () => {
        try {
            if (socket.userId) {
                delete connectedUsers[socket.userId];
                console.log(`👋 User ${socket.userName || socket.userId} disconnected`);
            }
        } catch (error) {
            console.error('❌ Error in disconnect handler:', error);
        }
    });

    // Error handling for socket
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// ==================== REST API ENDPOINTS ====================

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Messaging API Server',
        version: '1.0.0',
        status: 'online',
        description: 'Traditional messaging service with message deletion',
        endpoints: {
            messages: 'GET /api/messages',
            messageById: 'GET /api/messages/:id',
            upload: 'POST /api/upload',
            dbStatus: 'GET /api/db/status',
            messageHistory: 'GET /api/messages/history',
            deleteMessage: 'DELETE /api/messages/:id',
            health: 'GET /health',
            savePushToken: 'POST /api/save-push-token'
        }
    });
});

// API to save push token
app.post('/api/save-push-token', async (req, res) => {
    try {
        const { userId, expoPushToken } = req.body;
        
        if (!Expo.isExpoPushToken(expoPushToken)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid Expo push token' 
            });
        }
        
        userPushTokens[userId] = expoPushToken;
        
        // Save to database
        await UserStatus.findOneAndUpdate(
            { userId },
            { 
                userId,
                expoPushToken: expoPushToken,
                lastSeen: new Date()
            },
            { upsert: true }
        );
        
        console.log(`✅ Push token saved via API for user ${userId}`);
        
        res.json({ 
            success: true, 
            message: 'Push token saved successfully',
            userId: userId
        });
        
    } catch (error) {
        console.error('❌ Error saving push token:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save push token',
            details: error.message 
        });
    }
});

// Get all messages with pagination (exclude deleted)
app.get('/api/messages', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;
        
        console.log(`📋 Fetching ${limit} messages from database...`);
        
        const messages = await Message.find({ isDeleted: false })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        console.log(`✅ Found ${messages.length} messages`);
        
        // Reverse for chronological order in chat
        const chronologicalMessages = messages.reverse();
        
        res.json(chronologicalMessages);
        
    } catch (error) {
        console.error('❌ Error fetching messages:', error);
        res.status(500).json({ 
            error: 'Failed to fetch messages',
            details: error.message 
        });
    }
});

// Get message history (with different sorting)
app.get('/api/messages/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const skip = parseInt(req.query.skip) || 0;
        
        console.log(`📋 Fetching ${limit} historical messages...`);
        
        const messages = await Message.find({ isDeleted: false })
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit);
        
        console.log(`✅ Found ${messages.length} historical messages`);
        
        res.json({
            success: true,
            count: messages.length,
            total: await Message.countDocuments({ isDeleted: false }),
            messages: messages
        });
        
    } catch (error) {
        console.error('❌ Error fetching message history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch message history',
            details: error.message 
        });
    }
});

// Get pending offline messages for a user
app.get('/api/messages/pending/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        const pendingMessages = await Message.find({
            receiverId: userId,
            seenBy: { $ne: userId },
            isDeleted: false,
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).sort({ createdAt: 1 });
        
        res.json({
            success: true,
            count: pendingMessages.length,
            messages: pendingMessages
        });
        
    } catch (error) {
        console.error('❌ Error fetching pending messages:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch pending messages',
            details: error.message 
        });
    }
});

// Get a single message by ID
app.get('/api/messages/:id', async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        
        if (!message) {
            return res.status(404).json({ 
                success: false, 
                error: 'Message not found' 
            });
        }
        
        res.json({
            success: true,
            message: message
        });
        
    } catch (error) {
        console.error('❌ Error fetching message:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch message',
            details: error.message 
        });
    }
});

// Delete message endpoint (REST API)
app.delete('/api/messages/:id', async (req, res) => {
    try {
        const messageId = req.params.id;
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        // Determine receiverId for authorization check
        let receiverId = message.receiverId;
        if (!receiverId && message.user?._id) {
            receiverId = message.user._id === 'user_1' ? 'user_2' : 'user_1';
        }
        
        // Check if user is authorized to delete
        const isSender = message.user?._id?.toString() === userId;
        const isReceiver = receiverId === userId;
        
        if (!isSender && !isReceiver) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized to delete this message'
            });
        }
        
        // Soft delete using direct update
        await Message.updateOne(
            { _id: messageId },
            { 
                $set: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: userId
                }
            }
        );
        
        console.log(`✅ Message ${messageId} deleted via API by user ${userId}`);
        
        res.json({
            success: true,
            message: 'Message deleted successfully',
            messageId: message._id,
            deletedAt: new Date(),
            deletedBy: userId
        });
        
    } catch (error) {
        console.error('❌ Error deleting message via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete message',
            details: error.message
        });
    }
});

// Upload file endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }
        
        const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
        
        console.log('📁 File uploaded:', req.file.filename);
        console.log('   Size:', (req.file.size / 1024).toFixed(2), 'KB');
        console.log('   Type:', req.file.mimetype);
        
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype,
            uploadedAt: new Date()
        });
        
    } catch (error) {
        console.error('❌ Error uploading file:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to upload file',
            details: error.message 
        });
    }
});

// Database status endpoint
app.get('/api/db/status', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState;
        const statusText = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        }[mongoStatus] || 'unknown';
        
        const messageCount = await Message.countDocuments({ isDeleted: false });
        const userStatusCount = await UserStatus.countDocuments();
        
        res.json({
            success: true,
            mongoStatus: statusText,
            mongoState: mongoStatus,
            collections: {
                messages: messageCount,
                userStatus: userStatusCount
            },
            serverTime: new Date(),
            uptime: process.uptime(),
            connectedUsers: Object.keys(connectedUsers).length
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Database status check failed',
            details: error.message,
            mongoStatus: 'error'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';
    
    res.json({ 
        status: 'OK',
        timestamp: new Date(),
        mongo: mongoStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        description: 'Messaging service with message deletion'
    });
});

// Clear database (for testing only - remove in production)
app.delete('/api/clear-test', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Not allowed in production' });
        }
        
        await Message.deleteMany({});
        await UserStatus.deleteMany({});
        
        // Clear uploads directory
        fs.readdir(uploadDir, (err, files) => {
            if (err) throw err;
            
            for (const file of files) {
                fs.unlink(path.join(uploadDir, file), err => {
                    if (err) console.error('Error deleting file:', err);
                });
            }
        });
        
        // Clear in-memory stores
        Object.keys(userPushTokens).forEach(key => delete userPushTokens[key]);
        Object.keys(connectedUsers).forEach(key => delete connectedUsers[key]);
        
        res.json({ 
            success: true, 
            message: 'Test data cleared',
            clearedAt: new Date()
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to clear data',
            details: error.message 
        });
    }
});

// Seed test data (for testing only)
app.post('/api/seed-test', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Not allowed in production' });
        }
        
        const testMessages = [
            {
                _id: 'test_1',
                text: 'Welcome to the messaging app! 👋',
                user: {
                    _id: 'system',
                    name: 'System',
                    avatar: 'https://cdn-icons-png.flaticon.com/512/2456/2456701.png'
                },
                type: 'system',
                receiverId: 'user_1',
                createdAt: new Date(Date.now() - 3600000),
                isDeleted: false
            },
            {
                _id: 'test_2',
                text: 'Hello there! How are you?',
                user: {
                    _id: 'user_1',
                    name: 'John Doe',
                    avatar: 'https://i.pravatar.cc/150?img=1'
                },
                type: 'text',
                receiverId: 'user_2',
                createdAt: new Date(Date.now() - 1800000),
                isDeleted: false
            },
            {
                _id: 'test_3',
                text: 'I\'m doing great! Just testing this messaging app.',
                user: {
                    _id: 'user_2',
                    name: 'Jane Smith',
                    avatar: 'https://i.pravatar.cc/150?img=2'
                },
                type: 'text',
                receiverId: 'user_1',
                createdAt: new Date(Date.now() - 900000),
                isDeleted: false
            }
        ];
        
        await Message.insertMany(testMessages);
        
        res.json({ 
            success: true, 
            message: 'Test data seeded',
            count: testMessages.length,
            seededAt: new Date()
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to seed test data',
            details: error.message 
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        requested: req.originalUrl,
        availableEndpoints: [
            'GET /',
            'GET /api/messages',
            'GET /api/messages/history',
            'GET /api/messages/:id',
            'DELETE /api/messages/:id',
            'POST /api/upload',
            'GET /api/db/status',
            'GET /health',
            'POST /api/save-push-token'
        ]
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message,
        timestamp: new Date()
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`
    🚀 Server running on port ${PORT}
    📁 Uploads available at: http://localhost:${PORT}/uploads/
    🔗 API Base URL: http://localhost:${PORT}/
    🩺 Health check: http://localhost:${PORT}/health
    📊 Database status: http://localhost:${PORT}/api/db/status
    💬 Messages API: http://localhost:${PORT}/api/messages
    🗑️  Delete API: DELETE /api/messages/:id
    🔔 Push Notifications: ENABLED
    📱 Messaging Mode: TRADITIONAL (No typing indicators or online status)
    ✅ Message Deletion: FULLY SUPPORTED
    `);
    
    const mongoStatus = mongoose.connection.readyState;
    const statusEmoji = mongoStatus === 1 ? '✅' : '❌';
    const statusText = mongoStatus === 1 ? 'Connected' : 'Disconnected';
    console.log(`${statusEmoji} MongoDB: ${statusText}`);
});
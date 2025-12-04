// ==============================================
// Load .env in development
// ==============================================
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
  console.log("✅ .env loaded");
}

// ==============================================
// Imports
// ==============================================
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const socketIO = require("socket.io");
const multer = require("multer");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const { Expo } = require("expo-server-sdk");

// Routers
const messagesRouter = require("./routes/messages");
const numbersRouter = require("./routes/numbers");
const householdItemsRouter = require("./routes/householdItems");
const bodyPartsRouter = require("./routes/bodyParts");
const peopleRouter = require("./routes/people");
const animalsRouter = require("./routes/animals");

// Models
const Message = require("./models/Message");
const UserStatus = require("./models/UserStatus");

// ==============================================
// Core Setup
// ==============================================
const app = express();
const server = http.createServer(app);
const expo = new Expo();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ ERROR: Missing MONGO_URI");
  process.exit(1);
}

// ==============================================
// Security & Middleware
// ==============================================
app.set("trust proxy", true);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ====== CORS ======
const allowedOrigins =
  (process.env.CORS_ORIGINS || "*")
    .split(",")
    .map((x) => x.trim());

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    credentials: true,
  })
);

// ====== Rate Limiter ======
app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
  })
);

// ==============================================
// MongoDB Connection
// ==============================================
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

mongoose.connection.on("disconnected", () =>
  console.log("⚠️ MongoDB Disconnected")
);
mongoose.connection.on("reconnected", () =>
  console.log("🔗 MongoDB Reconnected")
);

// ==============================================
// Uploads
// ==============================================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random()}${path.extname(file.originalname)}`)
  }),
});

app.use("/uploads", express.static(uploadDir, { maxAge: "7d" }));

// ==============================================
// Routes
// ==============================================
app.get("/", (req, res) =>
  res.json({ message: "Messaging API Online", status: "running" })
);

app.get("/health", (req, res) =>
  res.json({
    status: mongoose.connection.readyState === 1 ? "OK" : "DB ISSUE",
    mongo: mongoose.connection.readyState,
    uptime: process.uptime(),
  })
);

// Render wake-up
app.get("/wakeup", (req, res) => res.sendStatus(204));

// API Routers
app.use("/api/messages", messagesRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/household-items", householdItemsRouter);
app.use("/api/body-parts", bodyPartsRouter);
app.use("/api/people", peopleRouter);
app.use("/api/animals", animalsRouter);

// ==============================================
// Socket.IO Setup
// ==============================================
const io = socketIO(server, {
  cors: { origin: allowedOrigins.includes("*") ? "*" : allowedOrigins },
  transports: ["websocket", "polling"],
  path: "/socket.io",
  pingInterval: 25000,
  pingTimeout: 60000,
});

const connectedUsers = {};   // userId → socketId
const pushTokens = {};       // userId → expoPushToken

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // Join
  socket.on("join", async ({ userId, name }) => {
    if (!userId) return;
    connectedUsers[userId] = socket.id;
    socket.userId = userId;
    socket.userName = name;

    // Deliver pending messages
    const pending = await Message.find({
      receiverId: userId,
      seenBy: { $ne: userId },
      isDeleted: false,
    }).sort({ createdAt: 1 });

    if (pending.length > 0) {
      socket.emit("pending-messages", pending);
    }
  });

  // Messaging
  socket.on("message", async (msg) => {
    try {
      if (!msg || !msg._id || !msg.user?._id) return;

      const exists = await Message.findById(msg._id);
      if (exists) {
        return socket.emit("message-delivered", {
          messageId: msg._id,
          status: "duplicate",
        });
      }

      const receiverId =
        msg.receiverId ||
        (msg.user._id === "user_1" ? "user_2" : "user_1");

      const saved = await new Message({
        ...msg,
        receiverId,
        seenBy: [msg.user._id],
        createdAt: msg.createdAt || new Date(),
      }).save();

      io.emit("message", saved);

      socket.emit("message-delivered", {
        messageId: saved._id,
        status: "delivered",
      });

      // ---- Push Notification ----
      const token = pushTokens[receiverId];
      if (token && Expo.isExpoPushToken(token)) {
        await expo.sendPushNotificationsAsync([
          {
            to: token,
            title: `New message from ${saved.user?.name || "Someone"}`,
            sound: "default",
            body: saved.text || "(Media)",
            data: { messageId: saved._id },
          },
        ]);
      }
    } catch (err) {
      console.error("❌ message error", err);
    }
  });

  // Delete
  socket.on("delete-message", async ({ messageId, userId }) => {
    const msg = await Message.findByIdAndUpdate(
      messageId,
      { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
      { new: true }
    );

    if (!msg) return;

    io.emit("message-deleted", {
      messageId,
      deletedAt: msg.deletedAt,
      deletedBy: userId,
    });
  });

  // Push Token
  socket.on("register-push-token", async ({ userId, expoPushToken }) => {
    if (!Expo.isExpoPushToken(expoPushToken)) return;

    pushTokens[userId] = expoPushToken;

    await UserStatus.findOneAndUpdate(
      { userId },
      { expoPushToken, lastSeen: new Date() },
      { upsert: true }
    );

    socket.emit("push-token-registered", { ok: true });
  });

  socket.on("disconnect", () => {
    if (socket.userId) delete connectedUsers[socket.userId];
    console.log("👋 Disconnected:", socket.id);
  });
});

// ==============================================
// Start Server
// ==============================================
server.listen(PORT, () =>
  console.log(`🚀 Server running on :${PORT}`)
);

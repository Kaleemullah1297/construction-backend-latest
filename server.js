const express = require("express");
const app = express();
const dotenv = require("dotenv").config();
const connectDB = require("./config/db");
const materialRoutes = require("./routes/materialRoutes");
const userRoutes = require("./routes/userRoutes");
const donationRoutes = require("./routes/donationRoutes");
const contactusRoutes = require("./routes/contactusRoutes");
const chatRoutes = require("./routes/chatRoutes");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const http = require("http");
const cors = require("cors");
const passport = require("./config/passport");
const { Server } = require("socket.io");
const userModel = require("./models/user");
const chatModel = require("./models/chat");

// Start the cron job
const startDonationCron = require("./utils/scheduledNotification");
startDonationCron();

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(passport.initialize());

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
// Serve firebase-messaging-sw.js from root
app.use(express.static(path.join(__dirname)));

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.send("backend is running");
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Connect DB
connectDB();

// API Routes
app.use("/api/contactus", contactusRoutes);
app.use("/api/material", materialRoutes);
app.use("/api/user", userRoutes);
app.use("/api/donation", donationRoutes);
app.use("/api/chats", chatRoutes);

// Create server
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

const users = {}; // socket.id -> userId

// Get and broadcast updated user list
const broadcastUserList = async (requesterId) => {
  try {
    const requester = await userModel.findById(requesterId);
    if (!requester) return;

    const socketId = Object.keys(users).find(
      (sockId) => users[sockId] === requesterId.toString()
    );

    if (requester.userType === "donor") {
      // 🧠 Get users donor chatted with, excluding soft-deleted ones
      const chats = await chatModel.find({
        $or: [{ senderId: requesterId }, { receiverId: requesterId }],
        deletedByDonor: { $ne: true },
      });

      const userIds = [
        ...new Set(
          chats.map((chat) =>
            chat.senderId.toString() === requesterId.toString()
              ? chat.receiverId?.toString?.() // ✅ added ? for safety
              : chat.senderId?.toString?.()
          )
        ),
      ].filter(Boolean); // ✅ filter undefined/null

      const recentUsers = await userModel.find(
        { _id: { $in: userIds } },
        "_id name isOnline profileImage userType"
      );

      const usersWithImageURL = recentUsers.map((user) => ({
        userType: user.userType,
        _id: user._id,
        name: user.name,
        isOnline: user.isOnline,
        profileImage: user.profileImage
          ? `http://localhost:3000/uploads/${user.profileImage}`
          : `http://localhost:3000/uploads/default.png`,
      }));

      if (socketId) {
        io.to(socketId).emit("user-list", usersWithImageURL);
      }
      return;
    }

    // If receiver, show all donors
    const donors = await userModel.find(
      { userType: "donor" },
      "_id name isOnline profileImage userType"
    );

    const donorsWithImageURL = donors.map((user) => ({
      userType: user.userType,
      _id: user._id,
      name: user.name,
      isOnline: user.isOnline,
      profileImage: user.profileImage
        ? `http://localhost:3000/uploads/${user.profileImage}`
        : `http://localhost:3000/uploads/default.png`,
    }));

    if (socketId) {
      io.to(socketId).emit("user-list", donorsWithImageURL);
    }
  } catch (err) {
    console.error("broadcastUserList error:", err);
  }
};

io.on("connection", async (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    console.log("No token provided");
    return socket.disconnect();
  }

  let senderId;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    senderId = decoded.id;

    const userExists = await userModel.findById(senderId);
    if (!userExists) {
      console.log("⛔ Token valid but user not found in DB");
      return socket.disconnect();
    }

    io.to(socket.id).emit("me", userExists); // 👈 send full user data to frontend

    users[socket.id] = senderId;

    await userModel.findByIdAndUpdate(senderId, { isOnline: "1" });

    console.log(`✅ User ${senderId} connected`);
    await broadcastUserList(senderId);
    socket.broadcast.emit("user-joined", senderId);
  } catch (err) {
    console.log("Token error:", err.message);
    return socket.disconnect();
  }

  // Listen for chat messages
  socket.on("send", async ({ message, receiverId }) => {
    if (!message) return;

    const sender = await userModel.findById(senderId);
    if (!sender) return;

    const senderInfo = {
      senderId,
      senderName: sender.name,
      senderProfileImage: sender.profileImage
        ? `http://localhost:3000/uploads/${sender.profileImage}`
        : `http://localhost:3000/uploads/default.png`,
    };

    if (sender.userType === "donor") {
      // Find last chat where donor was receiver
      const latestChat = await chatModel
        .findOne({ receiverId: senderId })
        .sort({ createdAt: -1 });

      if (!latestChat) {
        console.log(
          "❌ Donor tried to start chat without existing conversation"
        );
        return;
      }

      const actualReceiverId = latestChat.senderId;

      // Save message
      const newMsg = await chatModel.create({
        senderId,
        receiverId: actualReceiverId,
        message,
      });

      // Emit to receiver
      const receiverSocketId = Object.keys(users).find(
        (sockId) => users[sockId] === actualReceiverId.toString()
      );

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receive", {
          message,
          _id: newMsg._id,
          ...senderInfo,
        });
      }
    } else {
      // Receiver is allowed to initiate
      if (!receiverId) return;

      const newMsg = await chatModel.create({ senderId, receiverId, message });

      const receiverSocketId = Object.keys(users).find(
        (sockId) => users[sockId] === receiverId
      );

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receive", {
          message,
          _id: newMsg._id,
          ...senderInfo,
        });
      }
    }
  });

  // Manual user list request
  socket.on("request-user-list", async () => {
    await broadcastUserList(senderId); // ← pass senderId here
  });

  // Handle disconnect
  socket.on("disconnect", async () => {
    delete users[socket.id];
    await userModel.findByIdAndUpdate(senderId, { isOnline: "0" });
    console.log(`❌ User ${senderId} disconnected`);

    // Optionally refresh online list for others
    await broadcastUserList(senderId);
  });
});

// Start backend server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🔌 Backend Server running on port ${PORT}`);
});

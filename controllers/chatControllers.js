const chatModel = require("../models/chat");
const userModel = require("../models/user");

exports.getAllChats = async (req, res) => {
  try {
    const userId = req.user;
    const partnerId = req.params.id;

    const user = await userModel.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const query = {
      $or: [
        { senderId: userId, receiverId: partnerId },
        { senderId: partnerId, receiverId: userId },
      ],
    };

    // Apply soft delete filter based on user type
    if (user.userType === "donor") {
      query.deletedByDonor = { $ne: true };
    } else {
      query.deletedByReceiver = { $ne: true };
    }

    const chats = await chatModel
      .find(query)
      .sort({ createdAt: 1 })
      .populate("senderId", "name profileImage userType")
      .populate("receiverId", "name profileImage userType");

    if (!chats || chats.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No chats found between users." });
    }

    return res.status(200).json({
      success: true,
      message: "Chat retrieved successfully.",
      chats,
    });
  } catch (error) {
    console.log("Get all chats error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const userId = req.user;
    const messageId = req.params.messageId;
    console.log(messageId);

    const message = await chatModel.findById(messageId);
    console.log(message);

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

    if (
      message.senderId.toString() !== userId &&
      message.receiverId.toString() !== userId
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const receiverId = message.receiverId.toString();
    const senderId = message.senderId.toString();

    // Delete the message from the database
    await chatModel.findByIdAndDelete(messageId);

    // Notify both parties
    req.io?.to(senderId).emit("message-deleted", { messageId });
    req.io?.to(receiverId).emit("message-deleted", { messageId });

    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const userId = req.user;
    const receiverId = req.params.receiverId;

    // Get user to check userType
    const user = await userModel.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isDonor = user.userType === "donor";
    const isReceiver = user.userType === "receiver";

    if (!isDonor && !isReceiver) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user type" });
    }

    // Fetch all messages between the two users
    const messages = await chatModel.find({
      $or: [
        { senderId: userId, receiverId },
        { senderId: receiverId, receiverId: userId },
      ],
    });

    const toUpdate = [];
    const toDelete = [];

    for (const msg of messages) {
      if (isDonor) {
        if (msg.deletedByReceiver) {
          toDelete.push(msg._id); // both sides deleted
        } else {
          toUpdate.push({ _id: msg._id, field: "deletedByDonor" });
        }
      }

      if (isReceiver) {
        if (msg.deletedByDonor) {
          toDelete.push(msg._id); // both sides deleted
        } else {
          toUpdate.push({ _id: msg._id, field: "deletedByReceiver" });
        }
      }
    }

    // Perform soft updates
    for (const item of toUpdate) {
      await chatModel.findByIdAndUpdate(item._id, {
        [item.field]: true,
      });
    }

    // Hard delete if both deleted
    if (toDelete.length > 0) {
      await chatModel.deleteMany({ _id: { $in: toDelete } });
    }

    return res.json({
      success: true,
      message: "Conversation updated",
      softUpdated: toUpdate.length,
      hardDeleted: toDelete.length,
    });
  } catch (err) {
    console.error("Error deleting conversation:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

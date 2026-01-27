const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatControllers");
const { isLoggedIn } = require("../middlewares/isLoggedIn");

router.get("/:id", isLoggedIn, chatController.getAllChats);
router.delete("/:messageId", isLoggedIn, chatController.deleteMessage);
router.delete(
  "/conversation/:receiverId",
  isLoggedIn,
  chatController.deleteConversation
);

module.exports = router;

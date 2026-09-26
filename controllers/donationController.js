const donationModel = require("../models/donation");
const sendNotification = require("../config/firebase");
const admin = require("../config/firebase");
const fs = require("fs");
const path = require("path");
const userModel = require("../models/user");
const materialModel = require("../models/material");
const chatModel = require("../models/chat");
const { nanoid } = require("nanoid");
//const { json } = require("stream/consumers");
//const user = require("../models/user");
//const schedule = require("node-schedule");
const mongoose = require("mongoose");
//const moment = require("moment");

exports.addDonation = async (req, res) => {
  try {
    const userId = req.user;
    console.log(userId)

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.userType !== "donor") {
      return res.status(400).json({
        success: false,
        message: "Only donors can add donations.",
      });
    }

    const { materialType, quantity, description, donationStatus, pickupAddress, address } = req.body;
    console.log(req.body)

    if (!materialType || !quantity) {
      return res.status(400).json({
        success: false,
        message: !materialType
          ? "Material type is required."
          : "Quantity is required.",
      });
    }

    if (!/^[a-f\d]{24}$/i.test(materialType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid material ID format.",
      });
    }

    const findMaterial = await materialModel.findById(materialType);
    if (!findMaterial) {
      return res.status(404).json({
        success: false,
        message: "Material not found.",
      });
    }

    const imageFiles = req.files || [];
    console.log(imageFiles)

    // ✅ Custom validation
    if (imageFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one image is required.",
      });
    }

    if (imageFiles.length > 3) {
      return res.status(400).json({
        success: false,
        message: "You can upload a maximum of 3 images.",
      });
    }

    const images = imageFiles.map((file) => ({
      id: nanoid(),
      public_id: file.filename,   // Cloudinary public_id
      url: file.path,             // Cloudinary secure URL
    }));

    const numQty = Number(quantity) || 1;
    const finalPickupAddress = (pickupAddress || address || user.address || "").trim();

    const newDonation = await donationModel.create({
      userId,
      materialType,
      materialId: findMaterial.materialId,
      quantity: numQty,
      totalQuantity: numQty,
      leftQuantity: numQty,
      pickupAddress: finalPickupAddress,
      description,
      donationStatus,
      totalPrice: findMaterial.value * numQty,
      images,
    });

    await userModel.findByIdAndUpdate(
      userId,
      { $push: { donations: newDonation._id } },
      { new: true }
    );

    const donationData = await donationModel
      .findById(newDonation._id)
      .populate("materialType")
      .populate({ path: "userId", select: "fullName" })
      .populate({ path: "scheduleById", select: "fullName" })
      .populate({ path: "canceledById", select: "fullName" });

    const donationResponse = {
  ...donationData.toObject(),
  images: donationData.images.map((img) => ({
    id: img.id,
    url: img.url,           // already Cloudinary CDN
    public_id: img.public_id
  })),
};


    return res.status(200).json({
      success: true,
      message: "Donation added successfully.",
      data: donationResponse,
    });
  } catch (error) {
     console.log(error);        // full object
  console.log(error.message);
  console.log(error.stack);
  return res.status(500).json({
    success: false,
    message: error.message || "Internal server error",
  });}
};

exports.getDonation = async (req, res) => {
  try {
    const userId = req.user;
    const user = await userModel.findById(userId);

    let donations;
    if (user.userType === "donor") {
      donations = await donationModel
        .find({ userId: userId })
        .populate("materialType")
        .populate({ path: "userId", select: "fullName email phone profileImage userType address" })
        .populate({ path: "scheduleById", select: "fullName email phone profileImage userType address" })
        .populate({ path: "canceledById", select: "fullName email phone profileImage userType address" })
        .lean();
    } else {
      donations = await donationModel
        .find()
        .populate("materialType")
        .populate({ path: "userId", select: "fullName email phone profileImage userType address" })
        .populate({ path: "scheduleById", select: "fullName email phone profileImage userType address" })
        .populate({ path: "canceledById", select: "fullName email phone profileImage userType address" })
        .lean();
    }

    const formattedDonations = donations.map((donation) => ({
      ...donation,
      totalQuantity: donation.totalQuantity || donation.quantity,
      leftQuantity: typeof donation.leftQuantity === "number" ? donation.leftQuantity : donation.quantity,
      images: (donation.images || []).map((img) => ({
        id: img.id || img._id,
        url: img.url,          // Cloudinary URL
        public_id: img.public_id,
      })),
    }));

    res.status(200).json({
      success: true,
      message: "Donations retrieved successfully",
      data: formattedDonations,
    });
  } catch (error) {
    console.error("Get Donation Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.scheduleDonation = async (req, res) => {
  try {
    const userId = req.user;
    const checkUser = await userModel.findById(userId);
    const donationId = req.params.id;

    const findDonation = await donationModel.findById(donationId);
    if (!findDonation) {
      return res
        .status(404)
        .json({ success: false, message: "Donation not found" });
    }

    let { scheduleDate, scheduleTime, scheduleComments, deliveryType } =
      req.body;

    if (checkUser.userType === "receiver") {
      if (
        findDonation.donationStatus === "cancelled" ||
        findDonation.donationStatus === "completed" ||
        findDonation.scheduleById !== null
      ) {
        return res.status(400).json({
          success: false,
          message: "Donation already scheduled.",
        });
      }

      if (!deliveryType) {
        return res
          .status(400)
          .json({ success: false, message: "Delivery Type is required." });
      }

      const currentLeft =
        typeof findDonation.leftQuantity === "number" && findDonation.leftQuantity > 0
          ? findDonation.leftQuantity
          : findDonation.quantity;

      const requestedQty = Math.max(
        1,
        Math.min(
          Number(scheduledQuantity) || Number(quantity) || currentLeft,
          currentLeft
        )
      );
      const newLeft = Math.max(0, currentLeft - requestedQty);
      const finalDeliveryAddress = (
        deliveryAddress ||
        address ||
        checkUser.address ||
        ""
      ).trim();

      const scheduleById = checkUser.id;

      const donation = await donationModel
        .findByIdAndUpdate(
          donationId,
          {
            scheduleDate,
            scheduleComments,
            scheduleTime,
            scheduleById,
            deliveryType,
            deliveryAddress: finalDeliveryAddress,
            scheduledQuantity: requestedQty,
            leftQuantity: newLeft,
            totalQuantity: findDonation.totalQuantity || findDonation.quantity,
          },
          { new: true }
        )
        .populate("materialType")
        .populate({ path: "userId", select: "fullName email phone profileImage userType address" })
        .populate({ path: "scheduleById", select: "fullName email phone profileImage userType address" })
        .lean(); // this is the donor

      // Add to receiver's donation list
      await userModel.findByIdAndUpdate(userId, {
        $addToSet: { donations: donationId },
      });

      // 💬 Auto-send message between receiver and donor
      try {
        const donorId = (donation.userId?._id || donation.userId || "").toString();
        const receiverId = userId.toString();
        const dateStr = scheduleDate || "the scheduled date";
        const timeStr = scheduleTime ? ` at ${scheduleTime}` : "";

        let msgSenderId, msgReceiverId, autoMessageText;

        if (deliveryType === "pickup") {
          // Message from Receiver -> Donor
          msgSenderId = receiverId;
          msgReceiverId = donorId;
          const pickupLoc = findDonation.pickupAddress
            ? ` Pickup location: "${findDonation.pickupAddress}".`
            : "";
          autoMessageText = `Hi! A pickup has been scheduled for ${dateStr}${timeStr}.${pickupLoc} Please confirm your location/address.`;
        } else {
          // Message from Donor -> Receiver
          msgSenderId = donorId;
          msgReceiverId = receiverId;
          const deliveryLoc = finalDeliveryAddress
            ? ` Delivery location: "${finalDeliveryAddress}".`
            : "";
          autoMessageText = `Hi! Delivery is scheduled for ${dateStr}${timeStr}.${deliveryLoc} Please confirm your location/address.`;
        }

        if (msgSenderId && msgReceiverId) {
          const autoChat = await chatModel.create({
            senderId: msgSenderId,
            receiverId: msgReceiverId,
            message: autoMessageText,
          });

          const populatedChat = await chatModel
            .findById(autoChat._id)
            .populate("senderId", "name profileImage userType")
            .populate("receiverId", "name profileImage userType");

          if (req.io) {
            req.io.to(msgSenderId).emit("receive-message", populatedChat);
            req.io.to(msgReceiverId).emit("receive-message", populatedChat);
          }
        }
      } catch (chatError) {
        console.error("Auto chat message error on scheduling:", chatError);
      }

      // ✅ Send FCM notification to donor
      const donor = donation.userId;
      const deviceTokens = (donor?.deviceId || []).filter(Boolean);

      const donationData = {
        ...donation,
        images: (donation.images || []).map((img) => ({
          id: img.id || img._id,
          url: img.url, // Cloudinary URL
          public_id: img.public_id,
        })),
      };

      console.log(deviceTokens);

      if (deviceTokens.length > 0) {
        const message = {
          notification: {
            title: "Donation Scheduled",
            body: `Your donation for "${donation.materialType?.name || donation.materialType?.material || "Material"}" has been scheduled.`,
          },
          data: {
            type: "donation_scheduled",
            donationId: donation._id.toString(),
          },
          tokens: deviceTokens.filter(Boolean),
        };

        try {
          const response = await admin.messaging().sendEachForMulticast({
            tokens: message.tokens,
            notification: message.notification,
            data: message.data,
          });

          console.log(
            "✅ Notification sent:",
            response.successCount,
            "successes"
          );
        } catch (err) {
          console.error("❌ Error sending FCM notification:", err);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Donation scheduled successfully.",
        data: donationData,
      });

    } else {
      return res.status(403).json({
        success: false,
        message: "Only receivers can schedule donations.",
      });
    }
  } catch (error) {
    console.error("Schedule donation error:", error);
    res.status(500).json({ success: false, message: "Internal Server error" });
  }
};

exports.removeDonation = async (req, res) => {
  try {
    const userId = req.user;
    const donationId = req.params.id;

    // Validate user
    const user = await userModel.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.userType !== "donor") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only donors can delete donations",
      });
    }

    // Validate donation
    const donation = await donationModel.findById(donationId);
    if (!donation) {
      return res
        .status(404)
        .json({ success: false, message: "Donation not found" });
    }

    if (donation.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: This donation does not belong to you",
      });
    }

    // Delete all associated images from Cloudinary
    if (donation.images && donation.images.length > 0) {
      for (const img of donation.images) {
        if (img.public_id) {
          try {
            await cloudinary.uploader.destroy(img.public_id);
            console.log("Deleted Cloudinary image:", img.public_id);
          } catch (err) {
            console.error(
              "Error deleting Cloudinary image:",
              img.public_id,
              err.message
            );
          }
        }
      }
    }

    // Delete the donation from DB
    const deletedDonation = await donationModel.findByIdAndDelete(donationId);

    // Remove reference from user's donations array
    await userModel.findByIdAndUpdate(userId, {
      $pull: { donations: donationId },
    });

    return res.status(200).json({
      success: true,
      message: "Donation deleted successfully",
      data: deletedDonation,
    });
  } catch (error) {
    console.error("Delete donation error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.editDonation = async (req, res) => {
  // Delete files either from Cloudinary or local filesystem
  const deleteUploadedFiles = async (files = [], fromCloud = false) => {
    if (fromCloud) {
      for (const file of files) {
        try {
          if (file.public_id) {
            await cloudinary.uploader.destroy(file.public_id);
          }
        } catch (err) {
          console.error("Failed to delete Cloudinary file:", file.public_id, err);
        }
      }
    } else {
      files.forEach((file) => {
        const imagePath = path.join(__dirname, "../uploads/donations", file.filename);
        fs.unlink(imagePath, (err) => {
          if (err) console.error("Failed to delete uploaded file:", imagePath);
        });
      });
    }
  };

  // Notification helper function
  const sendNotification = async (tokens, title, body, data) => {
    if (!tokens || tokens.length === 0) return;

    try {
      await admin.messaging().sendEachForMulticast({
        tokens: [...new Set(tokens.filter(Boolean))],
        notification: { title, body },
        data,
      });
    } catch (err) {
      console.error("Error sending notification:", err);
    }
  };

  try {
    const userId = req.user;
    const checkUser = await userModel.findById(userId).select("-password");
    const donationId = req.params.id;
    const findDonation = await donationModel.findById(donationId).populate("materialType");

    if (!findDonation) {
      return res.status(404).json({ success: false, message: "Donation not found" });
    }

    const currentStatus = findDonation.donationStatus?.trim() || "";

    if (["cancelled", "completed"].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Cannot update a donation that is already completed or cancelled",
      });
    }

    const {
      donorCompleted = findDonation.donorCompleted,
      receiverCompleted = findDonation.receiverCompleted,
      donationStatus = currentStatus,
      quantity = findDonation.quantity,
      cancelComments = findDonation.cancelComments,
      canceledById = findDonation.canceledById,
      removeImageIds = null,
      delivery = findDonation.delivery,
      pickup = findDonation.pickup,
    } = req.body || {};

    // Initialize changes object
    const changes = {
      quantity: findDonation.quantity,
      donationStatus: currentStatus,
      canceledById: findDonation.canceledById,
      cancelComments: findDonation.cancelComments,
      images: findDonation.images || [],
      totalPrice: findDonation.totalPrice,
      donorCompleted: findDonation.donorCompleted,
      pickup: findDonation.pickup,
      delivery: findDonation.delivery,
      receiverCompleted: findDonation.receiverCompleted,
    };

    // ===== RECEIVER LOGIC =====
    if (checkUser.userType === "receiver") {
      if (findDonation.scheduleById?.toString() !== checkUser._id.toString()) {
        return res.status(403).json({ success: false, message: "Unauthorized: You did not schedule this donation." });
      }

      changes.receiverCompleted = receiverCompleted;
      changes.canceledById = canceledById;
      changes.cancelComments = cancelComments;
      changes.delivery = delivery;

      if (donationStatus === "completed") {
        changes.receiverCompleted = true;
        if (findDonation.donorCompleted) {
          changes.donationStatus = "completed";
          changes.delivery = true;
        }
      }

      if (donationStatus === "cancelled") {
        changes.canceledById = checkUser._id;
        changes.donationStatus = "cancelled";
        const restoredQty = findDonation.scheduledQuantity || 0;
        changes.leftQuantity = (findDonation.leftQuantity || 0) + restoredQty;
        changes.scheduledQuantity = 0;
      }

      if (delivery === true && findDonation.delivery !== true) changes.delivery = true;

      const donation = await donationModel
        .findByIdAndUpdate(donationId, changes, { new: true })
        .populate("materialType")
        .populate({ path: "userId", select: "fullName email phone profileImage userType address" })
        .populate({ path: "scheduleById", select: "fullName email phone profileImage userType address" })
        .populate({ path: "canceledById", select: "fullName email phone profileImage userType address" });

      if (donation.donationStatus === "completed" && currentStatus !== "completed") {
        const donor = await userModel.findById(findDonation.userId);
        const receiver = await userModel.findById(findDonation.scheduleById);

        const donorTokens = donor?.deviceId?.filter(Boolean) || [];
        const receiverTokens = receiver?.deviceId?.filter(Boolean) || [];

        await sendNotification(donorTokens, "Donation Completed", `${checkUser.fullName} has completed your donation`, {
          type: "donation_completed",
          donationId: donation._id.toString(),
        });
        await sendNotification(receiverTokens, "Donation Completed", `You have completed the donation from ${donation.userId.fullName}`, {
          type: "donation_completed",
          donationId: donation._id.toString(),
        });
      } else if (donationStatus === "cancelled") {
        const donor = await userModel.findById(findDonation.userId);
        const donorTokens = donor?.deviceId?.filter(Boolean) || [];
        await sendNotification(donorTokens, "Donation Cancelled", `${checkUser.fullName} has cancelled the scheduled donation`, {
          type: "donation_cancelled",
          donationId: donation._id.toString(),
        });
      }

      return res.status(200).json({ success: true, message: "Donation updated successfully", data: donation });
    }

    // ===== DONOR LOGIC =====
    if (checkUser.userType !== "donor") return res.status(403).json({ success: false, message: "Unauthorized user type" });
    if (findDonation.userId?.toString() !== checkUser._id.toString())
      return res.status(403).json({ success: false, message: "Unauthorized: You did not create this donation." });

    let updatedImages = findDonation.images || [];

    // Parse removeImageIds if string
    let parsedRemoveImageIds = removeImageIds;
    if (typeof removeImageIds === "string") {
      try {
        parsedRemoveImageIds = JSON.parse(removeImageIds);
      } catch {
        await deleteUploadedFiles(req.files, true);
        return res.status(400).json({ success: false, message: "Invalid format for removeImageIds. Must be a JSON array." });
      }
    }

    // Remove images from Cloudinary
    if (parsedRemoveImageIds && Array.isArray(parsedRemoveImageIds)) {
      const validImageIds = updatedImages.map((img) => img.id);
      const invalidIds = parsedRemoveImageIds.filter((id) => !validImageIds.includes(id));

      if (invalidIds.length > 0) {
        await deleteUploadedFiles(req.files, true);
        return res.status(400).json({ success: false, message: "Some image IDs do not belong to this donation", invalidImageIds: invalidIds });
      }

      // Delete removed images from Cloudinary
      for (const img of updatedImages) {
        if (parsedRemoveImageIds.includes(img.id)) {
          try {
            if (img.public_id) await cloudinary.uploader.destroy(img.public_id);
          } catch (err) {
            console.error("Failed to delete Cloudinary file:", img.public_id, err);
          }
        }
      }

      updatedImages = updatedImages.filter((img) => !parsedRemoveImageIds.includes(img.id));
    }

    // Handle new images uploaded to Cloudinary
    const newImages = req.files?.map((file) => ({
      id: nanoid(),
      public_id: file.filename,
      url: file.path,
    })) || [];

    // Validate image count
    if (newImages.length > 0 || parsedRemoveImageIds) {
      const finalImageCount = updatedImages.length + newImages.length;
      if (finalImageCount > 3) {
        await deleteUploadedFiles(req.files, true);
        return res.status(400).json({ success: false, message: "You can only have up to 3 images." });
      }
      if (finalImageCount < 1) {
        await deleteUploadedFiles(req.files, true);
        return res.status(400).json({ success: false, message: "At least one image is required." });
      }
    }

    updatedImages = [...updatedImages, ...newImages];

    // Update changes
    let parsedQuantity = Number(quantity);
    if (isNaN(parsedQuantity)) parsedQuantity = findDonation.quantity;
    changes.quantity = parsedQuantity;
    changes.totalPrice = parsedQuantity * findDonation.materialType.value;
    changes.images = updatedImages;
    changes.donorCompleted = donorCompleted;
    changes.pickup = pickup;
    changes.cancelComments = cancelComments;
    changes.canceledById = canceledById;

    if (donationStatus === "completed") {
      changes.donorCompleted = true;
      changes.pickup = true;
      if (findDonation.receiverCompleted) {
        changes.donationStatus = "completed";
        changes.delivery = true;
      }
    }
    if (donationStatus === "cancelled") {
      changes.canceledById = checkUser._id;
      changes.donationStatus = "cancelled";
      const restoredQty = findDonation.scheduledQuantity || 0;
      changes.leftQuantity = (findDonation.leftQuantity || 0) + restoredQty;
      changes.scheduledQuantity = 0;
    }
    if (pickup === true && findDonation.pickup !== true) changes.pickup = true;

    const updatedDonation = await donationModel
      .findByIdAndUpdate(donationId, changes, { new: true })
      .populate("materialType")
      .populate({ path: "userId", select: "fullName email phone profileImage userType address" })
      .populate({ path: "scheduleById", select: "fullName email phone profileImage userType address" })
      .populate({ path: "canceledById", select: "fullName email phone profileImage userType address" });

    // Notifications
    if (updatedDonation.donationStatus === "completed" && currentStatus !== "completed") {
      const donor = await userModel.findById(findDonation.userId);
      const receiver = await userModel.findById(findDonation.scheduleById);
      const donorTokens = donor?.deviceId?.filter(Boolean) || [];
      const receiverTokens = receiver?.deviceId?.filter(Boolean) || [];
      await sendNotification(donorTokens, "Donation Completed", `You have completed your donation to ${updatedDonation.scheduleById.fullName}`, { type: "donation_completed", donationId: updatedDonation._id.toString() });
      await sendNotification(receiverTokens, "Donation Completed", `${checkUser.fullName} has completed your scheduled donation`, { type: "donation_completed", donationId: updatedDonation._id.toString() });
    } else if (donationStatus === "cancelled") {
      const receiver = await userModel.findById(findDonation.scheduleById);
      const receiverTokens = receiver?.deviceId?.filter(Boolean) || [];
      await sendNotification(receiverTokens, "Donation Cancelled", `${checkUser.fullName} has cancelled the donation`, { type: "donation_cancelled", donationId: updatedDonation._id.toString() });
    }

    // Response
    const fullDonationData = {
      ...updatedDonation.toObject(),
      images: updatedDonation.images.map((img) => ({
        id: img.id,
        url: img.url,
        public_id: img.public_id,
      })),
    };

    return res.status(200).json({ success: true, message: "Donation updated successfully", data: fullDonationData });

  } catch (error) {
    console.error("Update donation error:", error);
    await deleteUploadedFiles(req.files, true);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

//TRACK DONATIONS

exports.trackDonation = async (req, res) => {
  try {
    const userId = req.user;
    const checkUser = await userModel.findById(userId);

    if (!checkUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const buildImageUrl = (images) => {
      return (images || []).map((img) => ({
        _id: img.id || img._id,
        id: img.id || img._id,
        url: img.url || (img.filename ? `${baseUrl}/uploads/donations/${img.filename}` : ""),
        public_id: img.public_id,
      }));
    };

    const formatDonations = (donations) => {
      return (donations || []).map((donation) => ({
        ...donation.toObject(),
        totalQuantity: donation.totalQuantity || donation.quantity,
        leftQuantity: typeof donation.leftQuantity === "number" ? donation.leftQuantity : donation.quantity,
        images: buildImageUrl(donation.images || []),
      }));
    };

    const populateFields = [
      "materialType",
      { path: "userId", select: "fullName email phone profileImage userType address" },
      { path: "scheduleById", select: "fullName email phone profileImage userType address" },
      { path: "canceledById", select: "fullName email phone profileImage userType address" },
    ];

    if (checkUser.userType === "donor") {
      const [pending, cancelled, completed, scheduled] = await Promise.all([
        donationModel
          .find({ userId, donationStatus: "pending" })
          .populate(populateFields),
        donationModel
          .find({ userId, donationStatus: "cancelled" })
          .populate(populateFields),
        donationModel
          .find({ userId, donationStatus: "completed" })
          .populate(populateFields),
        donationModel
          .find({ userId, scheduleById: { $ne: null } })
          .populate(populateFields),
      ]);

      return res.status(200).json({
        success: true,
        message: "Donor donations retrieved successfully",
        data: {
          pending: formatDonations(pending),
          cancelled: formatDonations(cancelled),
          completed: formatDonations(completed),
          scheduled: formatDonations(scheduled),
        },
      });
    }

    if (checkUser.userType === "receiver") {
      const [pending, cancelled, completed, scheduled] = await Promise.all([
        donationModel
          .find({ donationStatus: "pending" })
          .populate(populateFields),
        donationModel
          .find({ donationStatus: "cancelled" })
          .populate(populateFields),
        donationModel
          .find({ scheduleById: userId, donationStatus: "completed" })
          .populate(populateFields),
        donationModel.find({ scheduleById: userId }).populate(populateFields),
      ]);

      return res.status(200).json({
        success: true,
        message: "Receiver donations retrieved successfully",
        data: {
          pending: formatDonations(pending),
          cancelled: formatDonations(cancelled),
          completed: formatDonations(completed),
          scheduled: formatDonations(scheduled),
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid user type.",
    });
  } catch (error) {
    console.error("Track Donation error", error);
    res.status(500).json({ success: false, message: "Internal Server Error." });
  }
};

//MONTHLY REPORT OF THE USER

exports.monthlyReport = async (req, res) => {
  try {
    const userId = req.user;
    console.log(userId);
    const checkUser = await userModel.findById(userId);

    if (checkUser.userType === "donor") {
      const allDonations = await donationModel.find({
        userId: userId,
        donationStatus: "completed",
      });

      let totalPrice = 0;
      allDonations.forEach((donation) => {
        if (donation.totalPrice) {
          totalPrice += donation.totalPrice;
        }
      });

      return res.status(200).json({
        success: true,
        message: "Data retrieved successfully",
        data: {
          totalDonations: checkUser.donations.length,
          totalPrice: totalPrice,
        },
      });
    }

    if (checkUser.userType === "receiver") {
      const allDonations = await donationModel.find({
        scheduleById: userId,
        donationStatus: "completed",
      });

      const allscheduledDonations = await donationModel.find({
        scheduleById: userId,
      });

      let totalPrice = 0;
      allDonations.forEach((donation) => {
        if (donation.totalPrice) {
          totalPrice += donation.totalPrice;
        }
      });

      return res.status(200).json({
        success: true,
        message: "Data retrieved successfully",
        data: {
          totalDonations: allscheduledDonations.length,
          totalPrice: totalPrice,
        },
      });
    }
  } catch (error) {
    console.error("Monthly Report Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error." });
  }
};

//THESE ALL APIS ARE FOR FAVORITES

exports.addFavorites = async (req, res) => {
  try {
    const userId = req.user;
    const { favorites } = req.body;

    const user = await userModel.findById(userId).select("userType favorites");

    if (!favorites) {
      return res
        .status(400)
        .json({ success: false, message: "Donation ID is required." });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(favorites)) {
      return res.status(400).json({
        success: false,
        message: "Invalid donation ID format.",
      });
    }

    const donation = await donationModel.findById(favorites);
    if (!donation) {
      return res
        .status(404)
        .json({ success: false, message: "Donation not found." });
    }

    // Donors can only favorite their own donations
    if (user.userType === "donor") {
      if (donation.userId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Donors can only favorite their own donations.",
        });
      }
    }

    // Check if already favorited
    if (user.favorites.includes(favorites)) {
      return res.status(200).json({
        success: false,
        message: "This donation is already in favorites.",
      });
    }

    // Add to favorites
    const updatedUser = await userModel
      .findByIdAndUpdate(userId, { $addToSet: { favorites } }, { new: true })
      .populate({
        path: "favorites",
        populate: [
          { path: "userId", select: "fullName email phone profileImage userType address" },
          { path: "scheduleById", select: "fullName email phone profileImage userType address" },
          { path: "canceledById", select: "fullName email phone profileImage userType address" },
          { path: "materialType", select: "material unit value" },
        ],
      });

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const formattedFavorites = (updatedUser.favorites || []).map((donation) => ({
      ...donation.toObject(),
      totalQuantity: donation.totalQuantity || donation.quantity,
      leftQuantity: typeof donation.leftQuantity === "number" ? donation.leftQuantity : donation.quantity,
      images: (donation.images || []).map((img) => ({
        id: img.id || img._id,
        _id: img.id || img._id,
        url: img.url || (img.filename ? `${baseUrl}/uploads/donations/${img.filename}` : ""),
        public_id: img.public_id,
      })),
    }));

    return res.status(200).json({
      success: true,
      message: "Donation added to favorites.",
      data: formattedFavorites,
    });
  } catch (error) {
    console.error("Add to favorites error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error." });
  }
};

exports.getAllFavorites = async (req, res) => {
  try {
    const userId = req.user;

    const user = await userModel
      .findById(userId)
      .select("userType favorites")
      .populate({
        path: "favorites",
        populate: [
          { path: "userId", select: "fullName email phone profileImage userType address" },
          { path: "scheduleById", select: "fullName email phone profileImage userType address" },
          { path: "canceledById", select: "fullName email phone profileImage userType address" },
          { path: "materialType", select: "material unit value" },
        ],
      });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Format image URLs for each favorite donation
    const formattedFavorites = (user.favorites || []).map((donation) => ({
      ...donation.toObject(),
      totalQuantity: donation.totalQuantity || donation.quantity,
      leftQuantity: typeof donation.leftQuantity === "number" ? donation.leftQuantity : donation.quantity,
      images: (donation.images || []).map((img) => ({
        id: img.id || img._id,
        _id: img.id || img._id,
        url: img.url || (img.filename ? `${baseUrl}/uploads/donations/${img.filename}` : ""),
        public_id: img.public_id,
      })),
    }));

    return res.status(200).json({
      success: true,
      message: "Favorites retrieved successfully.",
      data: formattedFavorites,
    });
  } catch (error) {
    console.error("Get All Favorites Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error." });
  }
};

exports.removeFromFavorites = async (req, res) => {
  try {
    const userId = req.user;
    const donationId = req.params.id;

    // ✅ Validate ObjectId format
    if (!donationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid donation ID format.",
      });
    }

    // ✅ Check if user exists
    const user = await userModel.findById(userId).select("favorites");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // ✅ Check if the donation is actually in favorites
    if (!user.favorites.includes(donationId)) {
      return res.status(404).json({
        success: false,
        message: "Donation not found in favorites.",
      });
    }

    // ✅ Remove donation from favorites
    const updatedUser = await userModel
      .findByIdAndUpdate(
        userId,
        { $pull: { favorites: donationId } },
        { new: true }
      )
      .populate({
        path: "favorites",
        populate: [
          { path: "userId", select: "fullName email phone profileImage userType address" },
          { path: "scheduleById", select: "fullName email phone profileImage userType address" },
          { path: "canceledById", select: "fullName email phone profileImage userType address" },
          { path: "materialType", select: "material unit value" },
        ],
      })
      .select("favorites");

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const formattedFavorites = (updatedUser.favorites || []).map((donation) => ({
      ...donation.toObject(),
      totalQuantity: donation.totalQuantity || donation.quantity,
      leftQuantity: typeof donation.leftQuantity === "number" ? donation.leftQuantity : donation.quantity,
      images: (donation.images || []).map((img) => ({
        id: img.id || img._id,
        _id: img.id || img._id,
        url: img.url || (img.filename ? `${baseUrl}/uploads/donations/${img.filename}` : ""),
        public_id: img.public_id,
      })),
    }));

    return res.status(200).json({
      success: true,
      message: "Donation removed from favorites.",
      data: formattedFavorites,
    });
  } catch (error) {
    console.error("Remove from favorites error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

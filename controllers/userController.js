const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("dotenv");
const path = require("path");
const fs = require("fs");
const { OAuth2Client } = require("google-auth-library");
const userModel = require("../models/user");
const materialModel = require("../models/material");
const nodemailer = require("nodemailer");
const randomstring = require("randomstring");
const { messaging } = require("firebase-admin");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const secret_key = process.env.JWT_SECRET;

exports.registerUser = async (req, res) => {
  try {
    const { userType, email, password, confirmPassword } = req.body;

    // Check for missing fields
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "email is required." });
    }

    if (!password) {
      return res
        .status(400)
        .json({ success: false, message: "password is required." });
    }

    if (!confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "confirmPassword is required." });
    }

    if (!userType) {
      return res
        .status(400)
        .json({ success: false, message: "userType is required." });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    // Check if user already exists
    const existedUser = await userModel.findOne({ email });
    if (existedUser) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered." });
    }

    // Validate password
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords and confirm password do not match.",
      });
    }

    if (!["donor", "receiver"].includes(userType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user type." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await userModel.create({
      userType,
      email,
      password: hashedPassword,
    });

    const user = await userModel.findById(newUser.id).select("-password");

    // Generate token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "15d",
    });

    return res.status(201).json({
      message: "User registered successfully.",
      success: true,
      token: token,
      data: user,
    });
  } catch (error) {
    console.error("Registration Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;

    // Check email
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "email is required." });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    // Check password
    if (!password) {
      return res
        .status(400)
        .json({ success: false, message: "password is required." });
    }

    // Check deviceId
    if (!deviceId || typeof deviceId !== "string" || deviceId.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "deviceId is required." });
    }

    // Find user
    let user = await userModel.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found." });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deleted. Please contact support.",
      });
    }

    // Check password match
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials." });
    }

    // Add deviceId if not already added
    if (!user.deviceId.includes(deviceId)) {
      await userModel.findByIdAndUpdate(user._id, {
        $addToSet: { deviceId },
      });
    }

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15d",
    });

    const getUser = await userModel.findById(user.id).select("-password");

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      data: getUser,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

exports.createProfile = async (req, res) => {
  try {
    const userId = req.user;

    if (req.file) {
      const filePath = req.file.path;
    }

    function imageDeletion(filePath) {
      if (!filePath) return;
      fs.unlink(filePath, (err) => {
        if (err) console.log("Image deletion error:", err);
        else console.log("Image deleted successfully.");
      });
    }

    const user = await userModel.findById(userId).select("-password");
    if (!user) {
      imageDeletion(req.file?.path);
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const {
      donorType,
      fullName,
      companyName,
      selectedMaterials,
      contactName,
      address,
      receiptType,
    } = req.body;

    const profileImage = req.file ? req.file.filename : null;

    if (!donorType) {
      imageDeletion(req.file?.path);
      return res
        .status(400)
        .json({ success: false, message: "Donor type is required." });
    }

    const validDonorTypes = [
      "Contractor",
      "Homeowner",
      "Community",
      "Organization",
    ];
    if (!validDonorTypes.includes(donorType)) {
      imageDeletion(req.file?.path);
      return res
        .status(400)
        .json({ success: false, message: "Invalid donor type." });
    }

    if (!fullName) {
      imageDeletion(req.file?.path);
      return res
        .status(400)
        .json({ success: false, message: "Full name is required." });
    }

    if (!profileImage) {
      imageDeletion(req.file?.path);
      return res
        .status(400)
        .json({ success: false, message: "Profile image is required." });
    }

    // 🧱 Donor-specific logic
    if (user.userType === "donor") {
      if (!companyName) {
        imageDeletion(req.file?.path);
        return res
          .status(400)
          .json({ success: false, message: "Company name is required." });
      }

      if (
        selectedMaterials === undefined ||
        selectedMaterials === null ||
        selectedMaterials === "" ||
        (Array.isArray(selectedMaterials) && selectedMaterials.length === 0)
      ) {
        imageDeletion(req.file?.path);
        return res.status(400).json({
          success: false,
          message: "Selected materials are required.",
        });
      }

      // ✅ Parse and validate selected materials
      let materialsArray;
      try {
        if (typeof selectedMaterials === "string") {
          materialsArray = JSON.parse(selectedMaterials);
        } else {
          materialsArray = selectedMaterials;
        }
      } catch (err) {
        materialsArray = [selectedMaterials];
      }

      if (!Array.isArray(materialsArray)) {
        materialsArray = [materialsArray];
      }

      // Validate format of ObjectIds
      materialsArray = materialsArray.filter(
        (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)
      );

      const foundMaterials = await materialModel.find({
        _id: { $in: materialsArray },
      });

      if (foundMaterials.length !== materialsArray.length) {
        imageDeletion(req.file?.path);
        return res.status(400).json({
          success: false,
          message: "One or more selected materials are invalid.",
        });
      }

      const donorProfile = await userModel
        .findByIdAndUpdate(
          userId,
          {
            donorType,
            fullName,
            companyName,
            selectedMaterials: materialsArray,
            profileImage,
          },
          { new: true }
        )
        .populate("selectedMaterials")
        .select("-password");

      return res.status(201).json({
        message: "Profile created successfully.",
        success: true,
        data: {
          ...donorProfile.toObject(),
          profileImage: `${req.protocol}://${req.get(
            "host"
          )}/uploads/profile/${profileImage}`,
        },
      });
    }

    // 📦 Receiver-specific logic
    if (user.userType === "receiver") {
      if (!contactName) {
        imageDeletion(req.file?.path);
        return res
          .status(400)
          .json({ success: false, message: "Contact name is required." });
      }

      if (!address) {
        imageDeletion(req.file?.path);
        return res
          .status(400)
          .json({ success: false, message: "Address is required." });
      }

      if (!receiptType) {
        imageDeletion(req.file?.path);
        return res
          .status(400)
          .json({ success: false, message: "Receipt type is required." });
      }

      const validReceiptTypes = [
        "Indiviadual Homeowner",
        "Community Organization",
        "Contractor",
      ];
      if (!validReceiptTypes.includes(receiptType)) {
        imageDeletion(req.file?.path);
        return res.status(400).json({
          success: false,
          message: "Invalid receipt type.",
        });
      }

      const receiverProfile = await userModel
        .findByIdAndUpdate(
          userId,
          {
            donorType,
            fullName,
            contactName,
            address,
            receiptType,
            profileImage,
          },
          { new: true }
        )
        .select("-password");

      return res.status(201).json({
        message: "Profile created successfully.",
        success: true,
        data: {
          ...receiverProfile.toObject(),
          profileImage: `${req.protocol}://${req.get(
            "host"
          )}/uploads/profile/${profileImage}`,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid user type.",
    });
  } catch (error) {
    if (req.file) {
      fs.unlink(req.file.path, (error) => {
        if (error) {
          console.log("Image deletion: ", error);
        }
        console.log("Image deleted successfully.");
      });
    }
    console.error("Profile Creation Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const id = req.user;
    const user = await userModel
      .findById(id)
      .select("-password")
      .populate("selectedMaterials");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const buildProfileImg = (img) => {
      if (!img) return `${baseUrl}/uploads/profile/default.png`;
      if (typeof img === "string" && img.startsWith("http")) return img;
      return `${baseUrl}/uploads/profile/${img}`;
    };

    if (user.userType === "donor") {
      return res.status(200).json({
        success: true,
        message: "Donor profile fetched successfully.",
        data: {
          ...user.toObject(),
          profileImage: buildProfileImg(user.profileImage),
        },
      });
    }

    if (user.userType === "receiver") {
      return res.status(200).json({
        success: true,
        message: "Receiver profile fetched successfully.",
        data: {
          ...user.toObject(),
          profileImage: buildProfileImg(user.profileImage),
        },
      });
    }
  } catch (error) {
    console.error("Profile Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const id = req.user;
    const user = await userModel.findById(id).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    let {
      fullName,
      companyName,
      selectedMaterials,
      contactName,
      address,
      receiptType,
    } = req.body;

    let profileImage = user.profileImage;

    // ✅ Handle profile image
    if (req.file) {
      if (profileImage) {
        const oldImagePath = path.join(
          __dirname,
          "../uploads/profile",
          profileImage
        );
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      profileImage = req.file.filename;
    }

    // ✅ Normalize and validate selectedMaterials
    if (selectedMaterials) {
      try {
        if (typeof selectedMaterials === "string") {
          selectedMaterials = JSON.parse(selectedMaterials);
        }
      } catch (err) {
        selectedMaterials = [selectedMaterials];
      }

      if (!Array.isArray(selectedMaterials)) {
        selectedMaterials = [selectedMaterials];
      }

      selectedMaterials = selectedMaterials.filter(
        (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)
      );

      // ✅ Check all material IDs exist
      const materialsInDb = await materialModel.find({
        _id: { $in: selectedMaterials },
      });

      if (materialsInDb.length !== selectedMaterials.length) {
        return res.status(400).json({
          success: false,
          message: "One or more selected materials are invalid.",
        });
      }
    }

    const useOldIfEmpty = (newVal, oldVal) =>
      newVal === undefined || newVal === null || newVal === ""
        ? oldVal
        : newVal;

    // ✅ Shared update data
    let updateData = {
      fullName: useOldIfEmpty(fullName, user.fullName),
      profileImage: profileImage || user.profileImage,
    };

    if (user.userType === "donor") {
      updateData.companyName = useOldIfEmpty(companyName, user.companyName);
      updateData.selectedMaterials = useOldIfEmpty(
        selectedMaterials,
        user.selectedMaterials
      );
    }

    if (user.userType === "receiver") {
      updateData.contactName = useOldIfEmpty(contactName, user.contactName);
      updateData.address = useOldIfEmpty(address, user.address);
      updateData.receiptType = useOldIfEmpty(receiptType, user.receiptType);
    }

    const updatedProfile = await userModel
      .findByIdAndUpdate(user.id, updateData, { new: true })
      .select("-password")
      .populate("donations")
      .populate("favorites")
      .populate("selectedMaterials");

    return res.status(200).json({
      success: true,
      message: `${user.userType} profile updated successfully.`,
      data: {
        ...updatedProfile.toObject(),
        profileImage: updatedProfile.profileImage
          ? updatedProfile.profileImage.startsWith("http")
            ? updatedProfile.profileImage
            : `${req.protocol}://${req.get("host")}/uploads/profile/${
                updatedProfile.profileImage
              }`
          : `${req.protocol}://${req.get("host")}/uploads/profile/default.png`,
      },
    });
  } catch (error) {
    console.error("Profile Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const id = req.user;
    const user = await userModel.findById(id).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    if (user.profileImage) {
      const imagePath = path.resolve("uploads/profile", user.profileImage);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    if (user.userType === "donor") {
      const deleteUser = await userModel
        .findByIdAndUpdate(
          user.id,
          {
            profileImage: "",
            donorType: "",
            fullName: "",
            companyName: "",
            selectedMaterials: [],
          },
          { new: true }
        )
        .select("-password");

      return res.status(200).json({
        success: true,
        message: "Donor profile deleted successfully.",
        data: deleteUser,
      });
    }

    if (user.userType === "receiver") {
      const deleteUser = await userModel
        .findByIdAndUpdate(
          user.id,
          {
            profileImage: "",
            donorType: "",
            fullName: "",
            address: "",
            contactName: "",
            receiptType: "",
          },
          { new: true }
        )
        .select("-password");

      return res.status(200).json({
        success: true,
        message: "Receiver profile deleted successfully.",
        data: deleteUser,
      });
    }
  } catch (error) {
    console.error("Profile Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

exports.update_password = async (req, res) => {
  try {
    const userId = req.user;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Old password is required." });
    }

    if (!newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "New password is required." });
    }

    if (!confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Confirm password is required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "New passwords do not match." });
    }

    let userData = await userModel.findById(userId);

    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(oldPassword, userData.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Old password is incorrect." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await userModel.findByIdAndUpdate(userId, {
      password: hashedNewPassword,
    });

    userData = await userModel.findById(userId).select("-password");

    const imageUrl = userData.profileImage
      ? `${req.protocol}://${req.get("host")}/uploads/profile/${
          userData.profileImage
        }`
      : `${req.protocol}://${req.get("host")}/uploads/profile/default.png`;

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
      data: {
        ...userData.toObject(),
        profileImage: imageUrl,
      },
    });
  } catch (err) {
    console.error("Update password error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    let userId = req.user;

    const userData = await userModel.findById(userId).select("-password");
    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not Found." });
    }

    userData.isDeleted = true;
    userData.deletedAt = Date.now();
    await userData.save();

    return res.status(200).json({
      success: true,
      message: "User Deleted Successfully",
      data: {
        ...userData.toObject(),
        profileImage: userData.profileImage
          ? `${req.protocol}://${req.get("host")}/uploads/profile/${
              userData.profileImage
            }`
          : `${req.protocol}://${req.get("host")}/uploads/profile/default.png`,
      },
    });
  } catch (error) {
    console.log("Delet account error", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

//LOGIN WITH GOOGLE API
exports.googleMobileLogin = async (req, res) => {
  const { id_token, deviceId } = req.body;

  try {
    // 1. Verify token from mobile
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, sub: googleId, name, picture } = payload;

    let user = await userModel.findOne({ email });

    // 2. If user doesn't exist, create new one
    if (!user) {
      user = await userModel.create({
        email,
        fullName: name,
        googleId,
        profileImage: picture || "",
        userType: "donor",
        isDeleted: false,
        deviceId: deviceId ? [deviceId] : [],
      });
    } else {
      // 3. If user exists, add deviceId if not already in list
      if (deviceId && !user.deviceId.includes(deviceId)) {
        user.deviceId.push(deviceId);
        await user.save();
      }
    }

    // 4. Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 5. Respond to mobile app
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        userType: user.userType,
        profileImage: user.profileImage || null,
        isGoogleUser: true,
      },
    });
  } catch (err) {
    console.error("Google Mobile Login Error:", err);
    res.status(401).json({ success: false, message: "Invalid ID token" });
  }
};

//LOGIN WITH FACEBOOK API
exports.generateToken = (req, res) => {
  const user = req.user;
  const payload = {
    id: user._id,
    email: user.email,
    name: user.name,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ success: true, token });
};

//THIS WHOLE CODE WAS FOR SEND EMAIL TO IMPLEMENT RESET PASSWORD

//For sending mail code
const sendEmailPassword = async (email, token) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Password Reset",
      html: `
  <div style="max-width:600px; margin:20px auto; padding:30px; font-family:Arial,sans-serif; border:1px solid #ddd; border-radius:8px; background-color:#f9f9f9;">
    <h2 style="text-align:center; color:#333;">Reset Your Password</h2>
    <p style="font-size:16px; color:#555;">
      You requested a password reset. Click the button below to create a new password.
    </p>
    <div style="text-align:center; margin:30px 0;">
      <a href="http://localhost:3000/api/user/reset-password?token=${token}" 
         style="background-color:#007bff; color:#fff; padding:12px 25px; border-radius:5px; text-decoration:none; font-weight:bold;">
        Reset Password
      </a>
    </div>
    <p style="font-size:14px; color:#777;">
      If you didn't request this, you can safely ignore this email. This link will expire soon.
    </p>
    <p style="font-size:12px; color:#aaa; text-align:center; margin-top:40px;">
      &copy; ${new Date().getFullYear()} YourAppName. All rights reserved.
    </p>
  </div>
`,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log("Email snd error.", error);
      } else {
        console.log("Mail has been Sent:-", info.response);
      }
    });
  } catch (error) {
    console.log("SendEmailPassword", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

//Getting email of the user and send link to reset the link
exports.reset_Password = async (req, res) => {
  try {
    const { email } = req.body;
    console.log(req.body);

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const isEmailExist = await userModel.findOne({ email: email }); // 🔧 FIXED

    if (isEmailExist) {
      const randomString = randomstring.generate();

      await userModel.updateOne(
        { email: email }, // 🔧 FIXED
        { $set: { token: randomString } }
      );

      sendEmailPassword(isEmailExist.email, randomString);

      return res.status(200).json({
        success: true,
        message: "Please check your Email to reset your password.",
      });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "Email does not exist." });
    }
  } catch (error) {
    console.error("Reset Password error", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error." });
  }
};

//Get new password and reset the password
exports.resetPassword = async (req, res) => {
  try {
    const token = req.query.token;

    const tokenData = await userModel.findOne({ token });

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        message: "This link has expired or is invalid.",
      });
    }

    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Both password and confirm password are required.",
      });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match." });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const updatedUser = await userModel
      .findByIdAndUpdate(
        tokenData._id,
        {
          password: hashedPassword,
          token: "",
        },
        { new: true }
      )
      .select("password");

    return res.status(200).json({
      success: true,
      message: "Password reset successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

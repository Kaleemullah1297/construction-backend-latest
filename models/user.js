const mongoose = require("mongoose");

const userSchema = mongoose.Schema(
  {
    deletedAt: { type: Date },
    contactUsId: [{ type: mongoose.Schema.Types.ObjectId, ref: "ContactUs" }],
    deviceId: {
      type: [String],
      default: [],
    },
    isDeleted: { type: Boolean, default: false },
    facebookId: { type: String },
    googleId: { type: String },
    userType: {
      type: String,
      enum: ["donor", "receiver"],
      default: "donor",
    },
    email: {
      type: String,
      unique: true,
    },
    password: {
      type: String,
    },
    donorType: {
      type: String,
      enum: ["Contractor", "Homeowner", "Community", "Organization"],
    },
    fullName: { type: String },
    oragnizationName: { type: String },
    companyName: { type: String },
    contactName: { type: String },
    address: { type: String },
    profileImage: { type: String },
    receiptType: {
      type: String,
      enum: ["Indiviadual Homeowner", " Community Organization", "Contractor"],
    },
    selectedMaterials: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Material",
        default: "",
      },
    ],
    donations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Donation",
      },
    ],
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Donation",
      },
    ],
    token: { type: String, default: "" },
    isOnline: {
      type: String,
      default: "0",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const donationSchema = mongoose.Schema(
  {
    //parcelDoNotReceiveByReceiver: { type: Boolean, default: false },
    deliveryType: { type: String, enum: ["delivery", "pickup"] },
    delivery: { type: Boolean, default: false },
    pickup: { type: Boolean, default: false },
    donorCompleted: { type: Boolean, default: false },
    receiverCompleted: { type: Boolean, default: false },
    canceledById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    scheduleById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    totalPrice: { type: Number },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      required: true,
    },
    materialType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      default: null,
      required: true,
    },
    materialId: { type: String, required: true, default: null },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    totalQuantity: { type: Number, default: 0 },
    leftQuantity: { type: Number, default: 0 },
    scheduledQuantity: { type: Number, default: 0 },
    pickupAddress: { type: String, default: "" },
    deliveryAddress: { type: String, default: "" },
    description: { type: String },
    scheduleDate: {
      type: String,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
      default: "",
    },
    scheduleTime: {
      type: String,
      match: [
        /^([01]\d|2[0-3]):([0-5]\d)$/,
        "Time must be in HH:MM (24-hour) format",
      ],
      default: "",
    },
    scheduleComments: { type: String, default: "" },
    cancelComments: { type: String, default: "" },
    images: [
      {
        id: { type: String, required: true },
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],

    donationStatus: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Donation", donationSchema);

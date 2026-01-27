const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinaryConfig"); // use your config file

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "uploads";

    if (req.customUploadType === "profile") {
      folder = "profile";
    } else if (req.customUploadType === "donation") {
      folder = "donations";
    }

    return {
      folder,
      resource_type: "image",
      format: file.mimetype.split("/")[1], // jpg, png, etc
      public_id: `${Date.now()}`, // clean safe id
    };
  },
});

const upload = multer({ storage });

const uploadProfileImage = [
  (req, res, next) => {
    req.customUploadType = "profile";
    next();
  },
  upload.single("profileImage"),
];

const uploadDonationImages = [
  (req, res, next) => {
    req.customUploadType = "donation";
    next();
  },
  upload.array("images", 3),
];

module.exports = {
  uploadProfileImage,
  uploadDonationImages,
};

cloudinary.api.ping((err, result) => console.log(err || result));
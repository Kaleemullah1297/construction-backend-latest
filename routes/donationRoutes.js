const express = require("express");
const router = express.Router();
const { uploadDonationImages } = require("../middlewares/uploads");
const donationController = require("../controllers/donationController");
const { isLoggedIn } = require("../middlewares/isLoggedIn");

router.post(
  "/add",
  isLoggedIn,
  uploadDonationImages,
  donationController.addDonation
);

router.get("/list", isLoggedIn, donationController.getDonation);

router.put(
  "/:id",
  isLoggedIn,
  uploadDonationImages,
  donationController.editDonation
);

router.delete("/:id", isLoggedIn, donationController.removeDonation);

//THIS IS FOR SCHEDULE ID JUST THE RECEIVER CAN DO.

router.put("/schedule/:id", isLoggedIn, donationController.scheduleDonation);

//THIS IS FOR TRACKING ALL THE DONATIONS

router.get("/track", isLoggedIn, donationController.trackDonation);

//THIS IS FOR MONTHLY REPORT OF A USER

router.get("/monthlyreport", isLoggedIn, donationController.monthlyReport);

//THESE ARE THE ROUTES FOR FAVORITES

router.post("/favorite/add", isLoggedIn, donationController.addFavorites);

router.get("/favorite/list", isLoggedIn, donationController.getAllFavorites);

router.delete(
  "/favorite/:id",
  isLoggedIn,
  donationController.removeFromFavorites
);

module.exports = router;

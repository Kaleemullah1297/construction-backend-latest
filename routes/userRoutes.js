const express = require("express");
const router = express.Router();
const passport = require("passport");
const { uploadProfileImage } = require("../middlewares/uploads");
const userController = require("../controllers/userController");
const { isLoggedIn } = require("../middlewares/isLoggedIn");

router.post("/register", userController.registerUser);
router.post("/login", userController.loginUser);
router.put(
  "/profile/add",
  isLoggedIn,
  uploadProfileImage,
  userController.createProfile
);
router.get("/profile", isLoggedIn, userController.getProfile);
router.put(
  "/profile/update",
  isLoggedIn,
  uploadProfileImage,
  userController.updateProfile
);
router.delete("/profile/delete", isLoggedIn, userController.deleteProfile);
router.post("/reset-password", userController.reset_Password);
router.get("/reset-password", userController.resetPassword);

//LOGIN WITH GOOGLE

router.post("/google-login", userController.googleMobileLogin);

//FOR LOGIN WITH FACEBOOK

// Redirect user to Facebook for authentication
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { session: false }),
  (req, res) => {
    const { token, user } = req.user;
    res.status(200).json({
      success: true,
      token,
      user,
    });
  }
);

router.post("/updatepassword", isLoggedIn, userController.update_password);

router.delete("/deleteaccount", isLoggedIn, userController.deleteAccount);

module.exports = router;

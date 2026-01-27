const express = require("express");
const router = express.Router();
const contactusController = require("../controllers/contactusController");
const { isLoggedIn } = require("../middlewares/isLoggedIn");

router.post("/add", isLoggedIn, contactusController.Addcontact_us);

router.get("/list", isLoggedIn, contactusController.getcontact_us);

module.exports = router;

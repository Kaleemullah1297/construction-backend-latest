const contacusModel = require("../models/contactus");
const userModel = require("../models/user");

exports.Addcontact_us = async (req, res) => {
  try {
    const userId = req.user;
    const { fullName, email, message } = req.body;
    console.log(req.body);

    const userData = await userModel.findById(userId);
    if (!userData) {
      return res
        .status(400)
        .json({ success: false, message: "User Not Found." });
    }

    if (!fullName || !email || !message) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const newContactUs = await contacusModel.create({
      fullName,
      email,
      message,
    });

    userData.contactUsId.push(newContactUs._id);
    await userData.save();

    return res.status(200).json({
      success: true,
      message: "Contact us created successfully ",
      data: newContactUs,
    });
  } catch (err) {
    console.log("Add Contact Us error", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getcontact_us = async (req, res) => {
  try {
    const userId = req.user;

    const userData = await userModel
      .findById(userId)
      .select("-password")
      //.populate("donations")
      //.populate("selectedMaterials")
      .populate("contactUsId");
    if (!userData) {
      return res
        .status(400)
        .json({ success: false, message: "User Not Found." });
    }

    return res.status(200).json({
      success: true,
      message: "Contact us Fetched successfully ",
      data: userData,
    });
  } catch (err) {
    console.error("Get All contact us", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

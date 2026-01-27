const mongoose = require("mongoose");

const contactusSchema = mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
});

module.exports = mongoose.model("ContactUs", contactusSchema);

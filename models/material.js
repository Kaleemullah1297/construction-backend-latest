const mongoose = require("mongoose");

const materialSchema = mongoose.Schema(
  {
    materialId: { type: String, required: true, unique: true },
    material: { type: String, required: true },
    unit: { type: String, required: true },
    value: { type: Number, required: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Material", materialSchema);

const materialModel = require("../models/material");
const { customAlphabet } = require("nanoid");
const nanoid = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  6
);

exports.addMaterial = async (req, res) => {
  try {
    let { materialId, material, unit, value } = req.body;
    if (!material && !unit && !value) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }
    if (!material) {
      return res
        .status(400)
        .json({ success: false, message: "Material is required." });
    }
    if (!unit) {
      return res
        .status(400)
        .json({ success: false, message: "Unit is required." });
    }
    if (!value) {
      return res
        .status(400)
        .json({ success: false, message: "Value is required." });
    }

    const materialid = nanoid();
    const checkMaterialIdDb = await materialModel.findOne({
      materialId: materialid,
    });

    if (checkMaterialIdDb) {
      return res
        .status(400)
        .json({ success: false, message: "MaterialId already exist" });
    }

    const newMaterial = await materialModel.create({
      materialId: materialid,
      material,
      unit,
      value,
    });

    return res.status(200).json({
      success: true,
      message: "Material added Successfully.",
      data: newMaterial,
    });
  } catch (error) {
    console.error("Add Material Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

exports.getMaterials = async (req, res) => {
  try {
    const materials = await materialModel.find();
    if (!materials || materials.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No materials found." });
    }

    return res.status(200).json({
      success: true,
      message: "Material list retrieved successfully.",
      data: materials,
    });
  } catch (error) {
    console.error("Material List Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

exports.updateMaterial = async (req, res) => {
  try {
    const id = req.params.id;
    let { material, unit, value } = req.body;

    if (!material && !unit && !value) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }
    if (!material) {
      return res
        .status(400)
        .json({ success: false, message: "Material is required." });
    }
    if (!unit) {
      return res
        .status(400)
        .json({ success: false, message: "Unit is required." });
    }
    if (!value) {
      return res
        .status(400)
        .json({ success: false, message: "Value is required." });
    }

    const updatedMaterial = await materialModel.findByIdAndUpdate(
      id,
      { material, unit, value },
      { new: true }
    );

    if (!updatedMaterial) {
      return res
        .status(404)
        .json({ success: false, message: "Material Not Found." });
    }

    res.status(200).json({
      success: true,
      message: "Data updated successfully.",
      data: updatedMaterial,
    });
  } catch (error) {
    console.error("Material Edit Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteMaterial = async (req, res) => {
  try {
    const id = req.params.id;
    const existedMaterial = await materialModel.findById(id);

    if (!existedMaterial) {
      return res
        .status(404)
        .json({ success: false, message: "Material Not found" });
    }

    const deletedMaterial = await materialModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Material deleted Successfully.",
      data: deletedMaterial,
    });
  } catch (error) {
    console.error("Material Deleted", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

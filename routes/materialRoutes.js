const express = require("express");
const router = express.Router();
const materialController = require("../controllers/materialController");

router.post("/add", materialController.addMaterial);
router.get("/list", materialController.getMaterials);
router.put("/:id", materialController.updateMaterial);
router.delete("/:id", materialController.deleteMaterial);

module.exports = router;

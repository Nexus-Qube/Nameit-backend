const express = require("express");
const router = express.Router();
const { getTopicById } = require("../controllers/topicsController");

// GET /topics/:id
router.get("/:id", getTopicById);

module.exports = router;

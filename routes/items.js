const express = require("express");
const router = express.Router();
const { getItems, getItemsByTopic } = require("../controllers/itemsController");

// GET /items (with optional query params)
router.get("/", getItems);

// GET /items/:topicId (fetch items of a topic)
router.get("/:topicId", getItemsByTopic);

module.exports = router;
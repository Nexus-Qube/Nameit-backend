// backend/routes/lobbies.js
const express = require('express');
const router = express.Router();
const {
  createLobby,
  getLobbyByCode,
  getLobbiesByTopic,
  joinLobby,
  deleteLobby,
  getAllLobbies, // optional if you implement a get all
} = require('../controllers/lobbiesController');

// Join a lobby
router.post('/join/:id', joinLobby); // id is lobby id

// Create a new lobby
router.post('/create', createLobby);

// Get all lobbies for a topic
router.get('/topic/:topicId', getLobbiesByTopic);

// Get lobby by code
router.get('/code/:code', getLobbyByCode);

// Delete lobby by ID
router.delete('/:id', deleteLobby);

// Optional: Get all lobbies (regardless of topic)
router.get('/', getAllLobbies);

module.exports = router;

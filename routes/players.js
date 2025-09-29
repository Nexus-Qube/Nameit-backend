const express = require('express');
const router = express.Router();
const { joinLobby, setReady } = require('../controllers/playersController');

router.post('/join', joinLobby);        // Join lobby
router.post('/ready', setReady);        // Set player ready

module.exports = router;

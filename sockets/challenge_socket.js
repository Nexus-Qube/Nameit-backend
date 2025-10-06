const { lobbies } = require("./waitingroom_socket"); // shared reference

function initChallengeSocket(io) {
  io.on("connection", (socket) => {
    console.log(`🟢 [Challenge Socket Created] ID: ${socket.id}`);

    // --- Join challenge game ---
    socket.on("joinGame", ({ lobbyId, playerId, playerName }) => {
      const lobby = lobbies[lobbyId];
      if (!lobby) {
        console.log(`⚠️ Tried to join challenge lobby ${lobbyId}, but it doesn't exist`);
        return;
      }

      socket.join(lobbyId);

      // Track socketId and update name if reconnect
      let player = lobby.players.find((p) => p.id === playerId);
      if (player) {
        console.log(`♻️ Updating socket for player ${playerId} in lobby ${lobbyId}`);
        player.socketId = socket.id;
        if (playerName) player.name = playerName;
      } else {
        player = { id: playerId, socketId: socket.id, name: playerName || "Unknown" };
        lobby.players.push(player);
        console.log(`➕ Added new player ${playerId} (${player.name}) to lobby ${lobbyId}`);
      }

      // Send current solved items to this player
      socket.emit("initItems", { solvedItems: lobby.solvedItems || [] });

      console.log(`🎮 Player ${playerId} (${player.name}) joined challenge lobby ${lobbyId}`);
    });

    // --- Handle button press ---
    socket.on("buttonPress", ({ lobbyId, playerId, correct, timeout, itemId }) => {
      const lobby = lobbies[lobbyId];
      if (!lobby) return;

      if (Number(playerId) !== Number(lobby.currentTurn)) {
        console.log(`⚠️ buttonPress ignored, not player ${playerId}'s turn`);
        return;
      }

      console.log(`🖲️ Button pressed by player ${playerId}, correct: ${correct}, timeout: ${timeout || false}, itemId: ${itemId || "N/A"}`);

      if (correct && itemId) {
        if (!lobby.solvedItems) lobby.solvedItems = [];
        if (!lobby.solvedItems.includes(itemId)) {
          lobby.solvedItems.push(itemId);
          io.to(lobbyId).emit("itemSolved", { itemId });
          console.log(`✅ Item ${itemId} solved in lobby ${lobbyId}`);
        }
      }

      if (!correct) {
        if (timeout) {
          console.log(`⏰ Timeout for player ${playerId}, advancing turn`);
          removePlayerFromGame(lobbyId, playerId);
        } else {
          console.log(`❌ Wrong answer by player ${playerId}, removing player`);
          removePlayerFromGame(lobbyId, playerId, socket);
        }
        return;
      }

      advanceTurn(lobbyId);
    });

    // --- Leave game manually ---
    socket.on("leaveGame", ({ lobbyId, playerId }) => {
      console.log(`📤 leaveGame from player ${playerId} in lobby ${lobbyId}`);
      removePlayerFromGame(lobbyId, playerId, socket);
    });

    // --- Handle disconnect ---
    socket.on("disconnect", () => {
      console.log(`🔴 [Challenge Socket Disconnected] ID: ${socket.id}`);
      for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        const player = lobby.players.find((p) => p.socketId === socket.id);
        if (player) removePlayerFromGame(lobbyId, player.id);
      }
    });

    // --- Helpers ---
    function advanceTurn(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby || lobby.players.length === 0) return;

  // Find current player index
  let currentIndex = lobby.players.findIndex(p => p.id === lobby.currentTurn);

  // Move to next player
  currentIndex = (currentIndex + 1) % lobby.players.length;

  lobby.currentTurnIndex = currentIndex;
  lobby.currentTurn = lobby.players[currentIndex].id;

  io.to(lobbyId).emit("turnChanged", {
    currentTurnId: lobby.currentTurn,
    currentTurnName: lobby.players[currentIndex].name,
    timeLeft: lobby.turnTime,
  });

  console.log(`🔄 Turn advanced in lobby ${lobbyId}, player ${lobby.currentTurn}`);
}

    function removePlayerFromGame(lobbyId, playerId, socketInstance = null) {
      const lobby = lobbies[lobbyId];
      if (!lobby) return;

      const index = lobby.players.findIndex((p) => p.id === playerId);
      if (index === -1) return;

      const leavingPlayer = lobby.players.splice(index, 1)[0];
      console.log(`❌ Player ${playerId} (${leavingPlayer.name}) left game in lobby ${lobbyId}`);

      io.to(lobbyId).emit("playerLeft", { playerId, playerName: leavingPlayer.name });

      if (lobby.players.length === 1) {
        console.log(`🏁 Only one player left in lobby ${lobbyId}, declaring winner`);
        io.to(lobbyId).emit("gameOver", { winner: lobby.players[0] });
        if (lobby.timer) clearInterval(lobby.timer);
        delete lobbies[lobbyId];
      } else if (lobby.players.length === 0) {
        if (lobby.timer) clearInterval(lobby.timer);
        delete lobbies[lobbyId];
      } else if (lobby.currentTurn === leavingPlayer.id) {
        advanceTurn(lobbyId);
      }

      if (socketInstance) socketInstance.leave(lobbyId);
    }
  });
}

module.exports = { initChallengeSocket };

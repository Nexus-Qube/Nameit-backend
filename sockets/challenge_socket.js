const { lobbies } = require("./waitingroom_socket"); // shared reference

function initChallengeSocket(io) {
  io.on("connection", (socket) => {
    console.log(`🟢 [Challenge Socket Created] ID: ${socket.id}`);

    // --- Join challenge game ---
    socket.on("joinGame", ({ lobbyId, playerId }) => {
      const lobby = lobbies[lobbyId];
      if (!lobby) {
        console.log(`⚠️ Tried to join challenge lobby ${lobbyId}, but it doesn't exist`);
        return;
      }

      socket.join(lobbyId);

      // Track socketId and avoid duplicates
      let player = lobby.players.find((p) => p.id === playerId);
      if (player) {
        console.log(`♻️ Updating socket for player ${playerId} in lobby ${lobbyId}`);
        player.socketId = socket.id;
      } else {
        player = { id: playerId, socketId: socket.id, name: "Unknown" };
        lobby.players.push(player);
        console.log(`➕ Added new player ${playerId} to lobby ${lobbyId}`);
      }

      console.log(
        `🎮 Player ${playerId} (${player.name}) joined challenge lobby ${lobbyId} (socket ${socket.id})`
      );

      // Send current solved items to this player
      socket.emit("initItems", { solvedItems: lobby.solvedItems || [] });
    });

    // --- Handle button press ---
    socket.on("buttonPress", ({ lobbyId, playerId, correct, timeout, itemId }) => {
      const lobby = lobbies[lobbyId];
      if (!lobby) {
        console.log(`⚠️ buttonPress ignored, lobby ${lobbyId} not found`);
        return;
      }
      if (Number(playerId) !== Number(lobby.currentTurn)) {
        console.log(
          `⚠️ buttonPress ignored, not player ${playerId}'s turn (current turn: ${lobby.currentTurn})`
        );
        return;
      }

      console.log(
        `🖲️ Button pressed by player ${playerId} in lobby ${lobbyId}, correct: ${correct}, timeout: ${
          timeout || false
        }, itemId: ${itemId || "N/A"}`
      );

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
          console.log(`⏰ Timeout for player ${playerId} in lobby ${lobbyId}, advancing turn`);
          advanceTurn(lobbyId);
        } else {
          console.log(`❌ Wrong answer by player ${playerId} in lobby ${lobbyId}, removing player`);
          removePlayerFromGame(lobbyId, playerId);
        }
        return;
      }

      console.log(`➡️ Correct answer by player ${playerId}, advancing turn in lobby ${lobbyId}`);
      advanceTurn(lobbyId);
    });

    // --- Leave game manually ---
    socket.on("leaveGame", ({ lobbyId, playerId }) => {
      console.log(`📤 leaveGame received from player ${playerId} in lobby ${lobbyId}`);
      removePlayerFromGame(lobbyId, playerId, socket);
    });

    // --- Handle socket disconnect ---
    socket.on("disconnect", () => {
      console.log(`🔴 [Challenge Socket Disconnected] ID: ${socket.id}`);
      for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        const player = lobby.players.find((p) => p.socketId === socket.id);
        if (player) {
          console.log(`📤 Disconnect cleanup: removing player ${player.id} from lobby ${lobbyId}`);
          removePlayerFromGame(lobbyId, player.id);
        }
      }
    });

    // --- Helper: advance turn ---
    function advanceTurn(lobbyId) {
      const lobby = lobbies[lobbyId];
      if (!lobby) {
        console.log(`⚠️ advanceTurn called but lobby ${lobbyId} not found`);
        return;
      }
      if (lobby.players.length === 0) {
        console.log(`⚠️ advanceTurn aborted, no players in lobby ${lobbyId}`);
        return;
      }

      lobby.currentTurnIndex = (lobby.currentTurnIndex + 1) % lobby.players.length;
      lobby.currentTurn = lobby.players[lobby.currentTurnIndex].id;

      console.log(
        `🔄 Turn advanced in lobby ${lobbyId}, new turn: Player ${lobby.currentTurn} (${lobby.players[lobby.currentTurnIndex].name})`
      );

      io.to(lobbyId).emit("turnChanged", {
        currentTurnId: lobby.currentTurn,
        currentTurnName: lobby.players[lobby.currentTurnIndex].name,
        timeLeft: lobby.turnTime,
      });
    }

    // --- Helper: remove player ---
    function removePlayerFromGame(lobbyId, playerId, socketInstance = null) {
      const lobby = lobbies[lobbyId];
      if (!lobby) {
        console.log(
          `⚠️ removePlayerFromGame called for player ${playerId}, but lobby ${lobbyId} not found`
        );
        return;
      }

      const index = lobby.players.findIndex((p) => p.id === playerId);
      if (index === -1) {
        console.log(
          `⚠️ removePlayerFromGame: player ${playerId} not found in lobby ${lobbyId} players list`
        );
        return;
      }

      const leavingPlayer = lobby.players.splice(index, 1)[0];
      console.log(`❌ Player ${playerId} (${leavingPlayer.name}) left game in lobby ${lobbyId}`);

      io.to(lobbyId).emit("playerLeft", {
        playerId,
        playerName: leavingPlayer.name,
      });

      if (lobby.players.length === 1) {
        console.log(`🏁 Only one player left in lobby ${lobbyId}, declaring winner`);
        io.to(lobbyId).emit("gameOver", { winner: lobby.players[0] });
        if (lobby.timer) clearInterval(lobby.timer);
        delete lobbies[lobbyId];
        console.log(`🗑️ Lobby ${lobbyId} deleted after gameOver`);
      } else if (lobby.players.length === 0) {
        console.log(`🗑️ No players left in lobby ${lobbyId}, deleting lobby`);
        if (lobby.timer) clearInterval(lobby.timer);
        delete lobbies[lobbyId];
      } else if (lobby.currentTurn === leavingPlayer.id) {
        console.log(
          `🔄 Player ${playerId} was current turn in lobby ${lobbyId}, advancing to next player`
        );
        advanceTurn(lobbyId);
      }

      if (socketInstance) {
        console.log(`👋 Socket ${socketInstance.id} leaving room ${lobbyId}`);
        socketInstance.leave(lobbyId);
      }
    }
  });
}

module.exports = { initChallengeSocket };

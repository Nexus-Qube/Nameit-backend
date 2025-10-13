const supabase = require("../supabase");
const CacheService = require("../src/service/CacheService");

function initGameSocket(io) {
  io.on("connection", (socket) => {
    console.log(`🟢 [Game Socket Created] ID: ${socket.id}`);

    // Helper functions
    async function getLobby(lobbyId) {
      return await CacheService.get(`lobby:${lobbyId}`);
    }

    async function saveLobby(lobbyId, lobbyData) {
      await CacheService.set(`lobby:${lobbyId}`, lobbyData, 3600);
    }

    async function deleteLobby(lobbyId) {
      await CacheService.del(`lobby:${lobbyId}`);
    }

    async function emitLobbyUpdate(lobbyId) {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      console.log(
        `📊 [Lobby Update] Lobby ${lobbyId}, Players: ${lobby.players
          .map((p) => `${p.id}-${p.name}`)
          .join(", ")}`
      );
      io.to(`waiting_${lobbyId}`).emit("lobbyUpdate", lobby);
    }

    // --- WAITING ROOM EVENTS ---

    // Player joins a lobby (waiting room)
    socket.on("joinWaitingRoom", async ({ lobbyId, playerId, name }) => {
      socket.join(`waiting_${lobbyId}`);
      socket.leave(`game_${lobbyId}`); // Leave game room if coming back from game
      
      console.log(`➡️ Player ${playerId} (${name}) joined waiting room ${lobbyId}`);

      let lobby = await getLobby(lobbyId);

      if (!lobby) {
        try {
          const { data: dbLobby } = await supabase
            .from("lobbies")
            .select("*")
            .eq("id", lobbyId)
            .single();

          if (!dbLobby) return;

          lobby = {
            id: dbLobby.id,
            code: dbLobby.code,
            name: dbLobby.name,
            players: [],
            currentTurnIndex: 0,
            currentTurn: null,
            timer: null,
            timeLeft: 10,
            turnTime: 10,
            ownerId: playerId,
            solvedItems: [],
            inGame: false
          };

          await saveLobby(lobbyId, lobby);
          console.log(`📝 [Lobby Created in Redis] ID: ${lobbyId}, Owner: ${playerId}`);
        } catch (err) {
          console.error(err);
          return;
        }
      }

      // Check if player already exists in lobby
      const existingPlayerIndex = lobby.players.findIndex((p) => p.id === playerId);
      if (existingPlayerIndex === -1) {
        lobby.players.push({
          id: playerId,
          socketId: socket.id,
          name,
          is_ready: false,
          inGame: false,
          color: null
        });
      } else {
        // Update socket ID and set as not in game
        lobby.players[existingPlayerIndex].socketId = socket.id;
        lobby.players[existingPlayerIndex].inGame = false;
      }

      await saveLobby(lobbyId, lobby);
      await emitLobbyUpdate(lobbyId);
    });

    // Switch between lobbies
    socket.on("switchLobby", async ({ oldLobbyId, newLobbyId, playerId, name }) => {
      console.log(`🔄 Player ${playerId} switching from lobby ${oldLobbyId} to ${newLobbyId}`);
      
      // Leave old lobby
      if (oldLobbyId) {
        socket.leave(`waiting_${oldLobbyId}`);
        socket.leave(`game_${oldLobbyId}`);
        
        const oldLobby = await getLobby(oldLobbyId);
        if (oldLobby) {
          const playerIndex = oldLobby.players.findIndex(p => p.id === playerId);
          if (playerIndex !== -1) {
            oldLobby.players.splice(playerIndex, 1);
            console.log(`🗑️ Removed player ${playerId} from old lobby ${oldLobbyId}`);
            
            if (oldLobby.players.length === 0) {
              await deleteLobby(oldLobbyId);
              console.log(`🗑️ Old lobby ${oldLobbyId} deleted (empty after switch)`);
            } else {
              await saveLobby(oldLobbyId, oldLobby);
            }
          }
        }
      }
      
      // Join new lobby
      socket.join(`waiting_${newLobbyId}`);
      
      let newLobby = await getLobby(newLobbyId);
      if (!newLobby) {
        try {
          const { data: dbLobby } = await supabase
            .from("lobbies")
            .select("*")
            .eq("id", newLobbyId)
            .single();

          if (!dbLobby) return;

          newLobby = {
            id: dbLobby.id,
            code: dbLobby.code,
            name: dbLobby.name,
            players: [],
            currentTurnIndex: 0,
            currentTurn: null,
            timer: null,
            timeLeft: 10,
            turnTime: 10,
            ownerId: playerId,
            solvedItems: [],
            inGame: false
          };

          await saveLobby(newLobbyId, newLobby);
          console.log(`📝 [New Lobby Created] ID: ${newLobbyId}, Owner: ${playerId}`);
        } catch (err) {
          console.error(err);
          return;
        }
      }

      // Add player to new lobby
      const existingPlayerIndex = newLobby.players.findIndex((p) => p.id === playerId);
      if (existingPlayerIndex === -1) {
        newLobby.players.push({
          id: playerId,
          socketId: socket.id,
          name,
          is_ready: false,
          inGame: false,
          color: null
        });
      } else {
        newLobby.players[existingPlayerIndex].socketId = socket.id;
      }

      await saveLobby(newLobbyId, newLobby);
      await emitLobbyUpdate(newLobbyId);
      
      console.log(`✅ Player ${playerId} successfully switched to lobby ${newLobbyId}`);
    });

    socket.on("setReady", async ({ lobbyId, playerId, isReady }) => {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      const player = lobby.players.find((p) => String(p.id) === String(playerId));
      if (!player) return;

      player.is_ready = isReady;
      console.log(`Player ${playerId} ready state: ${isReady}`);
      
      await saveLobby(lobbyId, lobby);
      await emitLobbyUpdate(lobbyId);
    });

    // Add this after the "setReady" event handler
socket.on("updatePlayerColor", async ({ lobbyId, playerId, color }) => {
  const lobby = await getLobby(lobbyId);
  if (!lobby) return;

  const player = lobby.players.find((p) => String(p.id) === String(playerId));
  if (!player) return;

  // Check if color is already taken by another player
  const colorTaken = lobby.players.some(p => 
    String(p.id) !== String(playerId) && p.color === color
  );

  if (colorTaken && color !== null) {
    console.log(`🎨 Color ${color} already taken in lobby ${lobbyId}`);
    socket.emit("colorUpdateFailed", { reason: "Color already taken" });
    return;
  }

  player.color = color;
  console.log(`🎨 Player ${playerId} updated color to: ${color}`);
  
  await saveLobby(lobbyId, lobby);
  await emitLobbyUpdate(lobbyId);
});

    // Add this in your game_socket.js after the "setReady" event
socket.on("updateGameSettings", async ({ lobbyId, playerId, turnTime, gameMode }) => {
  const lobby = await getLobby(lobbyId);
  if (!lobby) return;

  // Only owner can update settings
  if (String(playerId) !== String(lobby.ownerId)) return;

  if (turnTime) {
    lobby.turnTime = turnTime;
    console.log(`⚙️ Lobby ${lobbyId} turn time updated to ${turnTime}s by owner ${playerId}`);
  }

  if (gameMode) {
    lobby.gameMode = gameMode;
    console.log(`⚙️ Lobby ${lobbyId} game mode updated to ${gameMode} by owner ${playerId}`);
  }

  await saveLobby(lobbyId, lobby);
  
  // Notify all players about the updated settings
  io.to(`waiting_${lobbyId}`).emit("gameSettingsUpdated", {
    turnTime: lobby.turnTime,
    gameMode: lobby.gameMode
  });
});

    socket.on("startGame", async ({ lobbyId }) => {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      const owner = lobby.players.find((p) => p.id === lobby.ownerId);
      if (!owner || socket.id !== owner.socketId) return;
      if (!lobby.players.every((p) => p.is_ready)) return;

      console.log(`🎮 Starting game in lobby ${lobbyId} with players:`, lobby.players.map(p => `${p.id}-${p.name}`));

      // Reset game state
      lobby.solvedItems = [];
      lobby.currentTurnIndex = 0;
      lobby.currentTurn = String(lobby.players[0].id);
      lobby.timeLeft = 5;
      lobby.inGame = true;

      // Mark all players as in game
      lobby.players.forEach(player => {
        player.inGame = true;
        player.is_ready = false; // Reset ready state for next game
      });

      await saveLobby(lobbyId, lobby);
      
      // Move all players to game room and emit countdown
      io.to(`waiting_${lobbyId}`).socketsJoin(`game_${lobbyId}`);
      io.to(`game_${lobbyId}`).emit("countdown", { timeLeft: lobby.timeLeft });

      // Clear any existing timer
      if (lobby.timer) clearInterval(lobby.timer);
      
      lobby.timer = setInterval(async () => {
        lobby.timeLeft--;
        io.to(`game_${lobbyId}`).emit("countdown", { timeLeft: lobby.timeLeft });

        if (lobby.timeLeft <= 0) {
          clearInterval(lobby.timer);
          lobby.timer = null;

          await saveLobby(lobbyId, lobby);
          
          io.to(`game_${lobbyId}`).emit("gameStarted", {
            firstTurnPlayerId: lobby.currentTurn,
            firstTurnPlayerName: lobby.players[0].name,
            turnTime: lobby.turnTime,
          });

          console.log(`🎮 Game started in lobby ${lobbyId}, first turn: ${lobby.players[0].name}`);
        }
        
        await saveLobby(lobbyId, lobby);
      }, 1000);

      await saveLobby(lobbyId, lobby);
    });

    socket.on("leaveLobby", async ({ lobbyId, playerId }) => {
      await removePlayerFromLobby(lobbyId, playerId, socket);
    });

    // --- GAME EVENTS ---

    // Player joins game room (when coming from waiting room)
    socket.on("joinGame", async ({ lobbyId, playerId, playerName }) => {
      socket.join(`game_${lobbyId}`);
      
      const lobby = await getLobby(lobbyId);
      if (!lobby) {
        console.log(`⚠️ Tried to join game lobby ${lobbyId}, but it doesn't exist`);
        return;
      }

      console.log(`🎮 Player ${playerId} (${playerName}) joined game room ${lobbyId}`);

      // Update player socket and mark as in game
      const player = lobby.players.find((p) => String(p.id) === String(playerId));
      if (player) {
        player.socketId = socket.id;
        player.inGame = true;
        await saveLobby(lobbyId, lobby);
      }

      // Send current solved items to this player
      socket.emit("initItems", { 
  solvedItems: lobby.solvedItems || [],
  players: lobby.players // Send player data including colors
});
    });

    // Handle button press in game
    socket.on("buttonPress", async ({ lobbyId, playerId, correct, timeout, itemId }) => {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      console.log(`🔍 Current turn: ${lobby.currentTurn}, Player pressing: ${playerId}`);

      if (Number(playerId) !== Number(lobby.currentTurn)) {
        console.log(`⚠️ buttonPress ignored, not player ${playerId}'s turn. Current turn: ${lobby.currentTurn}`);
        return;
      }

      console.log(`🖲️ Button pressed by player ${playerId}, correct: ${correct}, timeout: ${timeout || false}, itemId: ${itemId || "N/A"}`);

      if (correct && itemId) {
        if (!lobby.solvedItems) lobby.solvedItems = [];
        if (!lobby.solvedItems.includes(itemId)) {
          lobby.solvedItems.push(itemId);
          // Track which player solved the item - FIXED: use solvedBy instead of playerId
          const solvedBy = playerId;

          io.to(`game_${lobbyId}`).emit("itemSolved", { 
      itemId, 
      solvedBy 
    });
          console.log(`✅ Item ${itemId} solved by player ${solvedBy} in lobby ${lobbyId}`);
        }
      }

      if (!correct) {
        if (timeout) {
          console.log(`⏰ Timeout for player ${playerId}, advancing turn`);
          await removePlayerFromGame(lobbyId, playerId);
        } else {
          console.log(`❌ Wrong answer by player ${playerId}, removing player`);
          await removePlayerFromGame(lobbyId, playerId, socket);
        }
        return;
      }

      await advanceTurn(lobbyId);
    });

    // Return to waiting room after game
    socket.on("returnToWaitingRoom", async ({ lobbyId, playerId }) => {
      socket.join(`waiting_${lobbyId}`);
      socket.leave(`game_${lobbyId}`);
      
      const lobby = await getLobby(lobbyId);
      if (lobby) {
        const player = lobby.players.find((p) => String(p.id) === String(playerId));
        if (player) {
          player.inGame = false;
          await saveLobby(lobbyId, lobby);
        }
      }
      
      console.log(`🔄 Player ${playerId} returned to waiting room ${lobbyId}`);
    });

    socket.on("leaveGame", async ({ lobbyId, playerId }) => {
      console.log(`📤 leaveGame from player ${playerId} in lobby ${lobbyId}`);
      await removePlayerFromGame(lobbyId, playerId, socket);
    });

    // --- DISCONNECT HANDLER ---
    socket.on("disconnect", async () => {
      console.log(`🔴 [Game Socket Disconnected] ID: ${socket.id}`);

      // Get all lobby keys from Redis
      const lobbyKeys = await CacheService.getKeys("lobby:*");
      
      for (const key of lobbyKeys) {
        const lobbyId = key.replace("lobby:", "");
        const lobby = await getLobby(lobbyId);
        if (lobby) {
          const player = lobby.players.find((p) => p.socketId === socket.id);
          if (player) {
            if (lobby.inGame) {
              await removePlayerFromGame(lobbyId, player.id);
            } else {
              await removePlayerFromLobby(lobbyId, player.id);
            }
          }
        }
      }
    });

    // --- HELPER FUNCTIONS ---

    async function advanceTurn(lobbyId) {
      const lobby = await getLobby(lobbyId);
      if (!lobby || lobby.players.length === 0) return;

      console.log(`🔄 Advancing turn from player ${lobby.currentTurn}`);
      console.log(`📊 Available players: ${lobby.players.map(p => `${p.id}-${p.name}`).join(', ')}`);

      // If there's only one player left, they win
      if (lobby.players.length === 1 && lobby.inGame) {
        console.log(`🏁 Only one player left in lobby ${lobbyId}, declaring winner`);
        
        // Mark game as ended to prevent double declaration
        lobby.inGame = false;
        
        io.to(`game_${lobbyId}`).emit("gameOver", { winner: lobby.players[0] });
        
        // Reset game state but keep players
        lobby.solvedItems = [];
        lobby.currentTurn = null;
        lobby.players.forEach(player => {
          player.inGame = false;
          player.is_ready = false;
        });
        
        await saveLobby(lobbyId, lobby);
        return;
      }

      let currentIndex = lobby.players.findIndex(p => String(p.id) === String(lobby.currentTurn));
      
      console.log(`🔍 Found current index: ${currentIndex}`);
      
      if (currentIndex === -1) {
        currentIndex = Math.floor(Math.random() * lobby.players.length);
      } else {
        currentIndex = (currentIndex + 1) % lobby.players.length;
      }

      lobby.currentTurnIndex = currentIndex;
      lobby.currentTurn = String(lobby.players[currentIndex].id);

      console.log(`🔄 New turn: player ${lobby.currentTurn} (${lobby.players[currentIndex].name}) at index: ${currentIndex}`);

      await saveLobby(lobbyId, lobby);

      io.to(`game_${lobbyId}`).emit("turnChanged", {
  currentTurnId: lobby.currentTurn,
  currentTurnName: lobby.players[currentIndex].name,
  timeLeft: lobby.turnTime,
  players: lobby.players // Send player data including colors
});

      console.log(`🔄 Turn advanced in lobby ${lobbyId}, player ${lobby.currentTurn}`);
    }

    async function removePlayerFromGame(lobbyId, playerId, socketInstance = null) {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      // Check if game is already over
      if (!lobby.inGame) {
        console.log(`⚠️ Player ${playerId} left but game already ended`);
        return;
      }

      const index = lobby.players.findIndex((p) => p.id === playerId);
      if (index === -1) return;

      const leavingPlayer = lobby.players.splice(index, 1)[0];
      console.log(`❌ Player ${playerId} (${leavingPlayer.name}) left game in lobby ${lobbyId}`);

      io.to(`game_${lobbyId}`).emit("playerLeft", { playerId, playerName: leavingPlayer.name });

      if (lobby.players.length === 1 && lobby.inGame) {
        console.log(`🏁 Only one player left in lobby ${lobbyId}, declaring winner`);
        
        // Mark game as ended to prevent double declaration
        lobby.inGame = false;
        
        io.to(`game_${lobbyId}`).emit("gameOver", { winner: lobby.players[0] });
        
        // Reset game state but keep players
        lobby.solvedItems = [];
        lobby.currentTurn = null;
        lobby.players.forEach(p => p.inGame = false);
        
        await saveLobby(lobbyId, lobby);
      } else if (lobby.players.length === 0) {
        await deleteLobby(lobbyId);
      } else if (Number(lobby.currentTurn) === Number(leavingPlayer.id)) {
        await advanceTurn(lobbyId);
      } else {
        await saveLobby(lobbyId, lobby);
      }

      if (socketInstance) {
        socketInstance.leave(`game_${lobbyId}`);
        console.log(`🚪 Socket ${socketInstance.id} left game room for lobby ${lobbyId}`);
      }
    }

    async function removePlayerFromLobby(lobbyId, playerId, socketInstance = null) {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      const index = lobby.players.findIndex((p) => p.id === playerId);
      if (index === -1) return;

      const leavingPlayer = lobby.players.splice(index, 1)[0];
      console.log(`❌ Player ${playerId} (${leavingPlayer.name}) left lobby ${lobbyId}`);

      try {
        const { error } = await supabase
          .from("players")
          .update({ lobby_id: null })
          .eq("id", playerId);
        if (error) console.error("⚠️ Failed to reset lobby_id in DB:", error);
      } catch (err) {
        console.error("⚠️ Exception while resetting lobby_id:", err);
      }

      io.to(`waiting_${lobbyId}`).emit("playerLeft", {
        playerId: leavingPlayer.id,
        playerName: leavingPlayer.name,
      });

      if (lobby.players.length === 0) {
        if (lobby.timer) clearInterval(lobby.timer);
        await deleteLobby(lobbyId);
        console.log(`🗑️ Lobby ${lobbyId} deleted from Redis (empty)`);
      } else {
        if (lobby.ownerId === playerId) {
          lobby.ownerId = lobby.players[0].id;
          console.log(`👑 New owner for lobby ${lobbyId}: ${lobby.ownerId}`);
        }
        await saveLobby(lobbyId, lobby);
        await emitLobbyUpdate(lobbyId);
      }

      if (socketInstance) {
        socketInstance.leave(`waiting_${lobbyId}`);
        socketInstance.leave(`game_${lobbyId}`);
        console.log(`🚪 Socket ${socketInstance.id} left all rooms for lobby ${lobbyId}`);
      }
    }
  });
}

module.exports = { initGameSocket };
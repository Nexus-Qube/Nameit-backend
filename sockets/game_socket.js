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
      
      // Debug: Check sockets in waiting room
      const waitingRoom = `waiting_${lobbyId}`;
      const socketsInRoom = await io.in(waitingRoom).fetchSockets();
      console.log(`👥 Sockets in ${waitingRoom}: ${socketsInRoom.length}`);
      
      io.to(waitingRoom).emit("lobbyUpdate", lobby);
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
            timeLeft: 5,
            turnTime: 10,
            ownerId: playerId,
            solvedItems: [],
            inGame: false,
            gameMode: 1 // Default game mode
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
          inGame: false, // Always set to false when joining waiting room
          color: null
        });
      } else {
        // Update socket ID and set as not in game
        lobby.players[existingPlayerIndex].socketId = socket.id;
        lobby.players[existingPlayerIndex].inGame = false;
        lobby.players[existingPlayerIndex].is_ready = false; // Reset ready state
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
            timeLeft: 5,
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

    // Updated startGame handler with unified gameStarted event
    socket.on("startGame", async ({ lobbyId }) => {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      const owner = lobby.players.find((p) => p.id === lobby.ownerId);
      if (!owner || socket.id !== owner.socketId) return;
      if (!lobby.players.every((p) => p.is_ready)) return;

      console.log(`🎮 Starting game in lobby ${lobbyId} with players:`, lobby.players.map(p => `${p.id}-${p.name}`));
      console.log(`🎯 Game mode: ${lobby.gameMode === 2 ? 'Hide & Seek' : 'Marathon'}`);

      // Reset game state
      lobby.solvedItems = [];
      lobby.currentTurnIndex = 0;
      lobby.currentTurn = String(lobby.players[0].id);
      lobby.timeLeft = 5; // 5 seconds for waiting room countdown
      lobby.inGame = true;
      
      // Initialize hide & seek selections if game mode is 2
      if (lobby.gameMode === 2) {
        lobby.hideSeekSelections = {};
        lobby.selectionPhase = true;
        lobby.gameStartCountdown = 3; // 3 seconds for game start countdown after selection
        console.log(`🎯 Hide & Seek mode - starting selection phase`);
      } else {
        lobby.selectionPhase = false;
      }

      // Mark all players as in game
      lobby.players.forEach(player => {
        player.inGame = true;
        player.is_ready = false; // Reset ready state for next game
      });

      await saveLobby(lobbyId, lobby);
      
      // Move all players to game room
      const socketsInWaiting = await io.in(`waiting_${lobbyId}`).fetchSockets();
      for (const s of socketsInWaiting) {
        s.join(`game_${lobbyId}`);
        s.leave(`waiting_${lobbyId}`);
      }
      
      // Clear any existing timer
      if (lobby.timer) clearInterval(lobby.timer);

      // Start waiting room countdown (5 seconds) for both game modes
      console.log(`⏰ Starting 5-second waiting room countdown`);
      io.to(`game_${lobbyId}`).emit("countdown", { timeLeft: lobby.timeLeft });
      
      lobby.timer = setInterval(async () => {
        lobby.timeLeft--;
        io.to(`game_${lobbyId}`).emit("countdown", { timeLeft: lobby.timeLeft });

        if (lobby.timeLeft <= 0) {
          clearInterval(lobby.timer);
          lobby.timer = null;

          await saveLobby(lobbyId, lobby);
          
          // Emit gameStarted for BOTH modes with gameMode parameter
          console.log(`🎮 Emitting gameStarted for game mode ${lobby.gameMode}`);
          io.to(`game_${lobbyId}`).emit("gameStarted", {
            firstTurnPlayerId: lobby.currentTurn,
            firstTurnPlayerName: lobby.players[0].name,
            turnTime: lobby.turnTime,
            gameMode: lobby.gameMode // Include game mode parameter
          });

          // For Hide & Seek, also emit selectionPhase to start the selection process
          if (lobby.gameMode === 2) {
            console.log(`🎯 Hide & Seek - Also emitting selectionPhase`);
            io.to(`game_${lobbyId}`).emit("selectionPhase", { 
              playersSelections: lobby.hideSeekSelections 
            });
          }
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
    socket.on("buttonPress", async ({ lobbyId, playerId, correct, timeout, itemId, isHideSeekItem = false }) => {
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      console.log(`🔍 Current turn: ${lobby.currentTurn}, Player pressing: ${playerId}`);

      if (Number(playerId) !== Number(lobby.currentTurn)) {
        console.log(`⚠️ buttonPress ignored, not player ${playerId}'s turn. Current turn: ${lobby.currentTurn}`);
        return;
      }

      console.log(`🖲️ Button pressed by player ${playerId}, correct: ${correct}, timeout: ${timeout || false}, itemId: ${itemId || "N/A"}, isHideSeekItem: ${isHideSeekItem}`);

      if (correct && itemId) {
        if (!lobby.solvedItems) lobby.solvedItems = [];
        if (!lobby.solvedItems.includes(itemId)) {
          lobby.solvedItems.push(itemId);
          const solvedBy = playerId;

          // For Hide & Seek mode, check if this is someone's hide & seek item
          let isHideSeekItemFound = false;
          if (lobby.gameMode === 2 && lobby.hideSeekSelections) {
            // Check if this item belongs to another player
            for (const [hideSeekPlayerId, selectedItem] of Object.entries(lobby.hideSeekSelections)) {
              if (Number(selectedItem.id) === Number(itemId) && Number(hideSeekPlayerId) !== Number(playerId)) {
                isHideSeekItemFound = true;
                console.log(`🎯 Player ${playerId} found hide & seek item of player ${hideSeekPlayerId}`);
                
                // Eliminate the player who owned this hide & seek item
                setTimeout(async () => {
                  await removePlayerFromGame(lobbyId, Number(hideSeekPlayerId), null, "hideSeekItemFound");
                }, 100);
                break;
              }
            }
          }

          io.to(`game_${lobbyId}`).emit("itemSolved", { 
            itemId, 
            solvedBy,
            isHideSeekItem: isHideSeekItemFound 
          });
          console.log(`✅ Item ${itemId} solved by player ${solvedBy} in lobby ${lobbyId}, isHideSeekItem: ${isHideSeekItemFound}`);
        }
      }

      if (!correct) {
        if (timeout) {
          console.log(`⏰ Timeout for player ${playerId}, eliminating player`);
          // For Hide & Seek mode, eliminate the player instead of just removing them
          if (lobby.gameMode === 2) {
            await removePlayerFromGame(lobbyId, playerId, null, "timeout");
          } else {
            await removePlayerFromGame(lobbyId, playerId, null, "timeout");
          }
        } else {
          console.log(`❌ Wrong answer by player ${playerId}, eliminating player`);
          // For Hide & Seek mode, eliminate the player
          if (lobby.gameMode === 2) {
            await removePlayerFromGame(lobbyId, playerId, null, "wrongAnswer");
          } else {
            await removePlayerFromGame(lobbyId, playerId, socket, "wrongAnswer");
          }
        }
        return;
      }

      await advanceTurn(lobbyId);
    });

    // Return to waiting room after game - FIXED VERSION
    socket.on("returnToWaitingRoom", async ({ lobbyId, playerId }) => {
      console.log(`🔄 Player ${playerId} returning to waiting room ${lobbyId}`);
      
      // SIMPLE room management - like the old working code
      socket.join(`waiting_${lobbyId}`);
      socket.leave(`game_${lobbyId}`);
      
      const lobby = await getLobby(lobbyId);
      if (!lobby) {
        console.log(`❌ Lobby ${lobbyId} not found when player ${playerId} tried to return`);
        return;
      }

      const player = lobby.players.find((p) => String(p.id) === String(playerId));
      if (!player) {
        console.log(`❌ Player ${playerId} not found in lobby ${lobbyId}`);
        return;
      }

      console.log(`📊 Lobby state before return - Players: ${lobby.players.map(p => `${p.id}-${p.name}`).join(', ')}`);
      
      // Update player state
      player.inGame = false;
      player.socketId = socket.id; // Update socket ID
      
      // If the game is still active, mark it as ended for this player
      if (lobby.inGame) {
        console.log(`🔄 Player ${playerId} returned to waiting room during active game`);
        
        // Check if this was the last player in the game
        const playersStillInGame = lobby.players.filter(p => p.inGame);
        console.log(`📊 Players still in game: ${playersStillInGame.length}`);
        
        if (playersStillInGame.length === 0) {
          // All players have returned to waiting room, reset game state
          console.log(`🎮 All players returned to waiting room, resetting game state for lobby ${lobbyId}`);
          lobby.inGame = false;
          lobby.selectionPhase = false;
          lobby.solvedItems = [];
          lobby.currentTurn = null;
          lobby.hideSeekSelections = {};
          lobby.eliminatedPlayers = new Set();
          
          // Clear any active timers
          if (lobby.timer) {
            clearInterval(lobby.timer);
            lobby.timer = null;
          }
        }
      }
      
      await saveLobby(lobbyId, lobby);
      
      console.log(`📊 Lobby state after return - Players: ${lobby.players.map(p => `${p.id}-${p.name}`).join(', ')}`);
      console.log(`✅ Player ${playerId} successfully returned to waiting room ${lobbyId}`);
      
      // CRITICAL: Emit lobby update to ALL waiting room clients
      await emitLobbyUpdate(lobbyId);
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

    // --- HIDE & SEEK GAME EVENTS ---

    // Player joins hide & seek game
    socket.on("joinHideSeekGame", async ({ lobbyId, playerId, playerName }) => {
      socket.join(`game_${lobbyId}`);
      
      const lobby = await getLobby(lobbyId);
      if (!lobby) {
        console.log(`⚠️ Tried to join hide & seek game lobby ${lobbyId}, but it doesn't exist`);
        return;
      }

      console.log(`🎮 Player ${playerId} (${playerName}) joined hide & seek game room ${lobbyId}`);

      // Update player socket and mark as in game
      const player = lobby.players.find((p) => String(p.id) === String(playerId));
      if (player) {
        player.socketId = socket.id;
        player.inGame = true;
        await saveLobby(lobbyId, lobby);
      }

      // Send current state based on game phase
      if (lobby.selectionPhase) {
        socket.emit("selectionPhase", { 
          playersSelections: lobby.hideSeekSelections || {} 
        });
      } else {
        socket.emit("initItems", { 
          solvedItems: lobby.solvedItems || [],
          players: lobby.players
        });
      }
    });

    // Player selects their hide & seek item
    socket.on("selectHideSeekItem", async ({ lobbyId, playerId, itemId, itemName }) => {
      const lobby = await getLobby(lobbyId);
      if (!lobby || !lobby.selectionPhase) {
        console.log(`❌ No lobby or selection phase not active for lobby ${lobbyId}`);
        return;
      }

      console.log(`🎯 Player ${playerId} selected hide & seek item: ${itemName} (ID: ${itemId})`);

      // Initialize selections if not exists
      if (!lobby.hideSeekSelections) {
        lobby.hideSeekSelections = {};
      }

      // Convert playerId to string for consistent key storage
      const playerIdStr = String(playerId);
      
      // Store player's selection with item details
      lobby.hideSeekSelections[playerIdStr] = { id: itemId, name: itemName };
      await saveLobby(lobbyId, lobby);

      console.log(`📊 Current selections in lobby ${lobbyId}:`, lobby.hideSeekSelections);

      // Check if all players have selected items
      const allPlayersSelected = lobby.players.every(player => {
        const playerIdStr = String(player.id);
        return lobby.hideSeekSelections[playerIdStr] !== undefined;
      });

      console.log(`✅ All players selected: ${allPlayersSelected}`);

      if (allPlayersSelected) {
        console.log(`🎯 All players have selected items, checking for duplicates...`);
        
        // Verify all selections are unique
        const selectedItems = Object.values(lobby.hideSeekSelections);
        const selectedItemIds = selectedItems.map(item => item.id);
        const uniqueItems = new Set(selectedItemIds);

        if (selectedItems.length === uniqueItems.size) {
          // All selections are unique - start 3-second countdown to game start
          console.log(`✅ All players selected unique hide & seek items, starting 3-second countdown`);
          
          // Clear any existing timer first
          if (lobby.timer) {
            clearInterval(lobby.timer);
            lobby.timer = null;
          }
          
          // Start the 3-second countdown for game start
          lobby.gameStartCountdown = 3;
          
          // Emit initial countdown to all players
          io.to(`game_${lobbyId}`).emit("selectionCountdown", { timeLeft: lobby.gameStartCountdown });
          
          lobby.timer = setInterval(async () => {
            lobby.gameStartCountdown--;
            
            // Emit countdown update to all players
            io.to(`game_${lobbyId}`).emit("selectionCountdown", { timeLeft: lobby.gameStartCountdown });

            if (lobby.gameStartCountdown <= 0) {
              clearInterval(lobby.timer);
              lobby.timer = null;
              lobby.selectionPhase = false;
              
              await saveLobby(lobbyId, lobby);
              
              // Emit selectionComplete with first turn information - ONLY ONCE
              console.log(`🎮 Emitting selectionComplete for lobby ${lobbyId}`);
              io.to(`game_${lobbyId}`).emit("selectionComplete", { 
                playerItems: lobby.hideSeekSelections,
                firstTurnPlayerId: lobby.currentTurn,
                firstTurnPlayerName: lobby.players.find(p => String(p.id) === String(lobby.currentTurn))?.name || "Unknown"
              });
              
              console.log(`🎮 Hide & Seek game started in lobby ${lobbyId}, first turn: ${lobby.currentTurn}`);
            }
            
            await saveLobby(lobbyId, lobby);
          }, 1000);
          
        } else {
          // Duplicate selections found - reset and ask players to choose again
          console.log(`🔄 Duplicate hide & seek items found, resetting selections`);
          
          const duplicateCount = selectedItems.length - uniqueItems.size;
          lobby.hideSeekSelections = {};
          
          await saveLobby(lobbyId, lobby);
          
          io.to(`game_${lobbyId}`).emit("selectionFailed", { 
            reason: `${duplicateCount} item(s) were chosen by multiple players. Everyone must choose again.` 
          });
          
          // Also emit selectionPhase to update the UI
          io.to(`game_${lobbyId}`).emit("selectionPhase", { 
            playersSelections: lobby.hideSeekSelections,
            hasDuplicateItems: true
          });
          
          console.log(`🔄 Selection reset for lobby ${lobbyId} - ${duplicateCount} duplicate(s) found`);
        }
      } else {
        console.log(`⏳ Waiting for more players to select. Current: ${Object.keys(lobby.hideSeekSelections).length}/${lobby.players.length}`);
        
        // Emit selectionPhase to update all players with current selections
        io.to(`game_${lobbyId}`).emit("selectionPhase", { 
          playersSelections: lobby.hideSeekSelections,
          hasDuplicateItems: false
        });
      }
    });

    // Handle player elimination in hide & seek
    socket.on("playerEliminated", async ({ lobbyId, playerId, reason }) => {
      const lobby = await getLobby(lobbyId);
      if (!lobby || !lobby.inGame) return;

      console.log(`💀 Player ${playerId} eliminated from hide & seek game: ${reason}`);

      // Initialize eliminated players set if not exists
      if (!lobby.eliminatedPlayers || !(lobby.eliminatedPlayers instanceof Set)) {
        lobby.eliminatedPlayers = new Set();
        console.log(`📝 Initialized eliminatedPlayers as Set for lobby ${lobbyId}`);
      }
      
      lobby.eliminatedPlayers.add(String(playerId));

      // Notify all players
      io.to(`game_${lobbyId}`).emit("playerEliminated", { eliminatedPlayerId: playerId });

      // Check if game should end
      const activePlayers = lobby.players.filter(player => 
        !lobby.eliminatedPlayers.has(String(player.id))
      );

      if (activePlayers.length === 1) {
        // Only one player left - they win!
        console.log(`🏁 Hide & Seek game over! Winner: ${activePlayers[0].name}`);
        lobby.inGame = false;
        
        io.to(`game_${lobbyId}`).emit("gameOver", { winner: activePlayers[0] });
        
        // Reset game state
        lobby.solvedItems = [];
        lobby.currentTurn = null;
        lobby.eliminatedPlayers = new Set();
        lobby.hideSeekSelections = {};
        lobby.selectionPhase = false;
        
        lobby.players.forEach(player => {
          player.inGame = false;
          player.is_ready = false;
        });
      } else if (Number(lobby.currentTurn) === Number(playerId)) {
        // Eliminated player was the current turn - advance turn
        await advanceTurn(lobbyId);
      }

      await saveLobby(lobbyId, lobby);
    });

    // --- HELPER FUNCTIONS ---

    async function advanceTurn(lobbyId) {
      // CRITICAL FIX: Get fresh lobby data to ensure we have latest inGame status
      const lobby = await getLobby(lobbyId);
      if (!lobby || lobby.players.length === 0) return;

      console.log(`🔄 Advancing turn from player ${lobby.currentTurn}`);
      
      // Filter to only active players (inGame: true)
      const activePlayers = lobby.players.filter(p => p.inGame === true);
      console.log(`📊 Active players: ${activePlayers.map(p => `${p.id}-${p.name} (inGame: ${p.inGame})`).join(', ')}`);

      if (activePlayers.length === 0) {
        console.log(`❌ No active players left in lobby ${lobbyId}`);
        return;
      }

      // If there's only one player left, they win
      if (activePlayers.length === 1 && lobby.inGame) {
        console.log(`🏁 Only one player left in lobby ${lobbyId}, declaring winner`);
        
        // Mark game as ended to prevent double declaration
        lobby.inGame = false;
        
        io.to(`game_${lobbyId}`).emit("gameOver", { winner: activePlayers[0] });
        
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

      // Find current player index in ACTIVE players
      let currentIndex = activePlayers.findIndex(p => String(p.id) === String(lobby.currentTurn));
      
      console.log(`🔍 Found current index in active players: ${currentIndex}`);
      
      if (currentIndex === -1) {
        // Current player not found in active players (might be eliminated), start from random active player
        currentIndex = Math.floor(Math.random() * activePlayers.length);
        console.log(`🎲 Starting from random active player at index: ${currentIndex}`);
      } else {
        // Move to next active player
        currentIndex = (currentIndex + 1) % activePlayers.length;
        console.log(`➡️ Moving to next active player at index: ${currentIndex}`);
      }

      // Update lobby state with the new turn from active players
      lobby.currentTurn = String(activePlayers[currentIndex].id);
      
      // Also update the currentTurnIndex based on the full players array for consistency
      const fullIndex = lobby.players.findIndex(p => String(p.id) === String(lobby.currentTurn));
      lobby.currentTurnIndex = fullIndex;

      console.log(`🔄 New turn: player ${lobby.currentTurn} (${activePlayers[currentIndex].name}) at active index: ${currentIndex}, full index: ${fullIndex}`);

      await saveLobby(lobbyId, lobby);

      io.to(`game_${lobbyId}`).emit("turnChanged", {
        currentTurnId: lobby.currentTurn,
        currentTurnName: activePlayers[currentIndex].name,
        timeLeft: lobby.turnTime,
        players: lobby.players // Send player data including colors
      });

      console.log(`🔄 Turn advanced in lobby ${lobbyId}, player ${lobby.currentTurn}`);
    }

    async function removePlayerFromGame(lobbyId, playerId, socketInstance = null, eliminationReason = null) {
      // CRITICAL FIX: Get fresh lobby data
      const lobby = await getLobby(lobbyId);
      if (!lobby) return;

      // Check if game is already over
      if (!lobby.inGame) {
        console.log(`⚠️ Player ${playerId} left but game already ended`);
        return;
      }

      const player = lobby.players.find((p) => p.id === playerId);
      if (!player) return;

      // Mark player as not in game (eliminated)
      player.inGame = false;
      
      console.log(`❌ Player ${playerId} (${player.name}) eliminated from game in lobby ${lobbyId}, reason: ${eliminationReason || "left"}`);
      console.log(`📊 Player ${playerId} inGame set to: ${player.inGame}`);

      // For Hide & Seek mode, use playerEliminated event
      if (lobby.gameMode === 2 && eliminationReason) {
        // Initialize eliminatedPlayers if needed
        if (!lobby.eliminatedPlayers || !(lobby.eliminatedPlayers instanceof Set)) {
          lobby.eliminatedPlayers = new Set();
        }
        
        lobby.eliminatedPlayers.add(String(playerId));
        
        io.to(`game_${lobbyId}`).emit("playerEliminated", { 
          eliminatedPlayerId: playerId,
          reason: eliminationReason
        });
      } else {
        io.to(`game_${lobbyId}`).emit("playerLeft", { playerId, playerName: player.name });
      }

      // CRITICAL: Save the lobby state immediately after updating inGame status
      await saveLobby(lobbyId, lobby);

      // Check if game should end - only count active players (inGame: true)
      // CRITICAL: Get fresh lobby data again to ensure we have the latest state
      const updatedLobby = await getLobby(lobbyId);
      const activePlayers = updatedLobby.players.filter(p => p.inGame === true);
      console.log(`📊 Remaining active players: ${activePlayers.map(p => `${p.id}-${p.name}`).join(', ')}`);
      
      if (activePlayers.length === 1 && updatedLobby.inGame) {
        console.log(`🏁 Only one player left in lobby ${lobbyId}, declaring winner`);
        
        // Mark game as ended to prevent double declaration
        updatedLobby.inGame = false;
        
        const winner = activePlayers[0];
        if (winner) {
          io.to(`game_${lobbyId}`).emit("gameOver", { winner });
          
          // Reset game state but keep players
          updatedLobby.solvedItems = [];
          updatedLobby.currentTurn = null;
          if (updatedLobby.gameMode === 2) {
            updatedLobby.eliminatedPlayers = new Set();
            updatedLobby.hideSeekSelections = {};
            updatedLobby.selectionPhase = false;
          }
          updatedLobby.players.forEach(p => p.inGame = false);
        }
        
        await saveLobby(lobbyId, updatedLobby);
      } else if (updatedLobby.players.length === 0) {
        await deleteLobby(lobbyId);
      } else if (Number(updatedLobby.currentTurn) === Number(playerId)) {
        // If the eliminated player was the current turn, advance to next ACTIVE player
        await advanceTurn(lobbyId);
      } else {
        await saveLobby(lobbyId, updatedLobby);
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
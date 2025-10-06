const supabase = require("../supabase");

// Shared in-memory storage
const lobbies = {};

function initWaitingRoomSocket(ioNamespace) {
  ioNamespace.on("connection", (socket) => {
    console.log(`🟢 [WaitingRoom Socket Created] ID: ${socket.id}`);

    // Player joins a lobby
    socket.on("joinLobby", async ({ lobbyId, playerId, name }) => {
      socket.join(lobbyId);
      console.log(`➡️ Player ${playerId} (${name}) joined lobby ${lobbyId}`);

      if (!lobbies[lobbyId]) {
        try {
          const { data: lobby } = await supabase
            .from("lobbies")
            .select("*")
            .eq("id", lobbyId)
            .single();

          if (!lobby) return;

          lobbies[lobbyId] = {
            id: lobby.id,
            code: lobby.code,
            name: lobby.name,
            players: [],
            currentTurnIndex: 0,
            currentTurn: null,
            timer: null,
            timeLeft: 10,
            turnTime: 10,
            ownerId: playerId,
          };

          console.log(
            `📝 [Lobby Created] ID: ${lobbyId}, Owner: ${playerId}, Players: []`
          );
        } catch (err) {
          console.error(err);
          return;
        }
      }

      if (!lobbies[lobbyId].players.find((p) => p.id === playerId)) {
        lobbies[lobbyId].players.push({
          id: playerId,
          socketId: socket.id,
          name,
          is_ready: false,
        });
      }

      emitLobbyUpdate(lobbyId);
    });

    socket.on("setReady", ({ lobbyId, playerId, isReady }) => {
      const lobby = lobbies[lobbyId];
      if (!lobby) return;

      const player = lobby.players.find((p) => String(p.id) === String(playerId));
      if (!player) return;

      player.is_ready = isReady;
      console.log(`Player ${playerId} ready state: ${isReady}`);
      emitLobbyUpdate(lobbyId);
    });

    socket.on("startGame", ({ lobbyId }) => {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  const owner = lobby.players.find((p) => p.id === lobby.ownerId);
  if (!owner || socket.id !== owner.socketId) return;
  if (!lobby.players.every((p) => p.is_ready)) return;

  // Reset game state
  lobby.solvedItems = [];
  lobby.currentTurnIndex = 0;
  lobby.currentTurn = lobby.players[0].id; // or choose random first player
  lobby.timeLeft = 5;

  ioNamespace.to(lobbyId).emit("countdown", { timeLeft: lobby.timeLeft });

  if (lobby.timer) clearInterval(lobby.timer);
  lobby.timer = setInterval(() => {
    lobby.timeLeft--;
    ioNamespace.to(lobbyId).emit("countdown", { timeLeft: lobby.timeLeft });

    if (lobby.timeLeft <= 0) {
      clearInterval(lobby.timer);
      lobby.timer = null;

      // Emit game started with first player info
      const firstPlayer = lobby.players[lobby.currentTurnIndex];
      lobby.currentTurn = firstPlayer.id;

      ioNamespace.to(lobbyId).emit("gameStarted", {
        firstTurnPlayerId: firstPlayer.id,
        firstTurnPlayerName: firstPlayer.name,
        turnTime: lobby.turnTime,
      });

      console.log(`🎮 Game started in lobby ${lobbyId}, first turn: ${firstPlayer.name}`);
    }
  }, 1000);
});


    socket.on("leaveLobby", ({ lobbyId, playerId }) => {
      removePlayerFromLobby(lobbyId, playerId, socket);
    });

    socket.on("disconnect", () => {
      console.log(`🔴 [WaitingRoom Socket Disconnected] ID: ${socket.id}`);

      for (const lobbyId in lobbies) {
        const lobby = lobbies[lobbyId];
        const player = lobby.players.find((p) => p.socketId === socket.id);
        if (player) removePlayerFromLobby(lobbyId, player.id);
      }
    });

    function emitLobbyUpdate(lobbyId) {
      const lobby = lobbies[lobbyId];
      if (!lobby) return;

      console.log(
        `📊 [Lobby Update] Lobby ${lobbyId}, Players: ${lobby.players
          .map((p) => `${p.id}-${p.name}`)
          .join(", ")}`
      );
      ioNamespace.to(lobbyId).emit("lobbyUpdate", lobby);
    }

    async function removePlayerFromLobby(lobbyId, playerId, socketInstance = null) {
      const lobby = lobbies[lobbyId];
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

      ioNamespace.to(lobbyId).emit("playerLeft", {
        playerId: leavingPlayer.id,
        playerName: leavingPlayer.name,
      });

      if (lobby.players.length === 0) {
        if (lobby.timer) clearInterval(lobby.timer);
        delete lobbies[lobbyId];
        console.log(`🗑️ Lobby ${lobbyId} deleted (empty)`);
      } else {
        if (lobby.ownerId === playerId) lobby.ownerId = lobby.players[0].id;
        emitLobbyUpdate(lobbyId);
      }

      if (socketInstance) socketInstance.leave(lobbyId);
    }
  });
}

module.exports = { initWaitingRoomSocket, lobbies };

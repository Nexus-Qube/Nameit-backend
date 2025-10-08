const { initGameSocket } = require("./sockets/game_socket");

function initSocket(io) {
  // Use single namespace for everything
  initGameSocket(io);
}

module.exports = initSocket;
const { initWaitingRoomSocket } = require("./sockets/waitingroom_socket");
const { initChallengeSocket } = require("./sockets/challenge_socket");

function initSocket(io) {
  initWaitingRoomSocket(io);
  initChallengeSocket(io);
}

module.exports = initSocket;
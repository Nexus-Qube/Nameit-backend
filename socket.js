const { initWaitingRoomSocket } = require("./sockets/waitingroom_socket");
const { initChallengeSocket } = require("./sockets/challenge_socket");

function initSocket(io) {
  // Create separate namespaces for clarity
  const waitingRoomNamespace = io.of("/waiting-room");
  const challengeNamespace = io.of("/challenge");

  initWaitingRoomSocket(waitingRoomNamespace);
  initChallengeSocket(challengeNamespace);
}

module.exports = initSocket;
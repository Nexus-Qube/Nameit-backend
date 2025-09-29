const supabase = require('../supabase');

// Add player to lobby
async function joinLobby(req, res) {
  try {
    const { lobbyId, name, socketId } = req.body;

    const { data, error } = await supabase
      .from('players')
      .insert([{ lobby_id: lobbyId, name, socket_id: socketId, is_ready: false }])
      .select();

    if (error) return res.status(500).json({ error });

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error joining lobby' });
  }
}

// Set player ready
async function setReady(req, res) {
  try {
    const { playerId, isReady } = req.body;

    const { data, error } = await supabase
      .from('players')
      .update({ is_ready: isReady })
      .eq('id', playerId)
      .select();

    if (error) return res.status(500).json({ error });

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error setting ready' });
  }
}

module.exports = { joinLobby, setReady };

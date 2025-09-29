const supabase = require('../supabase');

// Create a lobby
async function createLobby(req, res) {
  try {
    const { topicId, name, creatorId } = req.body;
    const code = generateLobbyCode();

    const { data, error } = await supabase
      .from('lobbies')
      .insert([{ topic_id: topicId, code, name, created_by: creatorId }])
      .select();

    if (error) return res.status(500).json({ error });

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error creating lobby' });
  }
}

// Get lobby by code
async function getLobbyByCode(req, res) {
  try {
    const { code } = req.params;

    const { data, error } = await supabase
      .from('lobbies')
      .select('*')
      .eq('code', code)
      .single();

    if (error) return res.status(404).json({ error: 'Lobby not found' });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error fetching lobby' });
  }
}

// Get all lobbies for a topic with their players and creator
async function getLobbiesByTopic(req, res) {
  try {
    const { topicId } = req.params;

    const { data, error } = await supabase
      .from('lobbies')
      .select(`
        *,
        players!players_lobby_id_fkey(*),
        creator:players!lobbies_created_by_fkey(*)
      `)
      .eq('topic_id', topicId);

    if (error) return res.status(500).json({ error });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error fetching lobbies' });
  }
}

// Get all lobbies (newest first) with topic, players, creator
// controllers/lobbiesController.js
async function getAllLobbies(req, res) {
  try {
    const { data, error } = await supabase
  .from('lobbies')
  .select(`
    id,
    name,
    code,
    is_started,
    created_at,
    created_by,
    topic:topics (
      id,
      name,
      category:categories (
        id,
        name
      )
    ),
    players:players!players_lobby_id_fkey(*),
    creator:players!lobbies_created_by_fkey(*)
  `)
  .order('created_at', { ascending: false });


    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("getAllLobbies exception:", err);
    res.status(500).json({ error: 'Unexpected error fetching all lobbies' });
  }
}

// Helper to generate random lobby code
function generateLobbyCode(length = 6) {
  return Math.random().toString(36).substr(2, length).toUpperCase();
}

// Join a lobby
async function joinLobby(req, res) {
  try {
    const { id } = req.params; // lobby id
    const { name, code, playerId } = req.body;

    // Check lobby exists
    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('*')
      .eq('id', id)
      .single();

    if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' });
    if (lobby.code !== code) return res.status(403).json({ error: 'Incorrect code' });

    // If playerId exists, fetch existing player
    if (playerId) {
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single();

      if (existingPlayer) {
        await supabase
          .from('players')
          .update({ lobby_id: id })
          .eq('id', playerId);

        return res.json(existingPlayer);
      }
    }

    // Check if name already taken in lobby
    const { data: nameTaken } = await supabase
      .from('players')
      .select('*')
      .eq('lobby_id', id)
      .eq('name', name)
      .single();

    if (nameTaken) return res.status(400).json({ error: 'Name already taken in this lobby' });

    // Insert new player
    const { data, error } = await supabase
      .from('players')
      .insert([{ lobby_id: id, name }])
      .select();

    if (error) return res.status(500).json({ error: 'Failed to join lobby' });

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error' });
  }
}

// Delete a lobby by ID
async function deleteLobby(req, res) {
  try {
    const { id } = req.params;

    // First, check if the lobby exists
    const { data: lobby, error: lobbyError } = await supabase
      .from('lobbies')
      .select('*')
      .eq('id', id)
      .single();

    if (lobbyError || !lobby) return res.status(404).json({ error: 'Lobby not found' });

    // Delete all players in the lobby first (optional, for referential integrity)
    await supabase.from('players').delete().eq('lobby_id', id);

    // Delete the lobby
    const { error } = await supabase.from('lobbies').delete().eq('id', id);

    if (error) return res.status(500).json({ error: 'Failed to delete lobby' });

    res.json({ success: true, message: `Lobby ${id} deleted` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error deleting lobby' });
  }
}

module.exports = {
  createLobby,
  getLobbyByCode,
  getLobbiesByTopic,
  getAllLobbies,
  joinLobby,
  deleteLobby,
};

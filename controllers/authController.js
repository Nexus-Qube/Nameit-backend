const supabase = require('../supabase');
const bcrypt = require('bcrypt');

// Create a new player account
async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    const { data: existing } = await supabase
      .from('players')
      .select('*')
      .eq('email', email)
      .single();

    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('players')
      .insert([{ name, email, password_hash }])
      .select();

    if (error) return res.status(500).json({ error });

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error registering' });
  }
}

// Login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    const { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !player) return res.status(404).json({ error: 'Player not found' });

    const match = await bcrypt.compare(password, player.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    res.json(player);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error logging in' });
  }
}

module.exports = { register, login };

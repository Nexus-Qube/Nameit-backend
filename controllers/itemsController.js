const supabase = require('../supabase');

const getItems = async (req, res) => {
  try {
    const { topic_id, region, type, pokedex_number } = req.query;

    let query = supabase.from('items').select('*');

    if (topic_id) query = query.eq('topic_id', topic_id);
    if (region) query = query.contains('attributes', { region });
    if (type) query = query.contains('attributes', { type: [type] });
    if (pokedex_number) query = query.contains('attributes', { pokedex_number: Number(pokedex_number) });

    const { data, error } = await query;

    if (error) return res.status(500).json({ error });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

async function getItemsByTopic(req, res) {
  try {
    const { topicId } = req.params;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("topic_id", topicId);

    if (error) return res.status(500).json({ error });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
}

module.exports = { getItems, getItemsByTopic };
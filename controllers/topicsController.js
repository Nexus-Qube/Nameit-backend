const supabase = require('../supabase');

// GET /topics/:id → fetch a single topic by its id
async function getTopicById(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("topics")
      .select("id, name, sprite_sheet_url, sprite_size, sprites_per_row, sort_field, category_id")
      .eq("id", id)
      .single(); // ensure we only get one row

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: "Error fetching topic" });
    }

    if (!data) {
      return res.status(404).json({ error: "Topic not found" });
    }

    res.json(data);
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Unexpected error fetching topic" });
  }
}

module.exports = { getTopicById };

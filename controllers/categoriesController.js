const supabase = require('../supabase');

// GET /categories → fetch all categories with their associated topics
async function getCategories(req, res) {
  try {
    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name"); // ✅ only select existing columns

    if (catError) {
      console.error("Supabase error (categories):", catError);
      return res.status(500).json({ error: "Error fetching categories" });
    }

    // Fetch topics for all categories
    const { data: topics, error: topicError } = await supabase
      .from("topics")
      .select("id, category_id, name, description, sprite_sheet_url, sprite_size, sprites_per_row, sort_field");

    if (topicError) {
      console.error("Supabase error (topics):", topicError);
      return res.status(500).json({ error: "Error fetching topics" });
    }

    // Group topics under their categories
    const categoriesWithTopics = categories.map(category => ({
      ...category,
      topics: topics.filter(topic => topic.category_id === category.id)
    }));

    res.json(categoriesWithTopics);
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Unexpected error fetching categories" });
  }
}

module.exports = { getCategories };

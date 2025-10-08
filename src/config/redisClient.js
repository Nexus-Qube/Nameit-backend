const Redis = require("ioredis");

let redis;

if (process.env.REDIS_URL) {
  // ✅ When deployed (Render, etc.)
  redis = new Redis(process.env.REDIS_URL);
} else {
  // ✅ Local development
  redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
  });
}

redis.on("connect", () => console.log("✅ Connected to Redis"));
redis.on("error", (err) => console.error("❌ Redis Error:", err));

module.exports = redis;
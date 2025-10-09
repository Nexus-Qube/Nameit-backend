const Redis = require("ioredis");

let redis;

if (process.env.REDIS_URL) {
  // ✅ Production or Render Redis
  console.log('🔗 Connecting to Redis URL:', process.env.REDIS_URL.replace(/:\/\/[^@]*@/, '://***@')); // Hide password in logs
  redis = new Redis(process.env.REDIS_URL, {
    // Render Redis specific configuration
    tls: process.env.NODE_ENV === 'production' ? {} : undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 10000,
    commandTimeout: 5000
  });
} else {
  // ✅ Local development
  console.log('🔗 Connecting to local Redis...');
  redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });
}

redis.on("connect", () => console.log("✅ Connected to Redis"));
redis.on("error", (err) => console.error("❌ Redis Error:", err));
redis.on("close", () => console.log("🔴 Redis connection closed"));
redis.on("reconnecting", (ms) => console.log(`🔄 Redis reconnecting in ${ms}ms`));

// Test connection on startup with retry
const connectWithRetry = async (retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await redis.ping();
      console.log('🎯 Redis ping successful');
      return;
    } catch (err) {
      console.error(`💥 Redis ping failed (attempt ${i + 1}/${retries}):`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ Failed to connect to Redis after all retries');
};

connectWithRetry();

module.exports = redis;
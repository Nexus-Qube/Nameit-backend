const Redis = require("ioredis");

console.log('🔍 Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REDIS_URL:', process.env.REDIS_URL ? 'set' : 'NOT SET');

let redis;
let isConnected = false;

function createRedisClient() {
  if (process.env.REDIS_URL) {
    console.log('🔗 Creating Redis client for Render...');
    
    // Render Redis configuration
    redis = new Redis(process.env.REDIS_URL, {
      tls: process.env.REDIS_URL.startsWith('rediss:') ? {} : undefined,
      lazyConnect: true, // Don't connect immediately
      retryDelayOnFailover: 1000,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      connectTimeout: 30000,
      commandTimeout: 15000,
      retryDelayBase: 1000,
      maxRetriesPerRequest: 5,
      // Render-specific: don't fail fast, keep retrying
      retryStrategy: function(times) {
        if (times > 10) {
          console.log('🔄 Too many Redis retries, giving up');
          return null;
        }
        const delay = Math.min(times * 1000, 10000);
        console.log(`🔄 Redis retry ${times}, waiting ${delay}ms`);
        return delay;
      }
    });
  } else {
    console.log('⚠️  REDIS_URL not set, using local Redis');
    redis = new Redis({
      host: "127.0.0.1",
      port: 6379,
      lazyConnect: true,
      retryDelayOnFailover: 1000,
      maxRetriesPerRequest: 3
    });
  }

  // Event handlers
  redis.on("connect", () => {
    console.log("✅ Connected to Redis");
    isConnected = true;
  });

  redis.on("error", (err) => {
    console.error("❌ Redis Error:", err.message);
    isConnected = false;
  });

  redis.on("close", () => {
    console.log("🔴 Redis connection closed");
    isConnected = false;
  });

  redis.on("reconnecting", (ms) => {
    console.log(`🔄 Redis reconnecting in ${ms}ms`);
  });

  redis.on("ready", () => {
    console.log("🎯 Redis ready for commands");
    isConnected = true;
  });

  return redis;
}

// Create the client but don't connect immediately
redis = createRedisClient();

// Function to connect with retry logic
async function connectRedis() {
  try {
    console.log('🔗 Attempting to connect to Redis...');
    await redis.connect();
    console.log('✅ Redis connect() completed');
  } catch (err) {
    console.error('❌ Redis initial connection failed:', err.message);
    // Don't throw - let retry strategy handle it
  }
}

// Function to check if Redis is ready
async function waitForRedis(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await redis.ping();
      console.log('🎯 Redis ping successful');
      return true;
    } catch (err) {
      console.log(`⏳ Redis not ready yet (attempt ${i + 1}/${retries})...`);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ Redis never became ready');
  return false;
}

// Start connection after a short delay to allow server to start
setTimeout(() => {
  connectRedis();
}, 5000); // Wait 5 seconds before attempting connection

module.exports = redis;
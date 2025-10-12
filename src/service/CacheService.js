const redis = require("../config/redisClient.js");

class CacheService {
  // --- Safe caching to avoid circular JSON ---
  static _safeValue(value) {
    // Remove circular properties like timers and functions
    if (value && typeof value === "object") {
      const copy = { ...value };
      
      // Remove timer properties that cause circular references
      const timerProperties = [
        "timer", "turnTimer", "countdownInterval", "_timer", 
        "_interval", "timeout", "_timeout", "gameTimer"
      ];
      
      timerProperties.forEach(prop => {
        if (prop in copy) delete copy[prop];
      });
      
      // Also handle nested objects (like players array)
      if (copy.players && Array.isArray(copy.players)) {
        copy.players = copy.players.map(player => {
          const playerCopy = { ...player };
          timerProperties.forEach(prop => {
            if (prop in playerCopy) delete playerCopy[prop];
          });
          return playerCopy;
        });
      }
      
      return copy;
    }
    return value;
  }

  // --- Set value in Redis ---
  static async set(key, value, ttlSeconds = 3600) {
    try {
      const safeValue = CacheService._safeValue(value);
      await redis.set(key, JSON.stringify(safeValue), "EX", ttlSeconds);
      console.log(`💾 [Cache SET] ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      console.error("❌ Redis set error:", error);
    }
  }

  // --- Get value from Redis ---
  static async get(key) {
    try {
      const data = await redis.get(key);
      if (data) {
        console.log(`📖 [Cache GET] ${key} - Found`);
        return JSON.parse(data);
      } else {
        console.log(`📖 [Cache GET] ${key} - Not found`);
        return null;
      }
    } catch (error) {
      console.error("❌ Redis get error:", error);
      return null;
    }
  }

  // --- Delete key ---
  static async del(key) {
    try {
      await redis.del(key);
      console.log(`🗑️ [Cache DEL] ${key}`);
    } catch (error) {
      console.error("❌ Redis delete error:", error);
    }
  }

  // --- Flush all keys ---
  static async flush() {
    try {
      await redis.flushall();
      console.log("🧹 [Cache FLUSH] All keys cleared");
    } catch (error) {
      console.error("❌ Redis flush error:", error);
    }
  }

  // --- Get keys by pattern ---
  static async getKeys(pattern) {
    try {
      const keys = await redis.keys(pattern);
      console.log(`🔍 [Cache KEYS] ${pattern} - Found ${keys.length} keys`);
      return keys;
    } catch (error) {
      console.error("❌ Redis getKeys error:", error);
      return [];
    }
  }

  // --- Check if key exists ---
  static async exists(key) {
    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error("❌ Redis exists error:", error);
      return false;
    }
  }

  // --- Get TTL for key ---
  static async ttl(key) {
    try {
      return await redis.ttl(key);
    } catch (error) {
      console.error("❌ Redis TTL error:", error);
      return -2; // Key doesn't exist
    }
  }
}

module.exports = CacheService;
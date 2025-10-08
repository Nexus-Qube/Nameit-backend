const redis = require("../config/redisClient.js");

class CacheService {
  // --- Safe caching to avoid circular JSON ---
  static _safeValue(value) {
    // Remove circular properties like timers
    if (value && typeof value === "object") {
      const copy = { ...value };
      if ("timer" in copy) delete copy.timer;
      if ("turnTimer" in copy) delete copy.turnTimer;
      if ("countdownInterval" in copy) delete copy.countdownInterval;
      return copy;
    }
    return value;
  }

  // --- Set value in Redis ---
  static async set(key, value, ttlSeconds = 300) {
    try {
      const safeValue = CacheService._safeValue(value);
      await redis.set(key, JSON.stringify(safeValue), "EX", ttlSeconds);
    } catch (error) {
      console.error("Redis set error:", error);
    }
  }

  // --- Get value from Redis ---
  static async get(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Redis get error:", error);
      return null;
    }
  }

  // --- Delete key ---
  static async del(key) {
    try {
      await redis.del(key);
    } catch (error) {
      console.error("Redis delete error:", error);
    }
  }

  // --- Flush all keys ---
  static async flush() {
    try {
      await redis.flushall();
    } catch (error) {
      console.error("Redis flush error:", error);
    }
  }

  // --- Get keys by pattern ---
  static async getKeys(pattern) {
    try {
      return await redis.keys(pattern);
    } catch (error) {
      console.error("Redis getKeys error:", error);
      return [];
    }
  }
}

module.exports = CacheService;
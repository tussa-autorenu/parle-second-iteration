import IORedis from "ioredis";
import { config } from "../config/env.js";

export interface Cache {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<void>;
}

export class MemoryCache implements Cache {
  private store = new Map<string, { v: string; exp: number }>();

  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.exp) {
      this.store.delete(key);
      return null;
    }
    return item.v;
  }

  async setex(key: string, ttlSeconds: number, value: string) {
    this.store.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
  }
}

export class RedisCache implements Cache {
  constructor(private redis: IORedis) {}

  async get(key: string) {
    return this.redis.get(key);
  }

  async setex(key: string, ttlSeconds: number, value: string) {
    await this.redis.setex(key, ttlSeconds, value);
  }
}

/**
 * Cache selection:
 * - If REDIS_URL is set, use Redis (shared across instances).
 * - Otherwise use in-memory (good for local dev).
 */
export function createCache(): Cache {
  if (config.redisUrl) {
    const redis = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true
    });
    // connect in background (best effort)
    redis.connect().catch(() => undefined);
    return new RedisCache(redis);
  }
  return new MemoryCache();
}

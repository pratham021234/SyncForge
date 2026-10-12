import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Do not auto-retry infinitely in disconnected local state
      lazyConnect: true,
    });

    redisInstance.on('error', (err) => {
      // Log connection warning quietly without crashing
      if (env.NODE_ENV !== 'test') {
        console.warn('Redis connection issue:', err.message);
      }
    });
  }
  return redisInstance;
}

/**
 * Health check probe for Redis
 * Pings Redis with strict timeout
 */
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  error?: string;
}> {
  try {
    const client = getRedisClient();
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis ping timeout')), env.REDIS_CONNECT_TIMEOUT_MS),
      ),
    ]);

    if (pong === 'PONG') {
      return { status: 'healthy' };
    }
    return { status: 'unhealthy', error: `Unexpected ping response: ${pong}` };
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function closeRedisClient(): Promise<void> {
  if (redisInstance) {
    try {
      await redisInstance.quit();
    } catch {
      redisInstance.disconnect();
    }
    redisInstance = null;
  }
}

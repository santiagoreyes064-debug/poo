import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisClient(url?: string): Redis {
  if (!redisClient) {
    redisClient = new Redis(url || process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redisClient;
}

/**
 * Create a separate Redis client for pub/sub subscriptions.
 */
export function createRedisSubscriber(url?: string): Redis {
  return new Redis(url || process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Nonce management
const NONCE_TTL_SECONDS = 300; // 5 minutes

export async function storeNonce(redis: Redis, walletAddress: string, nonce: string): Promise<void> {
  await redis.set(`nonce:${walletAddress}`, nonce, 'EX', NONCE_TTL_SECONDS);
}

export async function getNonce(redis: Redis, walletAddress: string): Promise<string | null> {
  return redis.get(`nonce:${walletAddress}`);
}

export async function deleteNonce(redis: Redis, walletAddress: string): Promise<void> {
  await redis.del(`nonce:${walletAddress}`);
}

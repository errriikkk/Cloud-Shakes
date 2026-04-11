import { createClient, type RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let redisUnavailable = false;

function redisEnabled(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

function getRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = process.env.REDIS_PORT || '6379';
  return `redis://${host}:${port}`;
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisUnavailable || !redisEnabled()) return null;
  if (redisClient?.isOpen) return redisClient;

  try {
    if (!redisClient) {
      redisClient = createClient({
        url: getRedisUrl(),
        socket: {
          reconnectStrategy: () => false, // keep it lightweight; no aggressive retries
        },
      });
      redisClient.on('error', () => {
        redisUnavailable = true;
      });
    }
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    return redisClient;
  } catch {
    redisUnavailable = true;
    return null;
  }
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJson(key: string, value: unknown, ttlSeconds = 20): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // cache is best-effort only
  }
}

import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;

export async function connectRedis() {
  try {
    const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    client.on('error', (err) => console.warn('Redis error (optional):', err.message));
    await client.connect();
    redisClient = client;
    console.log('✅ Redis connected');
    return client;
  } catch (err) {
    console.warn('⚠️  Redis not available — running without cache (OK for dev)');
    return null;
  }
}

export default redisClient;

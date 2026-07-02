import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;

export async function connectRedis() {
  // ถ้าปิด Redis ใน .env ให้ข้ามทันที
  if (!process.env.REDIS_URL && process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  REDIS_URL not set — skipping Redis (OK for dev)');
    return null;
  }

  try {
    const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

    // แสดง error แค่ครั้งแรก แล้วถอด listener ออกเพื่อป้องกัน spam
    let errorShown = false;
    client.on('error', (err) => {
      if (!errorShown) {
        console.warn('⚠️  Redis not available (optional) —', err.message);
        errorShown = true;
        // ถอด listener ออก และ quit client เพื่อหยุด reconnect loop
        client.removeAllListeners('error');
        client.quit().catch(() => {});
      }
    });

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

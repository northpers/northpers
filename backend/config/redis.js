const { createClient } = require('redis');

const client = createClient({
    url: process.env.REDIS_URL || 'redis://:Ue7f5kQz2TbN9mXw4RvY8HsC3LgP6JdA@127.0.0.1:6379'
});

client.on('error', (err) => {
    console.error('[Redis Error]', err.message);
});

client.on('connect', () => {
    console.log('[Redis] Connected to cache layer (before database)');
});

client.connect().catch((err) => {
    console.warn('[Redis Warning] Connect failed, running without cache:', err.message);
});

async function cachedQuery(key, ttlSeconds, fetcher) {
    if (!client.isReady) return fetcher();
    try {
        const cached = await client.get(key);
        if (cached !== null) {
            return JSON.parse(cached);
        }
        const data = await fetcher();
        await client.set(key, JSON.stringify(data), { EX: ttlSeconds });
        return data;
    } catch (err) {
        console.warn('[Redis Warning] Cache miss fallback to DB:', err.message);
        return fetcher();
    }
}

async function invalidate(...keys) {
    if (!client.isReady) return;
    try {
        await client.del(keys);
    } catch (err) {
        console.warn('[Redis Warning] Invalidate failed:', err.message);
    }
}

async function invalidateByPrefix(prefix) {
    if (!client.isReady) return;
    try {
        const keys = await client.keys(`${prefix}:*`);
        if (keys.length > 0) await client.del(keys);
    } catch (err) {
        console.warn('[Redis Warning] Invalidate prefix failed:', err.message);
    }
}

async function getCached(key) {
    if (!client.isReady) return null;
    try {
        return JSON.parse(await client.get(key));
    } catch {
        return null;
    }
}

async function setCached(key, data, ttlSeconds) {
    if (!client.isReady) return;
    try {
        await client.set(key, JSON.stringify(data), { EX: ttlSeconds });
    } catch (err) {
        console.warn('[Redis Warning] Set failed:', err.message);
    }
}

module.exports = { client, cachedQuery, invalidate, invalidateByPrefix, getCached, setCached };

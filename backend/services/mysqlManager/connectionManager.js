const mysql = require('mysql2/promise');
const crypto = require('crypto');

/**
 * Manages MySQL connections per administrator session.
 * Credentials are NEVER sent to the browser; they are stored server-side,
 * keyed by a connection profile id + session token.
 */

const pools = new Map();
const profiles = new Map();

function genId() {
  return crypto.randomBytes(16).toString('hex');
}

async function createConnection(profileId, { host, port, user, password, database, ssl }) {
  const cfg = {
    host: host || 'localhost',
    port: Number(port) || 3306,
    user,
    password,
    database: database || undefined,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 20000,
    multipleStatements: true,
  };
  if (ssl === true) {
    cfg.ssl = { rejectUnauthorized: false };
  }
  const pool = mysql.createPool(cfg);
  await pool.query('SELECT 1');
  pools.set(profileId, pool);
  return pool;
}

async function getPool(profileId) {
  const pool = pools.get(profileId);
  if (!pool) throw new Error('Tidak ada koneksi aktif. Silakan connect terlebih dahulu.');
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    pools.delete(profileId);
    throw new Error('Koneksi terputus. Silakan reconnect.');
  }
  return pool;
}

async function destroyConnection(profileId) {
  const pool = pools.get(profileId);
  if (pool) {
    await pool.end().catch(() => {});
    pools.delete(profileId);
  }
  profiles.delete(profileId);
}

function saveProfile(profileId, profile) {
  profiles.set(profileId, { ...profile, createdAt: Date.now() });
}

function getProfile(profileId) {
  return profiles.get(profileId);
}

async function testConnection({ host, port, user, password, database, ssl }) {
  const testId = 'test_' + genId();
  try {
    await createConnection(testId, { host, port, user, password, database, ssl });
    await destroyConnection(testId);
    return { success: true };
  } catch (e) {
    await destroyConnection(testId).catch(() => {});
    return { success: false, message: e.message };
  }
}

module.exports = {
  genId,
  createConnection,
  getPool,
  destroyConnection,
  saveProfile,
  getProfile,
  testConnection,
};

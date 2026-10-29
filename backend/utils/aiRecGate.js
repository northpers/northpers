const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const MAX_AGE_DAYS = Number(process.env.AI_REC_MAX_AGE_DAYS) || 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function cookieToken(req) {
  const headers = (req && req.headers) || {};
  const auth = headers.authorization;
  if (auth) {
    const parts = String(auth).split(' ');
    if (parts.length === 2 && parts[1]) return parts[1];
  }
  const raw = headers.cookie;
  if (raw) {
    const match = String(raw).match(/(?:^|;\s*)nl_jwt=([^;]*)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function isNewAccount(createdAt) {
  if (!createdAt) return true;
  const t = new Date(createdAt).getTime();
  if (isNaN(t)) return true;
  return Date.now() - t <= MAX_AGE_DAYS * DAY_MS;
}

async function aiRecAllowed(req) {
  const token = cookieToken(req);
  if (!token) return true;
  try {
    const data = jwt.verify(token, JWT_SECRET);
    if (!data || !data.id) return true;
    const [rows] = await db.execute(
      'SELECT created_at FROM user_northline WHERE id = ?',
      [data.id]
    );
    if (!rows.length) return true;
    return isNewAccount(rows[0].created_at);
  } catch (e) {
    return true;
  }
}

module.exports = { aiRecAllowed, isNewAccount, MAX_AGE_DAYS };

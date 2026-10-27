import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const attempts = new Map();

export function hashSecret(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(value, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifySecret(value, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const next = scryptSync(value, salt, 32);
  const prev = Buffer.from(hash, 'hex');
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function newId() {
  return randomBytes(12).toString('hex');
}

export function checkLoginRate(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const list = (attempts.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= 10) {
    const error = new Error('Too many login attempts. Try again later.');
    error.status = 429;
    throw error;
  }
  list.push(now);
  attempts.set(ip, list);
}

export function clearLoginRate(ip) {
  attempts.delete(ip);
}

export function createSession(db, { userId, restaurantId, branchId }) {
  const token = randomBytes(32).toString('hex');
  const id = newId();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, restaurant_id, branch_id, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  ).run(id, userId, sha256(token), restaurantId, branchId, Date.now() + SESSION_MS);
  return token;
}

export function revokeSession(db, token) {
  if (!token) return;
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(Date.now(), sha256(token));
}

export function readSession(db, token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.id AS session_id, s.user_id, s.restaurant_id, s.branch_id, s.expires_at, s.revoked_at,
            u.email, u.name, u.platform_role, m.role, m.branch_id AS membership_branch
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN memberships m ON m.user_id = s.user_id AND m.restaurant_id = s.restaurant_id
     WHERE s.token_hash = ?`
  ).get(sha256(token));
  if (!row || row.revoked_at || row.expires_at < Date.now()) return null;
  if (!row.platform_role && !row.role) return null;
  return row;
}

export function cookieHeader(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `rasoiset_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`;
}

export function clearCookieHeader() {
  return 'rasoiset_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
}

export function tokenFromRequest(req) {
  const raw = req.headers.cookie || '';
  const part = raw.split(';').map((p) => p.trim()).find((p) => p.startsWith('rasoiset_session='));
  return part ? decodeURIComponent(part.slice('rasoiset_session='.length)) : '';
}

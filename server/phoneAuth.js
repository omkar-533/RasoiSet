import { randomBytes, randomInt } from 'node:crypto';
import { hashSecret, newId, sha256, verifySecret } from './auth.js';

const OTP_MS = 10 * 60 * 1000;
const RESET_MS = 15 * 60 * 1000;
const sends = new Map();

export function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  if (!/^[6-9]\d{9}$/.test(national)) {
    const error = new Error('Enter a valid 10-digit mobile number.');
    error.status = 400;
    throw error;
  }
  return national;
}

export function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    const error = new Error('Password must be at least 8 characters.');
    error.status = 400;
    throw error;
  }
}

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    const error = new Error('Enter a valid email or leave it blank.');
    error.status = 400;
    throw error;
  }
  return value;
}

function limitSends(phone) {
  const now = Date.now();
  const recent = (sends.get(phone) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 5) {
    const error = new Error('Too many verification attempts. Try again later.');
    error.status = 429;
    throw error;
  }
  recent.push(now);
  sends.set(phone, recent);
}

export function signup(db, body) {
  const name = String(body.name || '').trim();
  const phone = normalizePhone(body.phone);
  const email = normalizeEmail(body.email);
  assertPassword(body.password);
  if (name.length < 2 || name.length > 80) {
    const error = new Error('Enter your name.');
    error.status = 400;
    throw error;
  }
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
    const error = new Error('An account with this mobile number already exists.');
    error.status = 409;
    throw error;
  }
  if (email && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }
  const now = Date.now();
  const userId = newId();
  const restaurantId = newId();
  const branchId = newId();
  db.prepare('INSERT INTO users (id, email, phone, password_hash, name, platform_role, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(
    userId,
    email,
    phone,
    hashSecret(body.password),
    name,
    now
  );
  db.prepare(
    `INSERT INTO restaurants (id, name, is_demo, timezone, currency, tax_label, default_tax, service_charge, printer_width, loyalty_percent, invoice_prefix, footer_note, created_at)
     VALUES (?, ?, 0, 'Asia/Kolkata', '₹', 'GST', 5, 0, 80, 2, 'INV', 'Thank you for dining with us!', ?)`
  ).run(restaurantId, name, now);
  db.prepare('INSERT INTO branches (id, restaurant_id, name, address, phone, gstin) VALUES (?, ?, ?, ?, ?, NULL)').run(
    branchId,
    restaurantId,
    'Main Branch',
    '',
    phone
  );
  db.prepare('INSERT INTO memberships (id, user_id, restaurant_id, branch_id, role) VALUES (?, ?, ?, NULL, ?)').run(newId(), userId, restaurantId, 'owner');
  db.prepare('INSERT INTO order_counters (branch_id, next_number) VALUES (?, 1001)').run(branchId);
  return { userId, restaurantId, branchId };
}

export function requestReset(db, phoneInput) {
  const phone = normalizePhone(phoneInput);
  const user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const error = new Error('No account uses this mobile number.');
    error.status = 404;
    throw error;
  }
  if (process.env.NODE_ENV === 'production' || process.env.SMS_API_URL) {
    const error = new Error('SMS is not connected, so this number cannot be verified yet.');
    error.status = 503;
    throw error;
  }
  limitSends(phone);
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const now = Date.now();
  db.prepare(`DELETE FROM phone_verifications WHERE phone = ? AND purpose = 'reset' AND reset_token_hash IS NULL`).run(phone);
  db.prepare(
    `INSERT INTO phone_verifications (id, phone, purpose, code_hash, expires_at, attempts, verified_at, reset_token_hash, reset_expires_at, created_at)
     VALUES (?, ?, 'reset', ?, ?, 0, NULL, NULL, NULL, ?)`
  ).run(newId(), phone, hashSecret(code), now + OTP_MS, now);
  const response = { ok: true, expiresInSeconds: OTP_MS / 1000 };
  if (process.env.NODE_ENV !== 'production' && !process.env.SMS_API_URL) {
    response.devCode = code;
    response.delivery = 'not_connected';
  }
  return response;
}

export function verifyReset(db, phoneInput, code) {
  const phone = normalizePhone(phoneInput);
  const row = db.prepare(
    `SELECT * FROM phone_verifications WHERE phone = ? AND purpose = 'reset' AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1`
  ).get(phone);
  if (!row || row.expires_at < Date.now()) {
    const error = new Error('Verification code expired. Request a new one.');
    error.status = 400;
    throw error;
  }
  if (row.attempts >= 5) {
    const error = new Error('Too many incorrect codes. Request a new one.');
    error.status = 429;
    throw error;
  }
  db.prepare('UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = ?').run(row.id);
  if (!verifySecret(String(code || '').trim(), row.code_hash)) {
    const error = new Error('Verification code is incorrect.');
    error.status = 400;
    throw error;
  }
  const resetToken = randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('UPDATE phone_verifications SET verified_at = ?, reset_token_hash = ?, reset_expires_at = ? WHERE id = ?').run(
    now,
    sha256(resetToken),
    now + RESET_MS,
    row.id
  );
  return { resetToken };
}

export function completeReset(db, phoneInput, resetToken, password) {
  const phone = normalizePhone(phoneInput);
  assertPassword(password);
  const row = db.prepare(
    `SELECT * FROM phone_verifications WHERE phone = ? AND purpose = 'reset' AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1`
  ).get(phone);
  if (!row || !row.reset_token_hash || row.reset_expires_at < Date.now() || sha256(String(resetToken || '')) !== row.reset_token_hash) {
    const error = new Error('Verification expired. Start again.');
    error.status = 400;
    throw error;
  }
  const user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const error = new Error('No account uses this mobile number.');
    error.status = 404;
    throw error;
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashSecret(password), user.id);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), user.id);
  db.prepare(`DELETE FROM phone_verifications WHERE phone = ? AND purpose = 'reset'`).run(phone);
  return user.id;
}

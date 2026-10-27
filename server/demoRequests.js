import { newId } from './auth.js';
import { normalizePhone } from './phoneAuth.js';

const INTERESTS = new Set(['general', 'starter', 'growth', 'multi-outlet']);
const attempts = new Map();

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function limit(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 8) fail(429, 'Too many demo requests. Try again later.');
  recent.push(now);
  attempts.set(ip, recent);
}

function validate(body) {
  const name = clean(body.name, 80);
  const businessName = clean(body.businessName, 80);
  const city = clean(body.city, 60);
  if (String(body.message || '').trim().length > 500) fail(400, 'Message is too long.');
  const message = clean(body.message, 500);
  const email = clean(body.email, 120).toLowerCase();
  const outlets = Number(body.outlets);
  const interest = INTERESTS.has(body.interest) ? body.interest : '';
  if (name.length < 2) fail(400, 'Enter your name.');
  if (businessName.length < 2) fail(400, 'Enter the restaurant or business name.');
  if (city.length < 2) fail(400, 'Enter the city.');
  if (!Number.isInteger(outlets) || outlets < 1 || outlets > 200) fail(400, 'Enter the number of outlets.');
  if (!interest) fail(400, 'Choose what you want to discuss.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email or leave it blank.');
  return {
    name,
    businessName,
    phone: normalizePhone(body.phone),
    email: email || null,
    city,
    outlets,
    message: message || null,
    interest,
    marketingConsent: body.marketingConsent === true ? 1 : 0,
  };
}

export function createDemoRequest(db, body, ip) {
  if (clean(body.website, 200)) {
    limit(ip || 'local');
    fail(400, 'Could not save the demo request.');
  }
  const key = clean(body.idempotencyKey, 80);
  if (key && !/^[A-Za-z0-9_-]{8,80}$/.test(key)) fail(400, 'Invalid request key.');
  if (key) {
    const existing = db.prepare('SELECT id FROM demo_requests WHERE idempotency_key = ?').get(key);
    if (existing) return { id: existing.id, replayed: true, notification: 'not_configured' };
  }
  const record = validate(body);
  limit(ip || 'local');
  const id = newId();
  try {
    db.prepare(
      `INSERT INTO demo_requests
        (id, idempotency_key, name, business_name, phone, email, city, outlets, message, interest, marketing_consent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      key || null,
      record.name,
      record.businessName,
      record.phone,
      record.email,
      record.city,
      record.outlets,
      record.message,
      record.interest,
      record.marketingConsent,
      Date.now()
    );
  } catch (error) {
    if (key && String(error.message || '').includes('UNIQUE')) {
      const existing = db.prepare('SELECT id FROM demo_requests WHERE idempotency_key = ?').get(key);
      if (existing) return { id: existing.id, replayed: true, notification: 'not_configured' };
    }
    throw error;
  }
  return { id, replayed: false, notification: 'not_configured' };
}

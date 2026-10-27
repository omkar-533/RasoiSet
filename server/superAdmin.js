import { hashSecret, newId } from './auth.js';

const PHONE = '9565182344';
const PASSWORD = 'Omkar@12345';
const NAME = 'Super Admin';

export function ensureSuperAdmin(db) {
  const existing = db.prepare('SELECT id, platform_role FROM users WHERE phone = ?').get(PHONE);
  if (existing?.platform_role === 'super_admin') return existing.id;
  const passwordHash = hashSecret(PASSWORD);
  if (existing) {
    db.prepare(`UPDATE users SET name = ?, password_hash = ?, platform_role = 'super_admin' WHERE id = ?`).run(NAME, passwordHash, existing.id);
    return existing.id;
  }
  const id = newId();
  db.prepare(
    'INSERT INTO users (id, email, phone, password_hash, name, platform_role, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?)'
  ).run(id, PHONE, passwordHash, NAME, 'super_admin', Date.now());
  return id;
}

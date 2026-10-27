import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 1_500_000;
const KEY = /^([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+\.(?:jpg|png|webp))$/;

let root = path.join(process.cwd(), 'data', 'menu-images');

export function setMenuImageRoot(dir) {
  root = dir;
  fs.mkdirSync(root, { recursive: true });
}

export function detectImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > MAX_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) {
    return { ext: 'jpg', type: 'image/jpeg' };
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.subarray(0, 8).equals(png) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    return { ext: 'png', type: 'image/png' };
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
    return { ext: 'webp', type: 'image/webp' };
  }
  return null;
}

export function declaredType(header) {
  const value = String(header || '').split(';')[0].trim().toLowerCase();
  if (value === 'image/jpg' || value === 'image/jpeg') return 'image/jpeg';
  if (value === 'image/png' || value === 'image/webp') return value;
  return '';
}

export function saveMenuImage(restaurantId, bytes) {
  const kind = detectImage(bytes);
  if (!kind) {
    const error = new Error('Use a JPEG, PNG or WebP image of 1.5 MB or smaller.');
    error.status = 400;
    throw error;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(restaurantId)) {
    const error = new Error('Restaurant not found.');
    error.status = 404;
    throw error;
  }
  const name = `${randomBytes(16).toString('hex')}.${kind.ext}`;
  const dir = path.join(root, restaurantId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), bytes);
  return { key: `${restaurantId}/${name}`, type: kind.type };
}

export function deleteMenuImageKey(key) {
  const match = KEY.exec(String(key || ''));
  if (!match) return;
  const full = path.resolve(root, match[1], match[2]);
  const base = path.resolve(root, match[1]);
  if (full !== base && !full.startsWith(`${base}${path.sep}`)) return;
  fs.rmSync(full, { force: true });
}

export function readMenuImage(restaurantId, filename) {
  if (restaurantId.includes('..') || filename.includes('..')) return null;
  const key = `${restaurantId}/${filename}`;
  if (!KEY.test(key)) return null;
  const full = path.resolve(root, restaurantId, filename);
  const base = path.resolve(root, restaurantId);
  if (!full.startsWith(`${base}${path.sep}`)) return null;
  if (!fs.existsSync(full)) return null;
  const ext = filename.slice(filename.lastIndexOf('.') + 1);
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { body: fs.readFileSync(full), type };
}

export function imagePath(key) {
  return KEY.test(String(key || '')) ? `/api/menu-images/${key}` : undefined;
}

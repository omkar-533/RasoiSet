import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performAction, markPrintOpened } from './actions.js';
import {
  checkLoginRate,
  clearCookieHeader,
  clearLoginRate,
  cookieHeader,
  createSession,
  readSession,
  revokeSession,
  tokenFromRequest,
  verifySecret,
} from './auth.js';
import { createDemoRequest } from './demoRequests.js';
import { openDatabase, transaction } from './db.js';
import { deleteMenuImageKey, declaredType, detectImage, readMenuImage, saveMenuImage, setMenuImageRoot } from './menuImages.js';
import { assertPermission, permissionsFor } from './permissions.js';
import { completeReset, normalizePhone, requestReset, signup, verifyReset } from './phoneAuth.js';
import { seedIfEmpty } from './seedDemo.js';
import { ensureSuperAdmin } from './superAdmin.js';
import {
  acknowledgeCancellation,
  activateConnection,
  actOnOrder,
  channelSnapshot,
  disableConnection,
  drainWaiting,
  itemMaps,
  previewMenu,
  purgeOldEvents,
  receiveUrbanpiper,
  receiveZomato,
  requestAvailability,
  retryPrint,
  saveItemMap,
  saveOutlet,
  simulateOrder,
  validateConnection,
} from './channels.js';
import { buildContext, loadWorkspace } from './workspace.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const SERVE_STATIC = process.env.NODE_ENV === 'production' && existsSync(path.join(DIST_DIR, 'index.html'));

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5181,http://127.0.0.1:5181')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}

function tryStatic(req, res, url) {
  if (!SERVE_STATIC || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  if (url.pathname.startsWith('/api')) return false;
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(DIST_DIR, safe);
  if (!filePath.startsWith(DIST_DIR)) {
    send(res, 403, { error: 'Forbidden.' });
    return true;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
    } else {
      sendFile(res, filePath);
    }
    return true;
  }
  const index = path.join(DIST_DIR, 'index.html');
  if (existsSync(index) && !path.extname(url.pathname)) {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end();
    } else {
      sendFile(res, index);
    }
    return true;
  }
  return false;
}

function send(res, status, body, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json; charset=utf-8', ...extraHeaders };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readBytes(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) {
      const error = new Error('Image must be 1.5 MB or smaller.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      const error = new Error('Payload too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON.');
    error.status = 400;
    throw error;
  }
}

function openSession(db, userId) {
  const user = db.prepare('SELECT platform_role FROM users WHERE id = ?').get(userId);
  if (user?.platform_role === 'super_admin') {
    const restaurant = db.prepare('SELECT id FROM restaurants ORDER BY is_demo DESC, created_at ASC LIMIT 1').get();
    if (!restaurant) {
      const error = new Error('No restaurant exists yet.');
      error.status = 403;
      throw error;
    }
    const branch = db.prepare('SELECT id FROM branches WHERE restaurant_id = ? ORDER BY name LIMIT 1').get(restaurant.id);
    if (!branch) {
      const error = new Error('This restaurant has no branch yet.');
      error.status = 403;
      throw error;
    }
    return createSession(db, { userId, restaurantId: restaurant.id, branchId: branch.id });
  }
  const membership = db.prepare('SELECT * FROM memberships WHERE user_id = ? ORDER BY restaurant_id LIMIT 1').get(userId);
  if (!membership) {
    const error = new Error('This account is not a member of a restaurant.');
    error.status = 403;
    throw error;
  }
  const branch = membership.branch_id
    ? db.prepare('SELECT id FROM branches WHERE id = ? AND restaurant_id = ?').get(membership.branch_id, membership.restaurant_id)
    : db.prepare('SELECT id FROM branches WHERE restaurant_id = ? ORDER BY name LIMIT 1').get(membership.restaurant_id);
  if (!branch) {
    const error = new Error('This restaurant has no branch yet.');
    error.status = 403;
    throw error;
  }
  return createSession(db, { userId, restaurantId: membership.restaurant_id, branchId: branch.id });
}

function contextFromSession(db, session) {
  const ctx = buildContext(db, session);
  ctx.sessionId = session.session_id;
  ctx.platformRole = session.platform_role || null;
  if (ctx.platformRole === 'super_admin') {
    ctx.role = 'super_admin';
    ctx.membershipBranch = null;
    ctx.branches = db.prepare('SELECT * FROM branches WHERE restaurant_id = ? ORDER BY name').all(session.restaurant_id);
    ctx.permissions = permissionsFor('owner');
  } else {
    ctx.permissions = permissionsFor(session.role);
  }
  return ctx;
}

function currentSession(db, req) {
  const session = readSession(db, tokenFromRequest(req));
  if (!session?.restaurant_id) return null;
  return contextFromSession(db, session);
}

export function createApp(db) {
  return async function app(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const origin = req.headers.origin;
        if (origin && !ALLOWED_ORIGINS.includes(origin)) {
          send(res, 403, { error: 'Origin is not allowed.' });
          return;
        }
      }
      if (req.method === 'GET' && url.pathname === '/api/health') {
        send(res, 200, { ok: true, service: 'rasoiset' });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/demo-requests') {
        const body = await readBody(req);
        const saved = createDemoRequest(db, body || {}, req.socket.remoteAddress || 'local');
        send(res, saved.replayed ? 200 : 201, { ok: true, id: saved.id, replayed: saved.replayed, notification: saved.notification });
        return;
      }
      const urbanpiperMatch = url.pathname.match(/^\/api\/channels\/urbanpiper\/(order|status|rider)$/);
      if (req.method === 'POST' && urbanpiperMatch) {
        const body = await readBody(req);
        const result = receiveUrbanpiper(db, urbanpiperMatch[1], body || {}, req.headers.authorization);
        send(res, result.status, result.body);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/channels/zomato/order') {
        const body = await readBody(req);
        receiveZomato(db, body || {}, req.headers['x-zomato-token']);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const ip = req.socket.remoteAddress || 'local';
        checkLoginRate(ip);
        const body = await readBody(req);
        const phone = normalizePhone(body.phone);
        const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
        if (!user || !verifySecret(String(body.password || ''), user.password_hash)) {
          send(res, 401, { error: 'Mobile number or password is incorrect.' });
          return;
        }
        clearLoginRate(ip);
        const token = openSession(db, user.id);
        send(res, 200, { ok: true }, { 'set-cookie': cookieHeader(token) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
        const body = await readBody(req);
        const created = transaction(db, () => signup(db, body));
        const token = openSession(db, created.userId);
        send(res, 201, { ok: true }, { 'set-cookie': cookieHeader(token) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/forgot/start') {
        const body = await readBody(req);
        send(res, 200, requestReset(db, body.phone));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/forgot/verify') {
        const body = await readBody(req);
        send(res, 200, verifyReset(db, body.phone, body.code));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/forgot/reset') {
        const body = await readBody(req);
        transaction(db, () => completeReset(db, body.phone, body.resetToken, body.password));
        send(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        revokeSession(db, tokenFromRequest(req));
        send(res, 200, { ok: true }, { 'set-cookie': clearCookieHeader() });
        return;
      }

      const ctx = currentSession(db, req);
      if (!ctx) {
        send(res, 401, { error: 'Sign in required.' });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/auth/me') {
        send(res, 200, { session: loadWorkspace(db, ctx).session, permissions: ctx.permissions });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/workspace') {
        send(res, 200, { workspace: loadWorkspace(db, ctx) });
        return;
      }
      const imageMatch = url.pathname.match(/^\/api\/menu-images\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+\.(?:jpg|png|webp))$/);
      if (req.method === 'GET' && imageMatch) {
        if (imageMatch[1] !== ctx.restaurantId) {
          send(res, 404, { error: 'Image not found.' });
          return;
        }
        const file = readMenuImage(imageMatch[1], imageMatch[2]);
        if (!file) {
          send(res, 404, { error: 'Image not found.' });
          return;
        }
        res.writeHead(200, {
          'content-type': file.type,
          'content-length': file.body.length,
          'cache-control': 'private, max-age=3600',
          'x-content-type-options': 'nosniff',
        });
        res.end(file.body);
        return;
      }
      const uploadMatch = url.pathname.match(/^\/api\/menu-items\/([A-Za-z0-9_-]+)\/image$/);
      if (uploadMatch && (req.method === 'POST' || req.method === 'DELETE')) {
        assertPermission(ctx, 'menu.write');
        const item = db.prepare('SELECT id, image_key FROM menu_items WHERE id = ? AND restaurant_id = ?').get(uploadMatch[1], ctx.restaurantId);
        if (!item) {
          send(res, 404, { error: 'Item not found.' });
          return;
        }
        if (req.method === 'DELETE') {
          transaction(db, () => {
            db.prepare('UPDATE menu_items SET image_key = NULL WHERE id = ? AND restaurant_id = ?').run(item.id, ctx.restaurantId);
          });
          deleteMenuImageKey(item.image_key);
          send(res, 200, { workspace: loadWorkspace(db, ctx) });
          return;
        }
        const declared = declaredType(req.headers['content-type']);
        const bytes = await readBytes(req, 1_500_000);
        const detected = detectImage(bytes);
        if (!declared || !detected || declared !== detected.type) {
          send(res, 400, { error: 'Use a JPEG, PNG or WebP image. The file content must match its type.' });
          return;
        }
        const saved = saveMenuImage(ctx.restaurantId, bytes);
        try {
          transaction(db, () => {
            db.prepare('UPDATE menu_items SET image_key = ? WHERE id = ? AND restaurant_id = ?').run(saved.key, item.id, ctx.restaurantId);
          });
        } catch (error) {
          deleteMenuImageKey(saved.key);
          throw error;
        }
        if (item.image_key && item.image_key !== saved.key) deleteMenuImageKey(item.image_key);
        send(res, 200, { workspace: loadWorkspace(db, ctx), image: `/api/menu-images/${saved.key}` });
        return;
      }
      const printMatch = url.pathname.match(/^\/api\/print-jobs\/([^/]+)\/browser$/);
      if (req.method === 'POST' && printMatch) {
        const job = markPrintOpened(db, ctx, printMatch[1]);
        send(res, 200, { job });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/channels') {
        send(res, 200, channelSnapshot(db, ctx));
        return;
      }
      const channelAction = url.pathname.match(/^\/api\/channels\/(zomato|swiggy)\/(outlet|validate|disable|activate|preview|items)$/);
      if (channelAction) {
        const channel = channelAction[1];
        const action = channelAction[2];
        if (req.method === 'GET' && action === 'items') {
          send(res, 200, { items: itemMaps(db, ctx, channel) });
          return;
        }
        if (req.method !== 'POST') {
          send(res, 405, { error: 'Method not allowed.' });
          return;
        }
        const body = await readBody(req);
        if (action === 'outlet') send(res, 200, { connection: transaction(db, () => saveOutlet(db, ctx, channel, body.externalOutletId)) });
        else if (action === 'validate') send(res, 200, await validateConnection(db, ctx, channel));
        else if (action === 'disable') send(res, 200, { connection: transaction(db, () => disableConnection(db, ctx, channel)) });
        else if (action === 'activate') send(res, 200, { connection: transaction(db, () => activateConnection(db, ctx, channel)) });
        else send(res, 200, { preview: transaction(db, () => previewMenu(db, ctx, channel)) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/channels/item-map') {
        const body = await readBody(req);
        send(res, 200, transaction(db, () => saveItemMap(db, ctx, body || {})));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/channels/availability') {
        const body = await readBody(req);
        send(res, 200, transaction(db, () => requestAvailability(db, ctx, body || {})));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/channels/simulate') {
        const body = await readBody(req);
        const result = transaction(db, () => simulateOrder(db, ctx, body || {}));
        send(res, 200, result);
        return;
      }
      const onlineAction = url.pathname.match(/^\/api\/channels\/orders\/([A-Za-z0-9_-]+)\/(accept|reject|ready|kitchen-ack|retry-print)$/);
      if (req.method === 'POST' && onlineAction) {
        const body = await readBody(req);
        if (onlineAction[2] === 'kitchen-ack') {
          send(res, 200, transaction(db, () => acknowledgeCancellation(db, ctx, onlineAction[1])));
          return;
        }
        if (onlineAction[2] === 'retry-print') {
          send(res, 200, transaction(db, () => retryPrint(db, ctx, onlineAction[1])));
          return;
        }
        const order = await actOnOrder(db, ctx, onlineAction[1], onlineAction[2], body || {});
        send(res, 200, { order, workspace: loadWorkspace(db, ctx) });
        return;
      }
      const actionMatch = url.pathname.match(/^\/api\/actions\/([a-zA-Z]+)$/);
      if (req.method === 'POST' && actionMatch) {
        const body = await readBody(req);
        const result = transaction(db, () => performAction(db, ctx, actionMatch[1], body || {}));
        const fresh = result.reload ? contextFromSession(db, readSession(db, tokenFromRequest(req))) : ctx;
        const workspace = loadWorkspace(db, fresh);
        const found = result.orderId ? workspace.orders.find((o) => o.id === result.orderId) : null;
        const order = found ? { ...found, printJobId: result.printJobId || null } : null;
        const customer = result.customerId ? workspace.customers.find((c) => c.id === result.customerId) || null : null;
        send(res, 200, {
          workspace,
          order,
          customer,
          printJobId: result.printJobId || null,
          replayed: !!result.replayed,
          deltaItemIds: result.deltaItemIds || null,
          importPreview: result.importPreview || null,
          imported: result.imported ?? null,
          skipped: result.skipped ?? null,
          expectedCash: result.expectedCash ?? null,
          countedCash: result.countedCash ?? null,
        });
        return;
      }
      if (tryStatic(req, res, url)) return;
      send(res, 404, { error: 'Not found.' });
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error(error);
      send(res, status, { error: status === 500 ? 'Something went wrong.' : error.message, code: error.code });
    }
  };
}

export function start({ dbPath, port = 0 } = {}) {
  const file = dbPath || process.env.RASOISET_DB || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'rasoiset.sqlite');
  const db = openDatabase(file);
  setMenuImageRoot(path.join(path.dirname(file), 'menu-images'));
  seedIfEmpty(db);
  ensureSuperAdmin(db);
  purgeOldEvents(db);
  drainWaiting(db);
  const server = createServer(createApp(db));
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({ server, db, port: address.port, host });
    });
  });
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  const port = Number(process.env.PORT || 5182);
  start({ port }).then(({ port: bound, host }) => {
    const label = host === '0.0.0.0' ? 'all interfaces' : host;
    console.log(`RasoiSet listening on http://${label}:${bound}${SERVE_STATIC ? ' (UI + API)' : ' (API only)'}`);
  });
}

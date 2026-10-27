import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { drainWaiting } from './channels.js';
import { start } from './index.js';
import { setChannelFetch } from './urbanpiper.js';

async function login(base, phone, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  assert.equal(res.status, 200);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function authed(base, cookie, method, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function relay(id, state, extras = {}, items) {
  return {
    order: {
      details: {
        id,
        order_state: state,
        order_subtotal: 280,
        discount: 0,
        total_taxes: 14,
        payable_amount: 294,
        instructions: 'Less spicy',
        charges: [{ title: 'Packaging Charge', value: 0 }, { title: 'Delivery Charge', value: 40 }],
        ext_platforms: [{ kind: 'food_aggregator', name: 'Swiggy', delivery_type: 'partner', extras }],
      },
      items: items || [{ merchant_id: 'paneer-ext', title: 'Paneer Tikka', quantity: 1, price: 280, options_to_add: [{ title: 'Extra mint', price: 10 }] }],
      store: { merchant_ref_id: 'SWG1', name: 'Main' },
      payment: [{ option: 'online', amount: 294 }],
    },
  };
}

test('aggregator channel flow stays isolated from live providers', async (t) => {
  const previous = { ...process.env };
  process.env.DEMO_OWNER_PASSWORD = 'owner-pass';
  process.env.DEMO_WAITER_PASSWORD = 'waiter-pass';
  process.env.DEMO_OTHER_PASSWORD = 'other-pass';
  process.env.URBANPIPER_WEBHOOK_TOKEN = 'hook-token';
  process.env.ZOMATO_WEBHOOK_TOKEN = 'zomato-token';
  delete process.env.URBANPIPER_API_USERNAME;
  delete process.env.URBANPIPER_API_KEY;
  delete process.env.URBANPIPER_BIZ_ID;
  delete process.env.URBANPIPER_ALLOW_LIVE;
  const dir = await mkdtemp(path.join(tmpdir(), 'rasoiset-channel-'));
  const started = await start({ dbPath: path.join(dir, 'test.sqlite'), port: 0 });
  const base = `http://127.0.0.1:${started.port}`;
  const calls = [];
  setChannelFetch(async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('timeout-order')) {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    }
    return { status: 200, text: async () => JSON.stringify({ status: 'success' }) };
  });
  t.after(async () => {
    setChannelFetch(globalThis.fetch);
    process.env = previous;
    await new Promise((resolve) => started.server.close(resolve));
    started.db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const owner = await login(base, '9000000001', 'owner-pass');
  const other = await login(base, '9000000003', 'other-pass');
  const workspace = await authed(base, owner, 'GET', '/api/workspace');
  const paneer = workspace.data.workspace.menu.find((item) => item.name === 'Paneer Tikka');
  const stockBefore = workspace.data.workspace.ingredients.find((item) => item.name === 'Paneer').stock;

  const anonymous = await fetch(`${base}/api/channels/urbanpiper/order`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(anonymous.status, 401);
  const zomatoRejected = await fetch(`${base}/api/channels/zomato/order`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-zomato-token': 'wrong' }, body: '{"order":{"order_id":1}}' });
  assert.equal(zomatoRejected.status, 401);
  const zomatoStored = await fetch(`${base}/api/channels/zomato/order`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-zomato-token': 'zomato-token' }, body: '{"order":{"order_id":55,"customer":{"phone":"9999999999"}}}' });
  assert.equal(zomatoStored.status, 503);
  assert.equal(started.db.prepare("SELECT COUNT(*) AS n FROM channel_orders WHERE channel = 'zomato'").get().n, 0);
  assert.equal(started.db.prepare("SELECT redacted_json FROM channel_events WHERE transport = 'zomato_direct'").get().redacted_json.includes('9999999999'), false);

  const unknown = await fetch(`${base}/api/channels/urbanpiper/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify(relay(7001, 'Placed')),
  });
  assert.equal(unknown.status, 200);
  assert.equal(started.db.prepare("SELECT status FROM channel_events WHERE dedupe_key LIKE '%7001%'").get().status, 'quarantined');
  assert.equal(started.db.prepare("SELECT COUNT(*) AS n FROM channel_orders WHERE external_order_id = '7001'").get().n, 0);

  const mapped = await authed(base, owner, 'POST', '/api/channels/swiggy/outlet', { externalOutletId: 'SWG1' });
  assert.equal(mapped.status, 200);
  const clash = await authed(base, other, 'POST', '/api/channels/swiggy/outlet', { externalOutletId: 'SWG1' });
  assert.equal(clash.status, 409);
  const savedMap = await authed(base, owner, 'POST', '/api/channels/item-map', { channel: 'swiggy', menuItemId: paneer.id, externalItemId: 'paneer-ext', channelPrice: 310 });
  assert.equal(savedMap.status, 200);
  assert.equal(started.db.prepare('SELECT price_paise FROM menu_items WHERE id = ?').get(paneer.id).price_paise, 28000);

  const first = await fetch(`${base}/api/channels/urbanpiper/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify(relay(7002, 'Placed', { can_reject_order: true }, [
      { merchant_id: 'paneer-ext', title: 'Paneer Tikka', quantity: 1, price: 280, options_to_add: [{ title: 'Extra mint', price: 10 }] },
      { merchant_id: 'not-on-menu', title: 'Mystery dish', quantity: 1, price: 50 },
    ])),
  });
  assert.equal(first.status, 200);
  const replay = await fetch(`${base}/api/channels/urbanpiper/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify(relay(7002, 'Placed')),
  });
  const replayBody = await replay.json();
  assert.equal(replayBody.duplicate, true);
  const placed = started.db.prepare("SELECT * FROM channel_orders WHERE external_order_id = '7002'").get();
  assert.equal(placed.unmapped_count, 1);
  assert.equal(placed.order_id, null);
  assert.equal(started.db.prepare('SELECT stock FROM ingredients WHERE name = ? AND restaurant_id = ?').get('Paneer', placed.restaurant_id).stock, stockBefore);
  assert.equal(JSON.parse(started.db.prepare('SELECT modifiers_json FROM channel_lines WHERE channel_order_id = ? AND external_item_id = ?').get(placed.id, 'paneer-ext').modifiers_json)[0].name, 'Extra mint');

  await fetch(`${base}/api/channels/urbanpiper/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify({ order_id: 7003, new_state: 'Cancelled', store_id: 'SWG1', timestamp_unix: 10, message: 'Customer cancelled' }),
  });
  await fetch(`${base}/api/channels/urbanpiper/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify(relay(7003, 'Acknowledged', { can_reject_order: false })),
  });
  drainWaiting(started.db);
  const raced = started.db.prepare("SELECT * FROM channel_orders WHERE external_order_id = '7003'").get();
  assert.equal(raced.fulfilment_state, 'cancelled');
  await fetch(`${base}/api/channels/urbanpiper/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify({ order_id: 7003, new_state: 'Placed', store_id: 'SWG1', timestamp_unix: 11 }),
  });
  assert.equal(started.db.prepare("SELECT provider_state FROM channel_orders WHERE external_order_id = '7003'").get().provider_state, 'cancelled');

  process.env.URBANPIPER_API_USERNAME = 'user';
  process.env.URBANPIPER_API_KEY = 'secret-key';
  process.env.URBANPIPER_BIZ_ID = 'biz';
  const accepted = await authed(base, owner, 'POST', `/api/channels/orders/${placed.id}/accept`);
  assert.equal(accepted.status, 200);
  const again = await authed(base, owner, 'POST', `/api/channels/orders/${placed.id}/accept`);
  assert.equal(again.status, 200);
  assert.equal(calls.filter((call) => String(call.url).includes('/status/')).length, 1);
  const kitchen = started.db.prepare('SELECT * FROM orders WHERE id = ?').get(placed.id ? started.db.prepare("SELECT order_id FROM channel_orders WHERE id = ?").get(placed.id).order_id : '');
  assert.equal(kitchen.channel, 'swiggy');
  assert.equal(kitchen.payment, 'channel');
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM print_jobs WHERE order_id = ?').get(kitchen.id).n, 1);
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM payments WHERE order_id = ?').get(kitchen.id).n, 0);
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE ref_id = ?').get(kitchen.id).n, 1);
  const blockedPay = await authed(base, owner, 'POST', '/api/actions/payOrder', { id: kitchen.id, version: kitchen.version, method: 'cash' });
  assert.equal(blockedPay.status, 409);
  const foreign = await authed(base, other, 'POST', `/api/channels/orders/${placed.id}/ready`);
  assert.equal(foreign.status, 404);

  const timeoutRelay = await fetch(`${base}/api/channels/urbanpiper/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify(relay('timeout-order', 'Placed', { can_reject_order: true })),
  });
  assert.equal(timeoutRelay.status, 200);
  const timeoutOrder = started.db.prepare("SELECT id FROM channel_orders WHERE external_order_id = 'timeout-order'").get();
  const timed = await authed(base, owner, 'POST', `/api/channels/orders/${timeoutOrder.id}/accept`);
  assert.equal(timed.status, 504);
  const callsAfterTimeout = calls.length;
  const secondTimeout = await authed(base, owner, 'POST', `/api/channels/orders/${timeoutOrder.id}/accept`);
  assert.equal(secondTimeout.status, 409);
  assert.equal(calls.length, callsAfterTimeout);
  assert.equal(started.db.prepare("SELECT order_id FROM channel_orders WHERE id = ?").get(timeoutOrder.id).order_id, null);

  const cannotReject = await fetch(`${base}/api/channels/urbanpiper/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify(relay(7004, 'Placed', { can_reject_order: false })),
  });
  assert.equal(cannotReject.status, 200);
  const noReject = started.db.prepare("SELECT id FROM channel_orders WHERE external_order_id = '7004'").get();
  const blockedReject = await authed(base, owner, 'POST', `/api/channels/orders/${noReject.id}/reject`, { reasonCode: 'item_out_of_stock' });
  assert.equal(blockedReject.status, 409);
  const stockAfter = started.db.prepare('SELECT stock FROM ingredients WHERE name = ? AND restaurant_id = ?').get('Paneer', placed.restaurant_id).stock;
  await fetch(`${base}/api/channels/urbanpiper/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer hook-token' },
    body: JSON.stringify({ order_id: 7002, new_state: 'Cancelled', store_id: 'SWG1', timestamp_unix: 12, message: 'Store cancelled' }),
  });
  assert.equal(started.db.prepare('SELECT stock FROM ingredients WHERE name = ? AND restaurant_id = ?').get('Paneer', placed.restaurant_id).stock, stockAfter);
  assert.equal(started.db.prepare('SELECT channel_alert FROM orders WHERE id = ?').get(kitchen.id).channel_alert, 'cancel');

  started.db.prepare("UPDATE print_jobs SET status = 'failed' WHERE order_id = ?").run(kitchen.id);
  started.db.prepare("UPDATE channel_orders SET print_status = 'failed' WHERE order_id = ?").run(kitchen.id);
  const retried = await authed(base, owner, 'POST', `/api/channels/orders/${placed.id}/retry-print`);
  assert.equal(retried.status, 200);
  assert.equal(started.db.prepare('SELECT status FROM print_jobs WHERE order_id = ?').get(kitchen.id).status, 'created');
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM orders WHERE id = ?').get(kitchen.id).n, 1);

  const preview = await authed(base, owner, 'POST', '/api/channels/swiggy/preview');
  assert.equal(preview.data.preview.sent, false);
  const availability = await authed(base, owner, 'POST', '/api/channels/availability', { channel: 'swiggy', menuItemId: paneer.id, available: false });
  assert.equal(availability.data.sent, false);
  assert.equal(availability.data.confirmed, false);
  assert.equal(started.db.prepare('SELECT available FROM menu_items WHERE id = ?').get(paneer.id).available, 1);
  assert.equal(calls.some((call) => String(call.url).includes('inventory') || String(call.url).includes('catalogue')), false);

  const opened = await authed(base, owner, 'POST', '/api/actions/openShift', { openingCash: 200 });
  assert.equal(opened.status, 200);
  const closed = await authed(base, owner, 'POST', '/api/actions/closeShift', { countedCash: 200 });
  assert.equal(closed.data.expectedCash, 200);

  const snapshot = await authed(base, owner, 'GET', '/api/channels');
  assert.equal(JSON.stringify(snapshot.data).includes('secret-key'), false);
  assert.equal(snapshot.data.connections.find((item) => item.channel === 'zomato').status, 'awaiting_provider_approval');
  const dineIn = await authed(base, owner, 'POST', '/api/actions/placeOrder', {
    idempotencyKey: 'channel-dine-in',
    payment: 'cash',
    type: 'dine-in',
    discount: 0,
    lines: [{ menuItemId: paneer.id, qty: 1 }],
  });
  assert.equal(dineIn.status, 200);
  assert.equal(dineIn.data.order.payment, 'cash');
  const zomatoLive = await authed(base, owner, 'POST', '/api/channels/zomato/validate');
  assert.equal(zomatoLive.status, 409);
});

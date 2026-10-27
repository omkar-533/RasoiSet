import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { start } from './index.js';

async function login(base, phone, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  assert.equal(res.status, 200, await res.text());
  return cookie.split(';')[0];
}

async function authed(base, cookie, method, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

test('tenant isolation, permissions, idempotency and stock', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rasoiset-'));
  process.env.DEMO_OWNER_PASSWORD = 'owner-pass';
  process.env.DEMO_WAITER_PASSWORD = 'waiter-pass';
  process.env.DEMO_OTHER_PASSWORD = 'other-pass';
  const started = await start({ dbPath: path.join(dir, 'test.sqlite'), port: 0 });
  const base = `http://127.0.0.1:${started.port}`;
  t.after(async () => {
    await new Promise((resolve) => started.server.close(resolve));
    started.db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const owner = await login(base, '9000000001', 'owner-pass');
  const other = await login(base, '9000000003', 'other-pass');
  const waiter = await login(base, '9000000002', 'waiter-pass');

  const ownerWs = await authed(base, owner, 'GET', '/api/workspace');
  const otherWs = await authed(base, other, 'GET', '/api/workspace');
  assert.equal(ownerWs.status, 200);
  assert.equal(otherWs.data.workspace.orders.some((o) => o.id === 'rest-other-order'), true);
  assert.equal(ownerWs.data.workspace.orders.some((o) => o.id === 'rest-other-order'), false);
  assert.equal(ownerWs.data.workspace.menu.some((m) => m.name === 'Secret Dish'), false);

  const leaked = await authed(base, owner, 'POST', '/api/actions/cancelOrder', { id: 'rest-other-order', version: 1 });
  assert.equal(leaked.status, 404);

  const mall = ownerWs.data.workspace.settings.outlets.find((o) => o.name.includes('Mall'));
  const deniedBranch = await authed(base, waiter, 'POST', '/api/actions/updateSettings', { activeOutletId: mall.id });
  assert.equal(deniedBranch.status, 403);

  const paneer = ownerWs.data.workspace.menu.find((m) => m.name === 'Paneer Tikka');
  const before = ownerWs.data.workspace.ingredients.find((i) => i.name === 'Paneer').stock;
  const key = 'idem-1';
  const first = await authed(base, owner, 'POST', '/api/actions/placeOrder', {
    idempotencyKey: key,
    payment: 'cash',
    type: 'takeaway',
    discount: 0,
    lines: [{ menuItemId: paneer.id, qty: 2 }],
  });
  const second = await authed(base, owner, 'POST', '/api/actions/placeOrder', {
    idempotencyKey: key,
    payment: 'cash',
    type: 'takeaway',
    discount: 0,
    lines: [{ menuItemId: paneer.id, qty: 2 }],
  });
  assert.equal(first.status, 200);
  assert.equal(second.data.replayed, true);
  assert.equal(second.data.order.id, first.data.order.id);
  const after = second.data.workspace.ingredients.find((i) => i.name === 'Paneer').stock;
  assert.ok(Math.abs(before - after - 0.4) < 0.001);

  const kot = await authed(base, waiter, 'POST', '/api/actions/saveAsKOT', {
    idempotencyKey: 'kot-1',
    type: 'dine-in',
    tableId: ownerWs.data.workspace.tables.find((table) => table.name === 'T1').id,
    discount: 0,
    lines: [{ menuItemId: paneer.id, qty: 1 }],
  });
  assert.equal(kot.status, 200);
  const unpaid = await authed(base, waiter, 'POST', '/api/actions/payOrder', { id: kot.data.order.id, version: kot.data.order.version, method: 'cash' });
  assert.equal(unpaid.status, 403);
  const cancel = await authed(base, waiter, 'POST', '/api/actions/cancelOrder', { id: kot.data.order.id, version: kot.data.order.version });
  assert.equal(cancel.status, 403);
  const closeTable = await authed(base, owner, 'POST', '/api/actions/setTableStatus', { id: kot.data.order.tableId, status: 'free' });
  assert.equal(closeTable.status, 409);

  const stale = await authed(base, owner, 'POST', '/api/actions/updateOrderItemStatus', {
    orderId: kot.data.order.id,
    itemId: kot.data.order.items[0].id,
    status: 'preparing',
    version: kot.data.order.version + 5,
  });
  assert.equal(stale.status, 409);

  const payment = started.db.prepare('SELECT status FROM payments WHERE order_id = ?').get(first.data.order.id);
  assert.equal(payment.status, 'recorded_manual');

  const originalPrice = first.data.order.items[0].price;
  const edited = await authed(base, owner, 'POST', '/api/actions/upsertMenuItem', { ...paneer, price: paneer.price + 50 });
  assert.equal(edited.status, 200);
  const reread = await authed(base, owner, 'GET', '/api/workspace');
  const historical = reread.data.workspace.orders.find((order) => order.id === first.data.order.id);
  assert.equal(historical.items[0].price, originalPrice);
  assert.equal(reread.data.workspace.menu.find((item) => item.id === paneer.id).price, paneer.price + 50);

  const signup = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'New Owner', phone: '9876543210', email: '', password: 'signup-pass' }),
  });
  assert.equal(signup.status, 201);
  const fresh = await login(base, '9876543210', 'signup-pass');
  const freshWorkspace = await authed(base, fresh, 'GET', '/api/workspace');
  assert.equal(freshWorkspace.data.workspace.orders.length, 0);
  assert.equal(freshWorkspace.data.workspace.session.isDemo, false);

  const unknown = await fetch(`${base}/api/auth/forgot/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '9123456780' }),
  });
  assert.equal(unknown.status, 404);

  const startedReset = await fetch(`${base}/api/auth/forgot/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210' }),
  });
  const resetBody = await startedReset.json();
  assert.equal(startedReset.status, 200);
  assert.match(resetBody.devCode, /^\d{6}$/);
  const wrongCode = await fetch(`${base}/api/auth/forgot/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', code: resetBody.devCode === '111111' ? '000000' : '111111' }),
  });
  assert.equal(wrongCode.status, 400);
  const verified = await fetch(`${base}/api/auth/forgot/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', code: resetBody.devCode }),
  });
  const verifiedBody = await verified.json();
  assert.equal(verified.status, 200);
  const changed = await fetch(`${base}/api/auth/forgot/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', resetToken: verifiedBody.resetToken, password: 'new-signup-pass' }),
  });
  assert.equal(changed.status, 200);
  const oldPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '9876543210', password: 'signup-pass' }),
  });
  assert.equal(oldPassword.status, 401);
  await login(base, '9876543210', 'new-signup-pass');

  const superAdmin = await login(base, '9565182344', 'Omkar@12345');
  const adminHome = await authed(base, superAdmin, 'GET', '/api/workspace');
  assert.equal(adminHome.data.workspace.session.platformRole, 'super_admin');
  assert.equal(adminHome.data.workspace.session.restaurants.length, 3);
  const hidden = adminHome.data.workspace.orders.find((order) => order.id === 'rest-other-order');
  assert.equal(hidden, undefined);
  const otherRestaurant = adminHome.data.workspace.session.restaurants.find((restaurant) => restaurant.name.includes('Other Kitchen'));
  const switched = await authed(base, superAdmin, 'POST', '/api/actions/switchRestaurant', { restaurantId: otherRestaurant.id });
  assert.equal(switched.status, 200);
  const seen = switched.data.workspace.orders.find((order) => order.id === 'rest-other-order');
  assert.equal(seen.items[0].name, 'Secret Dish');
  const waiterBlocked = await authed(base, waiter, 'POST', '/api/actions/switchRestaurant', { restaurantId: otherRestaurant.id });
  assert.equal(waiterBlocked.status, 403);

  const beforeAdd = (await authed(base, owner, 'GET', '/api/workspace')).data.workspace.ingredients.find((item) => item.name === 'Paneer').stock;
  const added = await authed(base, waiter, 'POST', '/api/actions/addItemsToOrder', {
    idempotencyKey: 'kot-add-1',
    orderId: kot.data.order.id,
    version: kot.data.order.version,
    lines: [{ menuItemId: paneer.id, qty: 1 }],
  });
  assert.equal(added.status, 200);
  assert.equal(added.data.order.items.length, 2);
  assert.equal(added.data.deltaItemIds.length, 1);
  assert.equal(added.data.order.items.find((item) => item.id === added.data.deltaItemIds[0]).kotBatch, 2);
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM print_jobs WHERE order_id = ?').get(kot.data.order.id).n, 2);
  const replayAdd = await authed(base, waiter, 'POST', '/api/actions/addItemsToOrder', {
    idempotencyKey: 'kot-add-1',
    orderId: kot.data.order.id,
    version: kot.data.order.version,
    lines: [{ menuItemId: paneer.id, qty: 1 }],
  });
  assert.equal(replayAdd.data.replayed, true);
  assert.equal(replayAdd.data.order.items.length, 2);
  const afterAdd = added.data.workspace.ingredients.find((item) => item.name === 'Paneer').stock;
  assert.ok(Math.abs(beforeAdd - afterAdd - 0.2) < 0.001);
  assert.equal(replayAdd.data.workspace.ingredients.find((item) => item.name === 'Paneer').stock, afterAdd);

  const settled = await authed(base, owner, 'POST', '/api/actions/payOrder', {
    id: kot.data.order.id,
    version: added.data.order.version,
    method: 'cash',
  });
  assert.equal(settled.status, 200);
  const settledOrder = settled.data.workspace.orders.find((order) => order.id === kot.data.order.id);
  const lateAdd = await authed(base, waiter, 'POST', '/api/actions/addItemsToOrder', {
    orderId: kot.data.order.id,
    version: settledOrder.version,
    lines: [{ menuItemId: paneer.id, qty: 1 }],
  });
  assert.equal(lateAdd.status, 400);
  const waiterRefund = await authed(base, waiter, 'POST', '/api/actions/refundOrder', {
    id: kot.data.order.id,
    version: settledOrder.version,
    amount: 10,
    reason: 'Guest left',
  });
  assert.equal(waiterRefund.status, 403);
  const stockBeforeRefund = settled.data.workspace.ingredients.find((item) => item.name === 'Paneer').stock;
  const refunded = await authed(base, owner, 'POST', '/api/actions/refundOrder', {
    id: kot.data.order.id,
    version: settledOrder.version,
    amount: 10,
    reason: 'Guest left',
  });
  assert.equal(refunded.status, 200);
  assert.equal(refunded.data.order.refunded, 10);
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM payments WHERE order_id = ?').get(kot.data.order.id).n, 1);
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM refunds WHERE order_id = ?').get(kot.data.order.id).n, 1);
  assert.equal(refunded.data.workspace.ingredients.find((item) => item.name === 'Paneer').stock, stockBeforeRefund);
  const tooMuch = await authed(base, owner, 'POST', '/api/actions/refundOrder', {
    id: kot.data.order.id,
    version: refunded.data.order.version,
    amount: refunded.data.order.total,
    reason: 'Too much',
  });
  assert.equal(tooMuch.status, 400);

  const opened = await authed(base, owner, 'POST', '/api/actions/openShift', { openingCash: 500 });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.workspace.shift.openingCash, 500);
  const duplicateShift = await authed(base, owner, 'POST', '/api/actions/openShift', { openingCash: 100 });
  assert.equal(duplicateShift.status, 409);
  const shiftSale = await authed(base, owner, 'POST', '/api/actions/placeOrder', {
    idempotencyKey: 'shift-sale-1',
    payment: 'cash',
    type: 'takeaway',
    discount: 0,
    lines: [{ menuItemId: paneer.id, qty: 1 }],
  });
  assert.equal(shiftSale.status, 200);
  const closed = await authed(base, owner, 'POST', '/api/actions/closeShift', { countedCash: 500 + shiftSale.data.order.total });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.expectedCash, 500 + shiftSale.data.order.total);
  assert.equal(closed.data.workspace.shift, null);

  const csv = 'category,name,price,veg\nSnacks,Test Samosa,40,yes\nSnacks,Bad Row,abc,yes\n';
  const preview = await authed(base, owner, 'POST', '/api/actions/previewMenuImport', { csv });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.importPreview[1].errors.length > 0, true);
  const imported = await authed(base, owner, 'POST', '/api/actions/commitMenuImport', { csv });
  assert.equal(imported.status, 200);
  assert.equal(imported.data.imported, 1);
  assert.equal(imported.data.skipped, 1);
  assert.equal(imported.data.workspace.menu.some((item) => item.name === 'Test Samosa'), true);
  const waiterImport = await authed(base, waiter, 'POST', '/api/actions/commitMenuImport', { csv });
  assert.equal(waiterImport.status, 403);

  const signedUp = await login(base, '9876543210', 'new-signup-pass');
  const freshNow = await authed(base, signedUp, 'GET', '/api/workspace');
  assert.equal(freshNow.data.workspace.settings.plan, 'starter');
  const onlyOutlet = freshNow.data.workspace.settings.outlets[0];
  const secondOutlet = await authed(base, signedUp, 'POST', '/api/actions/updateSettings', {
    outlets: [onlyOutlet, { name: 'Second', address: 'Lane 2', phone: '9000001111' }],
  });
  assert.equal(secondOutlet.status, 403);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const target = ownerWs.data.workspace.menu.find((item) => item.name === 'Paneer Tikka');
  const uploadImage = (cookie, itemId, body, type) => fetch(`${base}/api/menu-items/${itemId}/image`, {
    method: 'POST',
    headers: { cookie, 'content-type': type },
    body,
  });
  const uploaded = await uploadImage(owner, target.id, png, 'image/png');
  const uploadedBody = await uploaded.json();
  assert.equal(uploaded.status, 200);
  assert.match(uploadedBody.image, /^\/api\/menu-images\/rest-demo\/[a-f0-9]+\.png$/);
  const stored = started.db.prepare('SELECT image_key FROM menu_items WHERE id = ?').get(target.id);
  assert.equal(uploadedBody.image, `/api/menu-images/${stored.image_key}`);
  const seenImage = uploadedBody.workspace.menu.find((item) => item.id === target.id);
  assert.equal(seenImage.image, uploadedBody.image);
  const fetched = await fetch(`${base}${uploadedBody.image}`, { headers: { cookie: owner } });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.compare(Buffer.from(await fetched.arrayBuffer()), png), 0);
  const anonymous = await fetch(`${base}${uploadedBody.image}`);
  assert.equal(anonymous.status, 401);
  const foreign = await fetch(`${base}${uploadedBody.image}`, { headers: { cookie: other } });
  assert.equal(foreign.status, 404);
  const waiterUpload = await uploadImage(waiter, target.id, png, 'image/png');
  assert.equal(waiterUpload.status, 403);
  const fake = await uploadImage(owner, target.id, Buffer.from('GIF89a and more bytes here!!'), 'image/gif');
  assert.equal(fake.status, 400);
  const mismatched = await uploadImage(owner, target.id, png, 'image/jpeg');
  assert.equal(mismatched.status, 400);
  const huge = Buffer.alloc(1_500_001, 1);
  const tooBig = await uploadImage(owner, target.id, huge, 'image/png');
  assert.equal(tooBig.status, 413);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(12, 0), Buffer.from([0xff, 0xd9])]);
  const replaced = await uploadImage(owner, target.id, jpeg, 'image/jpeg');
  const replacedBody = await replaced.json();
  assert.equal(replaced.status, 200);
  assert.notEqual(replacedBody.image, uploadedBody.image);
  const oldGone = await fetch(`${base}${uploadedBody.image}`, { headers: { cookie: owner } });
  assert.equal(oldGone.status, 404);
  const removed = await fetch(`${base}/api/menu-items/${target.id}/image`, { method: 'DELETE', headers: { cookie: owner } });
  const removedBody = await removed.json();
  assert.equal(removed.status, 200);
  assert.equal(removedBody.workspace.menu.find((item) => item.id === target.id).image, undefined);
  assert.equal(started.db.prepare('SELECT image_key FROM menu_items WHERE id = ?').get(target.id).image_key, null);
  const afterRemove = await fetch(`${base}${replacedBody.image}`, { headers: { cookie: owner } });
  assert.equal(afterRemove.status, 404);
  const extra = ownerWs.data.workspace.menu.find((item) => item.id !== target.id);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(12)]);
  webp.writeUInt32LE(webp.length - 8, 4);
  const webpUpload = await uploadImage(owner, extra.id, webp, 'image/webp');
  const webpBody = await webpUpload.json();
  assert.equal(webpUpload.status, 200);
  assert.match(webpBody.image, /\.webp$/);
  const webpFile = await fetch(`${base}${webpBody.image}`, { headers: { cookie: owner } });
  assert.equal(webpFile.status, 200);
  assert.equal(webpFile.headers.get('content-type'), 'image/webp');
  const webpRemoved = await fetch(`${base}/api/menu-items/${extra.id}/image`, { method: 'DELETE', headers: { cookie: owner } });
  assert.equal(webpRemoved.status, 200);

  const demoPayload = {
    name: 'Asha Rao',
    businessName: 'Rao Kitchen',
    phone: '9812345678',
    email: '',
    city: 'Pune',
    outlets: 2,
    interest: 'starter',
    message: 'Weekday afternoon',
    marketingConsent: false,
    idempotencyKey: 'demo-key-12345678',
  };
  const createdLead = await fetch(`${base}/api/demo-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(demoPayload),
  });
  const createdBody = await createdLead.json();
  assert.equal(createdLead.status, 201);
  assert.equal(createdBody.ok, true);
  assert.equal(createdBody.notification, 'not_configured');
  const replayedLead = await fetch(`${base}/api/demo-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(demoPayload),
  });
  const replayedBody = await replayedLead.json();
  assert.equal(replayedLead.status, 200);
  assert.equal(replayedBody.id, createdBody.id);
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM demo_requests WHERE idempotency_key = ?').get('demo-key-12345678').n, 1);
  const hiddenLeads = await fetch(`${base}/api/demo-requests`);
  assert.equal(hiddenLeads.status, 401);
  const invalidLead = await fetch(`${base}/api/demo-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...demoPayload, city: '', idempotencyKey: 'demo-key-87654321' }),
  });
  assert.equal(invalidLead.status, 400);
  const spamLead = await fetch(`${base}/api/demo-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...demoPayload, website: 'https://spam.example', idempotencyKey: 'demo-key-spam1234' }),
  });
  assert.equal(spamLead.status, 400);
  assert.equal(started.db.prepare('SELECT COUNT(*) AS n FROM demo_requests WHERE idempotency_key = ?').get('demo-key-spam1234').n, 0);
});

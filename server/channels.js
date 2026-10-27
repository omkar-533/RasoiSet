import { timingSafeEqual } from 'node:crypto';
import { newId } from './auth.js';
import { transaction } from './db.js';
import { toRupees } from './money.js';
import { assertPermission } from './permissions.js';
import { pushOrderStatus, urbanpiperConfig, validateUrbanpiper, webhookAuthorized } from './urbanpiper.js';

const CHANNELS = ['zomato', 'swiggy'];
const REASONS = ['item_out_of_stock', 'store_closed', 'store_busy', 'rider_not_available', 'out_of_delivery_radius', 'connectivity_issue', 'total_mismatch', 'invalid_item', 'option_out_of_stock', 'invalid_option', 'special_instructions', 'unspecified'];
const RANK = { placed: 1, acknowledged: 2, confirmed: 2, food_ready: 3, dispatched: 4, completed: 5, cancelled: 6 };
const SECRET_KEYS = /phone|email|address|otp|authorization|api_key|token|latitude|longitude|pin|landmark/i;

export const CAPABILITIES = {
  zomato: {
    route: 'Direct Zomato POS Integration API',
    transport: 'zomato_direct',
    docs: 'https://www.zomato.com/developer/integration/docs/overview',
    receiveOrders: 'blocked',
    accept: false,
    reject: false,
    ready: false,
    markDelivered: false,
    menuPublish: false,
    itemAvailability: false,
    outletToggle: false,
    settlement: 'unsupported',
    blocker: 'Zomato requires a POS vendor agreement, POS ID and API key. The public pages name the endpoints but do not publish the full order body, so RasoiSet does not call Zomato.',
  },
  swiggy: {
    route: 'UrbanPiper middleware',
    transport: 'urbanpiper',
    docs: 'https://api-docs.urbanpiper.com/downstream/getting-started/overview',
    receiveOrders: 'when_configured',
    accept: true,
    reject: true,
    ready: true,
    markDelivered: false,
    menuPublish: false,
    itemAvailability: false,
    outletToggle: false,
    settlement: 'manual_only',
    blocker: 'Swiggy has no public merchant POS API. UrbanPiper is the documented route. Live calls run only when the server environment has UrbanPiper credentials.',
  },
};

function fail(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function paise(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function tokensMatch(expected, received) {
  const left = String(expected || '');
  const right = String(received || '');
  if (!left || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const copy = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEYS.test(key)) copy[key] = '[redacted]';
    else copy[key] = redact(entry);
  }
  return copy;
}

function audit(db, ctx, channel, action, detail) {
  db.prepare('INSERT INTO channel_audits (id, restaurant_id, branch_id, channel, actor_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    newId(),
    ctx.restaurantId,
    ctx.branchId,
    channel,
    ctx.userId || null,
    action,
    detail ? JSON.stringify(detail).slice(0, 500) : null,
    Date.now()
  );
}

function connectionRow(db, ctx, channel) {
  return db.prepare('SELECT * FROM channel_connections WHERE restaurant_id = ? AND branch_id = ? AND channel = ?').get(ctx.restaurantId, ctx.branchId, channel);
}

function publicConnection(db, ctx, channel) {
  const spec = CAPABILITIES[channel];
  const row = connectionRow(db, ctx, channel);
  const config = urbanpiperConfig();
  const pending = db.prepare("SELECT COUNT(*) AS n FROM channel_actions WHERE restaurant_id = ? AND status IN ('pending', 'needs_reconciliation')").get(ctx.restaurantId).n;
  let status = channel === 'zomato' ? 'awaiting_provider_approval' : 'not_configured';
  if (row?.disabled_at) status = 'disconnected';
  else if (channel === 'swiggy' && config.configured && row?.external_outlet_id && row.last_check_ok && row.activated_at) status = row.last_check_ok ? 'active' : 'degraded';
  else if (channel === 'swiggy' && config.configured && row?.external_outlet_id && row.last_check_at && !row.last_check_ok) status = 'degraded';
  else if (channel === 'swiggy' && config.configured && row?.external_outlet_id) status = 'testing';
  else if (channel === 'swiggy' && config.configured) status = 'outlet_mapping_pending';
  else if (channel === 'swiggy' && row?.external_outlet_id) status = 'not_configured';
  const lastOrder = db.prepare('SELECT received_at FROM channel_orders WHERE restaurant_id = ? AND branch_id = ? AND channel = ? ORDER BY received_at DESC LIMIT 1').get(ctx.restaurantId, ctx.branchId, channel);
  return {
    channel,
    route: spec.route,
    transport: spec.transport,
    docs: spec.docs,
    environment: channel === 'swiggy' ? config.environment : 'unavailable',
    status,
    simulatedAvailable: true,
    restaurantId: ctx.restaurantId,
    branchId: ctx.branchId,
    externalOutletId: row?.external_outlet_id || '',
    credentialsConfigured: channel === 'swiggy' ? config.configured : false,
    credentialHint: channel === 'swiggy' ? config.usernameHint : '',
    lastCheckAt: row?.last_check_at || null,
    lastCheckOk: row?.last_check_ok == null ? null : !!row.last_check_ok,
    lastCheckError: row?.last_check_error || '',
    lastOrderAt: lastOrder?.received_at || row?.last_order_at || null,
    lastMenuSyncAt: row?.last_menu_sync_at || null,
    pendingActions: pending,
    disabledLocally: !!row?.disabled_at,
    outletClosedOnPlatform: false,
    capabilities: spec,
  };
}

export function channelSnapshot(db, ctx) {
  assertPermission(ctx, 'orders.read');
  const orders = db.prepare('SELECT * FROM channel_orders WHERE restaurant_id = ? AND branch_id = ? ORDER BY received_at DESC LIMIT 100').all(ctx.restaurantId, ctx.branchId);
  const lines = orders.length
    ? db.prepare(`SELECT * FROM channel_lines WHERE channel_order_id IN (${orders.map(() => '?').join(',')})`).all(...orders.map((order) => order.id))
    : [];
  const actions = orders.length
    ? db.prepare(`SELECT id, channel_order_id, kind, status, error, attempts, updated_at FROM channel_actions WHERE channel_order_id IN (${orders.map(() => '?').join(',')}) ORDER BY created_at DESC`).all(...orders.map((order) => order.id))
    : [];
  const since = Date.now() - 86400000;
  const metrics = {
    failedEvents: db.prepare("SELECT COUNT(*) AS n FROM channel_events WHERE restaurant_id = ? AND status = 'failed' AND received_at >= ?").get(ctx.restaurantId, since).n,
    duplicates: db.prepare("SELECT COUNT(*) AS n FROM channel_events WHERE restaurant_id = ? AND status = 'duplicate' AND received_at >= ?").get(ctx.restaurantId, since).n,
    quarantined: ctx.platformRole === 'super_admin' ? db.prepare("SELECT COUNT(*) AS n FROM channel_events WHERE status = 'quarantined'").get().n : 0,
    unmapped: db.prepare('SELECT COUNT(*) AS n FROM channel_orders WHERE restaurant_id = ? AND unmapped_count > 0').get(ctx.restaurantId).n,
    pendingActions: db.prepare("SELECT COUNT(*) AS n FROM channel_actions WHERE restaurant_id = ? AND status IN ('pending', 'needs_reconciliation')").get(ctx.restaurantId).n,
    menuFailures: db.prepare("SELECT COUNT(*) AS n FROM channel_jobs WHERE restaurant_id = ? AND kind = 'menu_preview' AND status = 'failed'").get(ctx.restaurantId).n,
  };
  const quarantine = ctx.platformRole === 'super_admin'
    ? db.prepare("SELECT id, kind, error, received_at FROM channel_events WHERE status = 'quarantined' ORDER BY received_at DESC LIMIT 20").all()
    : [];
  return {
    connections: CHANNELS.map((channel) => publicConnection(db, ctx, channel)),
    orders: orders.map((order) => ({
      ...presentOrder(order),
      lines: lines.filter((line) => line.channel_order_id === order.id).map(presentLine),
      actions: actions.filter((action) => action.channel_order_id === order.id).map((action) => ({
        id: action.id,
        kind: action.kind,
        status: action.status,
        error: action.error || '',
        attempts: action.attempts,
        updatedAt: action.updated_at,
      })),
    })),
    jobs: db.prepare('SELECT id, channel, kind, status, detail, created_at FROM channel_jobs WHERE restaurant_id = ? AND branch_id = ? ORDER BY created_at DESC LIMIT 20').all(ctx.restaurantId, ctx.branchId).map((job) => ({
      id: job.id,
      channel: job.channel,
      kind: job.kind,
      status: job.status,
      detail: job.detail ? JSON.parse(job.detail) : null,
      createdAt: job.created_at,
    })),
    metrics,
    quarantine,
    settlement: 'Settlement files from Zomato and Swiggy are not available. Customer totals are not treated as money received.',
  };
}

function presentOrder(order) {
  return {
    id: order.id,
    orderId: order.order_id || null,
    channel: order.channel,
    transport: order.transport,
    externalOrderId: order.external_order_id,
    externalOutletId: order.external_outlet_id,
    providerState: order.provider_state,
    fulfilmentState: order.fulfilment_state,
    collectionState: order.collection_state,
    settlementState: order.settlement_state,
    simulated: !!order.simulated,
    customerTotal: order.customer_total_paise == null ? null : toRupees(order.customer_total_paise),
    itemTotal: order.item_total_paise == null ? null : toRupees(order.item_total_paise),
    discount: order.discount_paise == null ? null : toRupees(order.discount_paise),
    merchantDiscount: order.merchant_discount_paise == null ? null : toRupees(order.merchant_discount_paise),
    platformDiscount: order.platform_discount_paise == null ? null : toRupees(order.platform_discount_paise),
    tax: order.tax_paise == null ? null : toRupees(order.tax_paise),
    packaging: order.packaging_paise == null ? null : toRupees(order.packaging_paise),
    deliveryCharge: order.delivery_paise == null ? null : toRupees(order.delivery_paise),
    cashToCollect: order.cash_to_collect_paise == null ? null : toRupees(order.cash_to_collect_paise),
    discrepancy: order.discrepancy || '',
    instructions: order.instructions || '',
    unmappedCount: order.unmapped_count,
    attention: order.attention || '',
    canReject: !!order.can_reject,
    deliveryType: order.delivery_type || '',
    prepDeadlineAt: order.prep_deadline_at || null,
    riderState: order.rider_state || '',
    riderName: order.rider_name || '',
    printStatus: order.print_status || '',
    receivedAt: order.received_at,
    updatedAt: order.updated_at,
  };
}

function presentLine(line) {
  return {
    id: line.id,
    externalItemId: line.external_item_id || '',
    menuItemId: line.menu_item_id || '',
    name: line.name,
    qty: line.qty,
    unitPrice: toRupees(line.unit_price_paise),
    modifiers: line.modifiers_json ? JSON.parse(line.modifiers_json) : [],
    notes: line.notes || '',
    unmapped: !!line.unmapped,
  };
}

function ensureConnection(db, ctx, channel) {
  if (!CHANNELS.includes(channel)) fail(400, 'Choose Zomato or Swiggy.');
  let row = connectionRow(db, ctx, channel);
  if (!row) {
    const id = newId();
    db.prepare(
      `INSERT INTO channel_connections (id, restaurant_id, branch_id, channel, transport, environment, status, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, ctx.restaurantId, ctx.branchId, channel, CAPABILITIES[channel].transport, channel === 'swiggy' ? urbanpiperConfig().environment : 'unavailable', 'not_configured', ctx.userId, Date.now());
    row = connectionRow(db, ctx, channel);
  }
  return row;
}

export function saveOutlet(db, ctx, channel, externalOutletId) {
  assertPermission(ctx, 'settings.write');
  const outlet = String(externalOutletId || '').trim();
  if (!/^[A-Za-z0-9_.:#-]{1,80}$/.test(outlet)) fail(400, 'Enter the outlet id supplied by the provider.');
  const clash = db.prepare('SELECT restaurant_id, branch_id FROM channel_connections WHERE channel = ? AND external_outlet_id = ? AND disabled_at IS NULL').get(channel, outlet);
  if (clash && (clash.restaurant_id !== ctx.restaurantId || clash.branch_id !== ctx.branchId)) fail(409, 'That outlet is already mapped to another branch.');
  ensureConnection(db, ctx, channel);
  db.prepare('UPDATE channel_connections SET external_outlet_id = ?, disabled_at = NULL, updated_by = ?, updated_at = ? WHERE restaurant_id = ? AND branch_id = ? AND channel = ?').run(outlet, ctx.userId, Date.now(), ctx.restaurantId, ctx.branchId, channel);
  audit(db, ctx, channel, 'outlet.map', { externalOutletId: outlet });
  return publicConnection(db, ctx, channel);
}

export function disableConnection(db, ctx, channel) {
  assertPermission(ctx, 'settings.write');
  ensureConnection(db, ctx, channel);
  db.prepare('UPDATE channel_connections SET disabled_at = ?, activated_at = NULL, updated_by = ?, updated_at = ? WHERE restaurant_id = ? AND branch_id = ? AND channel = ?').run(Date.now(), ctx.userId, Date.now(), ctx.restaurantId, ctx.branchId, channel);
  audit(db, ctx, channel, 'connection.disable', { platformOutletClosed: false });
  return publicConnection(db, ctx, channel);
}

export async function validateConnection(db, ctx, channel) {
  assertPermission(ctx, 'settings.write');
  if (channel === 'zomato') fail(409, 'Zomato has not approved this POS. No connection check was sent.');
  const result = await validateUrbanpiper();
  ensureConnection(db, ctx, 'swiggy');
  db.prepare('UPDATE channel_connections SET last_check_at = ?, last_check_ok = ?, last_check_error = ?, updated_at = ? WHERE restaurant_id = ? AND branch_id = ? AND channel = ?').run(
    Date.now(),
    result.ok ? 1 : 0,
    result.ok ? null : result.message,
    Date.now(),
    ctx.restaurantId,
    ctx.branchId,
    'swiggy'
  );
  audit(db, ctx, 'swiggy', 'connection.validate', { ok: result.ok, code: result.code });
  return { connection: publicConnection(db, ctx, 'swiggy'), result: { ok: result.ok, code: result.code, message: result.message } };
}

export function activateConnection(db, ctx, channel) {
  assertPermission(ctx, 'settings.write');
  if (channel !== 'swiggy') fail(409, 'Zomato cannot be activated without provider approval.');
  const row = connectionRow(db, ctx, channel);
  if (!urbanpiperConfig().configured) fail(409, 'UrbanPiper credentials are not set.');
  if (!row?.external_outlet_id) fail(409, 'Map the outlet before activation.');
  if (!row.last_check_ok) fail(409, 'Run a successful connection check before activation.');
  const live = process.env.URBANPIPER_ALLOW_LIVE === '1' && urbanpiperConfig().environment === 'production';
  if (!live) fail(409, 'Live activation is blocked. The test host is still in use, or URBANPIPER_ALLOW_LIVE is not set. No outlet was opened or closed.');
  db.prepare('UPDATE channel_connections SET activated_at = ?, disabled_at = NULL, updated_by = ?, updated_at = ? WHERE id = ?').run(Date.now(), ctx.userId, Date.now(), row.id);
  audit(db, ctx, channel, 'connection.activate', { environment: urbanpiperConfig().environment });
  return publicConnection(db, ctx, channel);
}

export function saveItemMap(db, ctx, payload) {
  assertPermission(ctx, 'settings.write');
  const channel = payload.channel;
  if (!CHANNELS.includes(channel)) fail(400, 'Choose Zomato or Swiggy.');
  const externalItemId = String(payload.externalItemId || '').trim();
  if (!/^[A-Za-z0-9_.:#-]{1,80}$/.test(externalItemId)) fail(400, 'Enter the external item id.');
  const item = db.prepare('SELECT id, price_paise FROM menu_items WHERE id = ? AND restaurant_id = ?').get(payload.menuItemId, ctx.restaurantId);
  if (!item) fail(404, 'Menu item not found.');
  const channelPrice = payload.channelPrice == null || payload.channelPrice === '' ? null : paise(payload.channelPrice);
  if (payload.channelPrice != null && payload.channelPrice !== '' && (channelPrice == null || channelPrice < 0)) fail(400, 'Channel price is invalid.');
  db.prepare('DELETE FROM channel_item_maps WHERE restaurant_id = ? AND channel = ? AND (menu_item_id = ? OR external_item_id = ?)').run(ctx.restaurantId, channel, item.id, externalItemId);
  db.prepare('INSERT INTO channel_item_maps (id, restaurant_id, channel, menu_item_id, external_item_id, channel_price_paise, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    newId(), ctx.restaurantId, channel, item.id, externalItemId, channelPrice, ctx.userId, Date.now()
  );
  const dineIn = db.prepare('SELECT price_paise FROM menu_items WHERE id = ?').get(item.id).price_paise;
  if (dineIn !== item.price_paise) fail(500, 'Dine-in price changed unexpectedly.');
  audit(db, ctx, channel, 'item.map', { externalItemId, menuItemId: item.id });
  return { externalItemId, menuItemId: item.id, channelPrice: channelPrice == null ? null : toRupees(channelPrice), dineInPrice: toRupees(dineIn) };
}

export function itemMaps(db, ctx, channel) {
  assertPermission(ctx, 'orders.read');
  return db.prepare(
    `SELECT m.external_item_id, m.menu_item_id, m.channel_price_paise, i.name, i.price_paise
     FROM channel_item_maps m JOIN menu_items i ON i.id = m.menu_item_id
     WHERE m.restaurant_id = ? AND m.channel = ? ORDER BY i.name`
  ).all(ctx.restaurantId, channel).map((row) => ({
    externalItemId: row.external_item_id,
    menuItemId: row.menu_item_id,
    name: row.name,
    channelPrice: row.channel_price_paise == null ? null : toRupees(row.channel_price_paise),
    dineInPrice: toRupees(row.price_paise),
  }));
}

export function previewMenu(db, ctx, channel) {
  assertPermission(ctx, 'settings.write');
  if (!CHANNELS.includes(channel)) fail(400, 'Choose Zomato or Swiggy.');
  const maps = itemMaps(db, ctx, channel);
  const missing = maps.filter((row) => !row.externalItemId);
  const detail = {
    sent: false,
    message: 'This is a local preview. No menu was published to Zomato, Swiggy or UrbanPiper.',
    mapped: maps.length,
    missingExternalIds: missing.length,
    dineInPricesUntouched: true,
  };
  db.prepare('INSERT INTO channel_jobs (id, restaurant_id, branch_id, channel, kind, status, detail, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    newId(), ctx.restaurantId, ctx.branchId, channel, 'menu_preview', missing.length ? 'failed' : 'preview', JSON.stringify(detail), ctx.userId, Date.now(), Date.now()
  );
  return detail;
}

export function requestAvailability(db, ctx, payload) {
  assertPermission(ctx, 'menu.write');
  const channel = payload.channel;
  if (!CHANNELS.includes(channel)) fail(400, 'Choose Zomato or Swiggy.');
  const item = db.prepare('SELECT id, name, available FROM menu_items WHERE id = ? AND restaurant_id = ?').get(payload.menuItemId, ctx.restaurantId);
  if (!item) fail(404, 'Menu item not found.');
  const detail = {
    sent: false,
    requestedAvailable: payload.available !== false,
    confirmed: false,
    message: 'No availability request was sent. The dine-in item was not changed, and the delivery platform was not changed.',
    item: item.name,
  };
  db.prepare('INSERT INTO channel_jobs (id, restaurant_id, branch_id, channel, kind, status, detail, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    newId(), ctx.restaurantId, ctx.branchId, channel, 'availability', 'not_sent', JSON.stringify(detail), ctx.userId, Date.now(), Date.now()
  );
  return detail;
}

function insertLines(db, channelOrderId, lines) {
  let unmapped = 0;
  for (const line of lines) {
    if (line.unmapped) unmapped += 1;
    db.prepare('INSERT INTO channel_lines (id, channel_order_id, external_item_id, menu_item_id, name, qty, unit_price_paise, modifiers_json, notes, unmapped) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      newId(), channelOrderId, line.externalItemId || null, line.menuItemId || null, line.name, line.qty, line.unitPricePaise, JSON.stringify(line.modifiers || []), line.notes || null, line.unmapped ? 1 : 0
    );
  }
  return unmapped;
}

function rememberOrder(db, row, lines) {
  const id = newId();
  const unmapped = insertLines(db, id, lines);
  db.prepare(
    `INSERT INTO channel_orders (
      id, restaurant_id, branch_id, order_id, channel, transport, external_order_id, external_outlet_id,
      provider_state, fulfilment_state, collection_state, settlement_state, simulated,
      customer_total_paise, item_total_paise, discount_paise, merchant_discount_paise, platform_discount_paise,
      tax_paise, packaging_paise, delivery_paise, cash_to_collect_paise, discrepancy, instructions,
      unmapped_count, can_reject, delivery_type, prep_deadline_at, attention, received_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'not_supplied', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, row.restaurantId, row.branchId, row.channel, row.transport, row.externalOrderId, row.externalOutletId,
    row.providerState, row.fulfilmentState, row.collectionState, row.simulated ? 1 : 0,
    row.customerTotalPaise, row.itemTotalPaise, row.discountPaise, row.merchantDiscountPaise, row.platformDiscountPaise,
    row.taxPaise, row.packagingPaise, row.deliveryPaise, row.cashToCollectPaise, row.discrepancy, row.instructions,
    unmapped, row.canReject ? 1 : 0, row.deliveryType || null, row.prepDeadlineAt || null, unmapped ? 'unmapped_items' : null, Date.now(), Date.now()
  );
  return db.prepare('SELECT * FROM channel_orders WHERE id = ?').get(id);
}

function mapLines(db, restaurantId, channel, items) {
  return items.map((item) => {
    const externalItemId = String(item.externalItemId || item.merchant_id || '').trim();
    const mapped = externalItemId
      ? db.prepare('SELECT menu_item_id FROM channel_item_maps WHERE restaurant_id = ? AND channel = ? AND external_item_id = ?').get(restaurantId, channel, externalItemId)
      : null;
    const modifiers = (item.modifiers || item.options_to_add || []).map((option) => ({
      name: String(option.name || option.title || 'Option').slice(0, 80),
      price: Number(option.price) || 0,
    }));
    return {
      externalItemId,
      menuItemId: mapped?.menu_item_id || null,
      name: String(item.name || item.title || 'Item').slice(0, 120),
      qty: Math.max(1, Number(item.qty || item.quantity) || 1),
      unitPricePaise: paise(item.unitPrice ?? item.price) ?? 0,
      modifiers,
      notes: String(item.notes || item.instructions || '').slice(0, 200),
      unmapped: !mapped,
    };
  });
}

export function simulateOrder(db, ctx, payload) {
  assertPermission(ctx, 'settings.write');
  const channel = payload.channel;
  if (!CHANNELS.includes(channel)) fail(400, 'Choose Zomato or Swiggy.');
  const externalOrderId = String(payload.externalOrderId || '').trim();
  if (!/^[A-Za-z0-9_.:#-]{1,80}$/.test(externalOrderId)) fail(400, 'Enter a synthetic order id.');
  const existing = db.prepare("SELECT * FROM channel_orders WHERE transport = 'simulation' AND external_outlet_id = ? AND external_order_id = ?").get(`sim:${ctx.branchId}`, externalOrderId);
  if (existing) return { order: presentOrder(existing), duplicate: true };
  const lines = mapLines(db, ctx.restaurantId, channel, payload.items || []);
  if (!lines.length) fail(400, 'Add at least one synthetic item.');
  const saved = rememberOrder(db, {
    restaurantId: ctx.restaurantId,
    branchId: ctx.branchId,
    channel,
    transport: 'simulation',
    externalOrderId,
    externalOutletId: `sim:${ctx.branchId}`,
    providerState: 'placed',
    fulfilmentState: 'new',
    collectionState: payload.collection === 'cash_to_collect' ? 'cash_to_collect' : 'customer_paid_online',
    simulated: true,
    customerTotalPaise: paise(payload.customerTotal),
    itemTotalPaise: paise(payload.itemTotal),
    discountPaise: paise(payload.discount),
    merchantDiscountPaise: paise(payload.merchantDiscount),
    platformDiscountPaise: paise(payload.platformDiscount),
    taxPaise: paise(payload.tax),
    packagingPaise: paise(payload.packaging),
    deliveryPaise: paise(payload.deliveryCharge),
    cashToCollectPaise: payload.collection === 'cash_to_collect' ? paise(payload.cashToCollect) : null,
    discrepancy: null,
    instructions: String(payload.instructions || '').slice(0, 200),
    canReject: true,
    deliveryType: 'partner',
    prepDeadlineAt: null,
  }, lines);
  audit(db, ctx, channel, 'order.simulate', { externalOrderId });
  return { order: presentOrder(saved), duplicate: false };
}

function chargePaise(charges, titles) {
  const found = (charges || []).filter((charge) => titles.includes(String(charge.title || '').toLowerCase()));
  if (!found.length) return null;
  return found.reduce((sum, charge) => sum + (paise(charge.value) || 0), 0);
}

function moneyDiscrepancy(details, charges) {
  const subtotal = Number(details.order_subtotal);
  const discount = Number(details.discount || 0);
  const taxes = Number(details.total_taxes || 0);
  const chargeSum = (charges || []).reduce((sum, charge) => sum + (Number(charge.value) || 0), 0);
  const payable = Number(details.payable_amount);
  if (![subtotal, payable].every(Number.isFinite)) return null;
  const expected = subtotal - discount + taxes + chargeSum;
  if (Math.abs(expected - payable) > 0.05) return `Provider payable ${payable} does not match the supplied parts (${expected.toFixed(2)}). The provider payable was kept.`;
  return null;
}

function aggregatorName(order) {
  const platforms = order?.details?.ext_platforms || [];
  const food = platforms.find((platform) => platform.kind === 'food_aggregator') || platforms[0];
  const name = String(food?.name || order?.details?.channel || '').toLowerCase();
  if (name.includes('swiggy')) return 'swiggy';
  if (name.includes('zomato')) return 'zomato';
  return '';
}

function storeEvent(db, row) {
  const existing = db.prepare('SELECT id, status FROM channel_events WHERE dedupe_key = ?').get(row.dedupeKey);
  if (existing) return { duplicate: true, id: existing.id, status: existing.status };
  const id = newId();
  db.prepare('INSERT INTO channel_events (id, dedupe_key, transport, channel, restaurant_id, branch_id, kind, status, error, redacted_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, row.dedupeKey, row.transport, row.channel || null, row.restaurantId || null, row.branchId || null, row.kind, row.status, row.error || null, JSON.stringify(redact(row.body)).slice(0, 20000), Date.now()
  );
  return { duplicate: false, id };
}

function fulfil(db, channelOrder) {
  if (channelOrder.simulated || channelOrder.kot_created) return channelOrder;
  const lines = db.prepare('SELECT * FROM channel_lines WHERE channel_order_id = ?').all(channelOrder.id);
  const numberRow = db.prepare('SELECT next_number FROM order_counters WHERE branch_id = ?').get(channelOrder.branch_id);
  const number = numberRow?.next_number || 1001;
  db.prepare('UPDATE order_counters SET next_number = ? WHERE branch_id = ?').run(number + 1, channelOrder.branch_id);
  const orderId = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO orders (id, restaurant_id, branch_id, number, type, table_id, customer_id, status, payment, discount_paise, tax_paise, subtotal_paise, total_paise, notes, served_by, version, created_at, updated_at, channel, external_order_id, channel_alert)
     VALUES (?, ?, ?, ?, 'online', NULL, NULL, 'preparing', 'channel', ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, NULL)`
  ).run(
    orderId,
    channelOrder.restaurant_id,
    channelOrder.branch_id,
    number,
    channelOrder.discount_paise || 0,
    channelOrder.tax_paise || 0,
    channelOrder.item_total_paise || 0,
    channelOrder.customer_total_paise || 0,
    channelOrder.instructions || null,
    now,
    now,
    channelOrder.channel,
    channelOrder.external_order_id
  );
  for (const line of lines) {
    db.prepare('INSERT INTO order_items (id, order_id, restaurant_id, menu_item_id, name, price_paise, qty, notes, modifiers_json, status, kot_batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
      newId(), orderId, channelOrder.restaurant_id, line.menu_item_id, line.name, line.unit_price_paise, line.qty, line.notes, line.modifiers_json, 'new'
    );
  }
  let printStatus = 'created';
  try {
    db.prepare("INSERT INTO print_jobs (id, restaurant_id, branch_id, order_id, kind, status, detail, created_at, updated_at) VALUES (?, ?, ?, ?, 'kot', 'created', ?, ?, ?)").run(
      newId(), channelOrder.restaurant_id, channelOrder.branch_id, orderId, JSON.stringify({ channel: channelOrder.channel, externalOrderId: channelOrder.external_order_id }), now, now
    );
  } catch (error) {
    printStatus = 'failed';
    console.error(`Channel print job failed for ${channelOrder.external_order_id}: ${error.message}`);
  }
  if (!channelOrder.inventory_applied) {
    for (const line of lines) {
      if (!line.menu_item_id || line.unmapped) continue;
      const item = db.prepare('SELECT recipe_json FROM menu_items WHERE id = ? AND restaurant_id = ?').get(line.menu_item_id, channelOrder.restaurant_id);
      const recipe = item?.recipe_json ? JSON.parse(item.recipe_json) : [];
      for (const part of recipe) {
        const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ? AND restaurant_id = ?').get(part.ingredientId, channelOrder.restaurant_id);
        if (!ingredient) continue;
        const delta = -Number(part.quantity) * line.qty;
        db.prepare("INSERT INTO stock_movements (id, restaurant_id, branch_id, ingredient_id, qty_delta, reason, ref_type, ref_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'recipe', 'channel_order', ?, NULL, ?)").run(
          newId(), channelOrder.restaurant_id, channelOrder.branch_id, ingredient.id, delta, orderId, now
        );
        db.prepare('UPDATE ingredients SET stock = ?, last_updated = ? WHERE id = ?').run(Math.max(0, ingredient.stock + delta), now, ingredient.id);
      }
    }
  }
  db.prepare("UPDATE channel_orders SET order_id = ?, kot_created = 1, inventory_applied = 1, print_status = ?, fulfilment_state = 'preparing', updated_at = ? WHERE id = ?").run(orderId, printStatus, now, channelOrder.id);
  return db.prepare('SELECT * FROM channel_orders WHERE id = ?').get(channelOrder.id);
}

function applyRelay(db, body, eventId) {
  const order = body?.order;
  const channel = aggregatorName(order);
  const outlet = String(order?.store?.merchant_ref_id || '').trim();
  const externalOrderId = String(order?.details?.id || '').trim();
  if (!externalOrderId || !outlet || !channel) {
    db.prepare("UPDATE channel_events SET status = 'quarantined', error = ? WHERE id = ?").run('Order is missing a channel, outlet or provider id.', eventId);
    return;
  }
  if (channel !== 'swiggy') {
    db.prepare("UPDATE channel_events SET status = 'quarantined', channel = ?, error = ? WHERE id = ?").run(channel, 'Zomato is on the direct route, which is not approved. This middleware order was not assigned.', eventId);
    return;
  }
  const connection = db.prepare("SELECT * FROM channel_connections WHERE channel = 'swiggy' AND external_outlet_id = ? AND disabled_at IS NULL").get(outlet);
  if (!connection) {
    db.prepare("UPDATE channel_events SET status = 'quarantined', channel = 'swiggy', error = ? WHERE id = ?").run('No branch is mapped to this outlet.', eventId);
    return;
  }
  const existing = db.prepare("SELECT id FROM channel_orders WHERE transport = 'urbanpiper' AND external_outlet_id = ? AND external_order_id = ?").get(outlet, externalOrderId);
  if (existing) {
    db.prepare("UPDATE channel_events SET status = 'duplicate', restaurant_id = ?, branch_id = ?, channel = 'swiggy', processed_at = ? WHERE id = ?").run(connection.restaurant_id, connection.branch_id, Date.now(), eventId);
    return;
  }
  const details = order.details || {};
  const charges = details.charges || [];
  const platforms = details.ext_platforms || [];
  const extras = platforms.find((platform) => String(platform.name || '').toLowerCase().includes('swiggy'))?.extras || {};
  const payments = order.payment || [];
  const cash = payments.find((payment) => String(payment.option || '').toLowerCase() === 'cash');
  const discount = paise(details.discount);
  const externalDiscount = paise(details.total_external_discount);
  const saved = rememberOrder(db, {
    restaurantId: connection.restaurant_id,
    branchId: connection.branch_id,
    channel: 'swiggy',
    transport: 'urbanpiper',
    externalOrderId,
    externalOutletId: outlet,
    providerState: String(details.order_state || 'Placed').toLowerCase().replace(' ', '_'),
    fulfilmentState: 'new',
    collectionState: cash || extras.cash_to_be_collected ? 'cash_to_collect' : payments.length ? 'customer_paid_online' : 'unknown',
    simulated: false,
    customerTotalPaise: paise(details.payable_amount),
    itemTotalPaise: paise(details.order_subtotal),
    discountPaise: discount,
    merchantDiscountPaise: discount != null && externalDiscount != null ? discount - externalDiscount : null,
    platformDiscountPaise: externalDiscount,
    taxPaise: paise(details.total_taxes),
    packagingPaise: chargePaise(charges, ['restaurant packaging charge', 'packaging charge']),
    deliveryPaise: chargePaise(charges, ['delivery charge']),
    cashToCollectPaise: extras.cash_to_be_collected != null ? paise(extras.cash_to_be_collected) : cash ? paise(cash.amount) : null,
    discrepancy: moneyDiscrepancy(details, charges),
    instructions: String(details.instructions || '').slice(0, 200),
    canReject: extras.can_reject_order === true,
    deliveryType: platforms.find((platform) => platform.delivery_type)?.delivery_type || null,
    prepDeadlineAt: extras.swiggy_prep_time_secs ? Date.now() + Number(extras.swiggy_prep_time_secs) * 1000 : null,
  }, mapLines(db, connection.restaurant_id, 'swiggy', order.items || []));
  const state = String(details.order_state || 'Placed').toLowerCase();
  if (['acknowledged', 'confirmed', 'food ready', 'dispatched', 'completed'].includes(state)) fulfil(db, saved);
  if (state === 'cancelled') {
    db.prepare("UPDATE channel_orders SET fulfilment_state = 'cancelled', provider_state = 'cancelled', attention = 'cancelled', updated_at = ? WHERE id = ?").run(Date.now(), saved.id);
  }
  db.prepare('UPDATE channel_connections SET last_order_at = ? WHERE id = ?').run(Date.now(), connection.id);
  db.prepare("UPDATE channel_events SET status = 'processed', restaurant_id = ?, branch_id = ?, channel = 'swiggy', processed_at = ? WHERE id = ?").run(connection.restaurant_id, connection.branch_id, Date.now(), eventId);
}

function applyStatus(db, body, eventId) {
  const externalOrderId = String(body?.order_id || '').trim();
  const outlet = String(body?.store_id || '').trim();
  const found = db.prepare("SELECT * FROM channel_orders WHERE transport = 'urbanpiper' AND external_order_id = ?").get(externalOrderId);
  if (!found) {
    db.prepare("UPDATE channel_events SET status = 'waiting', error = ? WHERE id = ?").run('The order is not in RasoiSet yet.', eventId);
    return;
  }
  if (outlet && found.external_outlet_id !== outlet) {
    db.prepare("UPDATE channel_events SET status = 'quarantined', error = ? WHERE id = ?").run('Status outlet does not match the stored order.', eventId);
    return;
  }
  const next = String(body.new_state || '').toLowerCase();
  if (next === 'customer_cancelled') {
    db.prepare("UPDATE channel_orders SET attention = 'customer_cancellation', updated_at = ? WHERE id = ?").run(Date.now(), found.id);
    db.prepare("UPDATE channel_events SET status = 'processed', restaurant_id = ?, branch_id = ?, processed_at = ? WHERE id = ?").run(found.restaurant_id, found.branch_id, Date.now(), eventId);
    return;
  }
  const incoming = RANK[next.replace(' ', '_')] || 0;
  const current = RANK[found.provider_state] || 0;
  if (found.provider_state === 'cancelled' && next !== 'cancelled') {
    db.prepare("UPDATE channel_events SET status = 'ignored_stale', restaurant_id = ?, processed_at = ? WHERE id = ?").run(found.restaurant_id, Date.now(), eventId);
    return;
  }
  if (incoming && incoming < current && next !== 'cancelled') {
    db.prepare("UPDATE channel_events SET status = 'ignored_stale', restaurant_id = ?, processed_at = ? WHERE id = ?").run(found.restaurant_id, Date.now(), eventId);
    return;
  }
  db.prepare('UPDATE channel_orders SET provider_state = ?, updated_at = ? WHERE id = ?').run(next.replace(' ', '_'), Date.now(), found.id);
  if (next === 'cancelled') {
    db.prepare("UPDATE channel_orders SET fulfilment_state = 'cancelled', attention = 'cancelled', updated_at = ? WHERE id = ?").run(Date.now(), found.id);
    if (found.order_id) {
      db.prepare("UPDATE orders SET status = 'cancelled', channel_alert = 'cancel', notes = ?, updated_at = ? WHERE id = ?").run(
        `Cancelled by the platform. ${String(body.message || '').slice(0, 160)}`,
        Date.now(),
        found.order_id
      );
    }
  } else if (['acknowledged', 'confirmed'].includes(next)) {
    fulfil(db, db.prepare('SELECT * FROM channel_orders WHERE id = ?').get(found.id));
  } else if (next === 'food ready' && found.order_id) {
    db.prepare("UPDATE orders SET status = 'ready', updated_at = ? WHERE id = ? AND status != 'cancelled'").run(Date.now(), found.order_id);
    db.prepare("UPDATE channel_orders SET fulfilment_state = 'ready' WHERE id = ?").run(found.id);
  } else if (next === 'completed' && found.order_id) {
    db.prepare("UPDATE orders SET status = 'completed', updated_at = ? WHERE id = ? AND status != 'cancelled'").run(Date.now(), found.order_id);
    db.prepare("UPDATE channel_orders SET fulfilment_state = 'completed' WHERE id = ?").run(found.id);
  }
  db.prepare("UPDATE channel_events SET status = 'processed', restaurant_id = ?, branch_id = ?, channel = ?, processed_at = ? WHERE id = ?").run(found.restaurant_id, found.branch_id, found.channel, Date.now(), eventId);
}

function applyRider(db, body, eventId) {
  const found = db.prepare("SELECT * FROM channel_orders WHERE transport = 'urbanpiper' AND external_order_id = ?").get(String(body?.order_id || ''));
  if (!found) {
    db.prepare("UPDATE channel_events SET status = 'waiting', error = ? WHERE id = ?").run('The order is not in RasoiSet yet.', eventId);
    return;
  }
  const name = String(body?.delivery_info?.delivery_person_details?.name || '').slice(0, 80);
  const state = String(body?.delivery_info?.current_state || '').slice(0, 40);
  db.prepare('UPDATE channel_orders SET rider_name = ?, rider_state = ?, updated_at = ? WHERE id = ?').run(name, state, Date.now(), found.id);
  db.prepare("UPDATE channel_events SET status = 'processed', restaurant_id = ?, branch_id = ?, processed_at = ? WHERE id = ?").run(found.restaurant_id, found.branch_id, Date.now(), eventId);
}

export function receiveUrbanpiper(db, kind, body, authorization) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '');
  if (!webhookAuthorized(token)) {
    const error = new Error('Webhook token was rejected.');
    error.status = 401;
    throw error;
  }
  const externalId = kind === 'order' ? body?.order?.details?.id : body?.order_id;
  const dedupeKey = `urbanpiper:${kind}:${externalId}:${kind === 'status' ? body?.new_state : ''}:${kind === 'status' ? body?.timestamp_unix || '' : ''}`;
  return transaction(db, () => {
    const stored = storeEvent(db, { dedupeKey, transport: 'urbanpiper', kind, body, status: 'received' });
    if (stored.duplicate) {
      db.prepare("UPDATE channel_events SET status = 'duplicate' WHERE id = ? AND status = 'received'").run(stored.id);
      return { status: 200, body: { order_ref_id: stored.id, duplicate: true } };
    }
    if (kind === 'order') applyRelay(db, body, stored.id);
    else if (kind === 'status') applyStatus(db, body, stored.id);
    else applyRider(db, body, stored.id);
    const order = kind === 'order'
      ? db.prepare("SELECT order_id, id FROM channel_orders WHERE transport = 'urbanpiper' AND external_order_id = ?").get(String(body?.order?.details?.id || ''))
      : null;
    return { status: 200, body: { order_ref_id: order?.order_id || stored.id } };
  });
}

export function receiveZomato(db, body, tokenHeader) {
  if (!tokensMatch(process.env.ZOMATO_WEBHOOK_TOKEN, tokenHeader)) {
    const error = new Error('Zomato webhook token was rejected.');
    error.status = 401;
    throw error;
  }
  const orderId = body?.order?.order_id || body?.order_id || newId();
  transaction(db, () => {
    const stored = storeEvent(db, {
      dedupeKey: `zomato:${orderId}:${body?.order?.restaurant_id || ''}`,
      transport: 'zomato_direct',
      channel: 'zomato',
      kind: 'order',
      body,
      status: 'quarantined',
      error: 'The published Zomato pages do not include the full order schema. The event was stored and was not accepted into the kitchen.',
    });
    if (!stored.duplicate) {
      db.prepare("UPDATE channel_events SET status = 'quarantined', error = ? WHERE id = ?").run(
        'The published Zomato pages do not include the full order schema. The event was stored and was not accepted into the kitchen.',
        stored.id
      );
    }
  });
  const error = new Error('Zomato order was stored for investigation and was not accepted. The full order schema is not published.');
  error.status = 503;
  throw error;
}

function ownedChannelOrder(db, ctx, id) {
  const order = db.prepare('SELECT * FROM channel_orders WHERE id = ? AND restaurant_id = ? AND branch_id = ?').get(id, ctx.restaurantId, ctx.branchId);
  if (!order) fail(404, 'Online order not found.');
  return order;
}

async function sendStatus(db, order, kind, body) {
  const actionId = newId();
  db.prepare("INSERT INTO channel_actions (id, restaurant_id, channel_order_id, kind, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', 1, ?, ?)").run(
    actionId, order.restaurant_id, order.id, kind, Date.now(), Date.now()
  );
  const result = await pushOrderStatus(order.external_order_id, body);
  if (result.outcome === 'confirmed') {
    db.prepare("UPDATE channel_actions SET status = 'confirmed', error = NULL, updated_at = ? WHERE id = ?").run(Date.now(), actionId);
    return result;
  }
  if (result.outcome === 'timeout') {
    db.prepare("UPDATE channel_actions SET status = 'needs_reconciliation', error = ?, updated_at = ? WHERE id = ?").run(result.message, Date.now(), actionId);
    fail(504, 'UrbanPiper did not answer. The order was not marked accepted or rejected. Do not send it again until the status webhook or UrbanPiper shows the result.');
  }
  if (result.outcome === 'rate_limited' || result.outcome === 'network') {
    const wait = 30000 + Math.floor(Math.random() * 10000);
    db.prepare("UPDATE channel_actions SET status = 'pending', error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?").run(result.message, Date.now() + wait, Date.now(), actionId);
    fail(503, result.message);
  }
  db.prepare("UPDATE channel_actions SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(result.message, Date.now(), actionId);
  fail(409, result.message || 'UrbanPiper rejected the status update.');
}

export async function actOnOrder(db, ctx, id, action, payload = {}) {
  const order = ownedChannelOrder(db, ctx, id);
  if (order.provider_state === 'cancelled' || order.fulfilment_state === 'cancelled') fail(409, 'This order is already cancelled.');
  const unresolved = db.prepare("SELECT id FROM channel_actions WHERE channel_order_id = ? AND status = 'needs_reconciliation'").get(order.id);
  if (unresolved) fail(409, 'A previous request may have reached the provider. Wait for its status webhook before sending another one.');
  if (order.simulated) {
    assertPermission(ctx, action === 'reject' ? 'orders.cancel' : 'orders.create');
    const next = action === 'accept' ? 'acknowledged' : action === 'ready' ? 'food_ready' : 'cancelled';
    if (action === 'ready' && !['acknowledged', 'food_ready', 'preparing'].includes(order.provider_state) && order.fulfilment_state === 'new') fail(409, 'Simulate acceptance before marking it ready.');
    db.prepare('UPDATE channel_orders SET provider_state = ?, fulfilment_state = ?, updated_at = ? WHERE id = ?').run(next, action === 'reject' ? 'cancelled' : action === 'ready' ? 'ready' : 'preparing', Date.now(), order.id);
    db.prepare("INSERT INTO channel_actions (id, restaurant_id, channel_order_id, kind, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 'simulated', 0, ?, ?)").run(newId(), ctx.restaurantId, order.id, action, Date.now(), Date.now());
    return presentOrder(db.prepare('SELECT * FROM channel_orders WHERE id = ?').get(order.id));
  }
  if (order.transport !== 'urbanpiper' || order.channel !== 'swiggy') fail(409, 'This route cannot send that action.');
  if (!urbanpiperConfig().configured) fail(409, 'UrbanPiper credentials are not set, so the action was not sent.');
  if (action === 'accept' && order.kot_created) return presentOrder(order);
  if (action === 'reject') {
    assertPermission(ctx, 'orders.cancel');
    if (!order.can_reject) fail(409, 'Swiggy does not allow this order to be rejected directly.');
    if (!REASONS.includes(payload.reasonCode)) fail(400, 'Choose a documented cancellation reason.');
    await sendStatus(db, order, 'reject', { new_status: 'Cancelled', reason_code: payload.reasonCode, extra: { swiggy_direct_cancellation: true } });
    db.prepare("UPDATE channel_orders SET provider_state = 'cancelled', fulfilment_state = 'cancelled', attention = 'cancelled', updated_at = ? WHERE id = ?").run(Date.now(), order.id);
    if (order.order_id) db.prepare("UPDATE orders SET status = 'cancelled', channel_alert = 'cancel', updated_at = ? WHERE id = ?").run(Date.now(), order.order_id);
  } else if (action === 'accept') {
    assertPermission(ctx, 'orders.create');
    await sendStatus(db, order, 'accept', { new_status: 'Acknowledged', message: 'Accepted in RasoiSet' });
    db.prepare("UPDATE channel_orders SET provider_state = 'acknowledged', updated_at = ? WHERE id = ?").run(Date.now(), order.id);
    fulfil(db, db.prepare('SELECT * FROM channel_orders WHERE id = ?').get(order.id));
  } else if (action === 'ready') {
    assertPermission(ctx, 'orders.create');
    if (!order.kot_created && order.provider_state === 'placed') fail(409, 'Accept the order before marking it ready.');
    await sendStatus(db, order, 'ready', { new_status: 'Food Ready', message: 'Ready in RasoiSet' });
    db.prepare("UPDATE channel_orders SET provider_state = 'food_ready', fulfilment_state = 'ready', updated_at = ? WHERE id = ?").run(Date.now(), order.id);
    if (order.order_id) db.prepare("UPDATE orders SET status = 'ready', updated_at = ? WHERE id = ? AND status != 'cancelled'").run(Date.now(), order.order_id);
  } else fail(400, 'That action is not supported.');
  return presentOrder(db.prepare('SELECT * FROM channel_orders WHERE id = ?').get(order.id));
}

export function acknowledgeCancellation(db, ctx, id) {
  assertPermission(ctx, 'kds.update');
  const order = db.prepare('SELECT * FROM channel_orders WHERE restaurant_id = ? AND branch_id = ? AND (id = ? OR order_id = ?)').get(ctx.restaurantId, ctx.branchId, id, id);
  if (!order) fail(404, 'Online order not found.');
  if (order.order_id) db.prepare('UPDATE orders SET channel_alert = NULL WHERE id = ? AND restaurant_id = ?').run(order.order_id, ctx.restaurantId);
  db.prepare("UPDATE channel_orders SET attention = CASE WHEN attention = 'cancelled' THEN 'cancel_seen' ELSE attention END WHERE id = ?").run(order.id);
  return { ok: true };
}

export function retryPrint(db, ctx, id) {
  assertPermission(ctx, 'orders.create');
  const order = ownedChannelOrder(db, ctx, id);
  if (!order.order_id) fail(409, 'There is no kitchen ticket to retry.');
  const job = db.prepare('SELECT id, status FROM print_jobs WHERE order_id = ? AND restaurant_id = ? ORDER BY created_at DESC').get(order.order_id, ctx.restaurantId);
  if (!job) {
    db.prepare("INSERT INTO print_jobs (id, restaurant_id, branch_id, order_id, kind, status, detail, created_at, updated_at) VALUES (?, ?, ?, ?, 'kot', 'created', NULL, ?, ?)").run(newId(), ctx.restaurantId, ctx.branchId, order.order_id, Date.now(), Date.now());
  } else if (job.status === 'failed') {
    db.prepare("UPDATE print_jobs SET status = 'created', updated_at = ? WHERE id = ?").run(Date.now(), job.id);
  }
  db.prepare("UPDATE channel_orders SET print_status = 'created', updated_at = ? WHERE id = ?").run(Date.now(), order.id);
  return { ok: true };
}

export function retryPending(db) {
  const due = db.prepare("SELECT * FROM channel_actions WHERE status = 'pending' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ? AND attempts < 5").all(Date.now());
  return due.length;
}

export function drainWaiting(db) {
  const waiting = db.prepare("SELECT * FROM channel_events WHERE status = 'waiting' ORDER BY received_at ASC LIMIT 50").all();
  for (const event of waiting) {
    const body = JSON.parse(event.redacted_json);
    transaction(db, () => {
      if (event.kind === 'status') applyStatus(db, body, event.id);
      if (event.kind === 'rider') applyRider(db, body, event.id);
    });
  }
}

export function purgeOldEvents(db) {
  db.prepare("DELETE FROM channel_events WHERE status IN ('processed', 'duplicate', 'ignored_stale') AND received_at < ?").run(Date.now() - 30 * 86400000);
}

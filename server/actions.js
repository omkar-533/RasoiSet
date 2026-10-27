import { hashSecret, newId } from './auth.js';
import { deleteMenuImageKey } from './menuImages.js';
import { priceOrder, toPaise, toRupees } from './money.js';
import { assertPermission, canAccessBranch } from './permissions.js';
import { resetDemoRestaurant } from './seedDemo.js';

function fail(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  throw error;
}

function audit(db, ctx, action, entity, entityId, detail) {
  db.prepare(
    'INSERT INTO audit_log (id, restaurant_id, user_id, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(newId(), ctx.restaurantId, ctx.userId, action, entity, entityId || null, detail ? JSON.stringify(detail) : null, Date.now());
}

function restaurantRow(db, ctx) {
  return db.prepare('SELECT * FROM restaurants WHERE id = ?').get(ctx.restaurantId);
}

function scopedOrder(db, ctx, id) {
  return db.prepare('SELECT * FROM orders WHERE id = ? AND restaurant_id = ? AND branch_id = ?').get(id, ctx.restaurantId, ctx.branchId);
}

function requireVersion(order, version) {
  if (Number(version) !== order.version) fail(409, 'This order was updated on another device. Refresh and try again.', 'conflict');
}

function resolveLines(db, ctx, lines) {
  if (!Array.isArray(lines) || lines.length === 0) fail(400, 'Add at least one item.');
  const resolved = [];
  for (const line of lines) {
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) fail(400, 'Invalid quantity.');
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?').get(line.menuItemId, ctx.restaurantId);
    if (!item || !item.available) fail(400, 'An item is unavailable.');
    resolved.push({ item, qty, notes: String(line.notes || '').slice(0, 200) });
  }
  return resolved;
}

function consumeRecipes(db, ctx, orderId, resolved) {
  for (const line of resolved) {
    const recipe = line.item.recipe_json ? JSON.parse(line.item.recipe_json) : [];
    for (const part of recipe) {
      const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ? AND restaurant_id = ?').get(part.ingredientId, ctx.restaurantId);
      if (!ingredient) continue;
      const delta = -Number(part.quantity) * line.qty;
      db.prepare(
        `INSERT INTO stock_movements (id, restaurant_id, branch_id, ingredient_id, qty_delta, reason, ref_type, ref_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'recipe', 'order', ?, ?, ?)`
      ).run(newId(), ctx.restaurantId, ctx.branchId, ingredient.id, delta, orderId, ctx.userId, Date.now());
      db.prepare('UPDATE ingredients SET stock = ?, last_updated = ? WHERE id = ? AND restaurant_id = ?').run(
        Math.max(0, ingredient.stock + delta),
        Date.now(),
        ingredient.id,
        ctx.restaurantId
      );
    }
  }
}

function nextNumber(db, branchId) {
  const row = db.prepare('SELECT next_number FROM order_counters WHERE branch_id = ?').get(branchId);
  const number = row?.next_number || 1001;
  db.prepare('UPDATE order_counters SET next_number = ? WHERE branch_id = ?').run(number + 1, branchId);
  return number;
}

function insertOrder(db, ctx, { type, tableId, customerId, resolved, discount, status, payment, itemStatus }) {
  const restaurant = restaurantRow(db, ctx);
  if (Number(discount) > 0) assertPermission(ctx, 'orders.discount');
  const priced = priceOrder(
    resolved.map((line) => ({ pricePaise: line.item.price_paise, qty: line.qty })),
    discount,
    restaurant.default_tax
  );
  let table = null;
  if (tableId) {
    table = db.prepare('SELECT * FROM dining_tables WHERE id = ? AND restaurant_id = ? AND branch_id = ?').get(tableId, ctx.restaurantId, ctx.branchId);
    if (!table) fail(400, 'Table is not on this branch.');
  }
  if (customerId) {
    const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND restaurant_id = ?').get(customerId, ctx.restaurantId);
    if (!customer) fail(400, 'Customer was not found.');
  }
  const orderId = newId();
  const now = Date.now();
  const number = nextNumber(db, ctx.branchId);
  db.prepare(
    `INSERT INTO orders (id, restaurant_id, branch_id, number, type, table_id, customer_id, status, payment, discount_paise, tax_paise, subtotal_paise, total_paise, notes, served_by, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)`
  ).run(
    orderId,
    ctx.restaurantId,
    ctx.branchId,
    number,
    type,
    table?.id || null,
    customerId || null,
    status,
    payment,
    priced.discountPaise,
    priced.taxPaise,
    priced.subtotalPaise,
    priced.totalPaise,
    ctx.userId,
    now,
    now
  );
  for (const line of resolved) {
    db.prepare(
      `INSERT INTO order_items (id, order_id, restaurant_id, menu_item_id, name, price_paise, qty, notes, modifiers_json, status, kot_batch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`
    ).run(newId(), orderId, ctx.restaurantId, line.item.id, line.item.name, line.item.price_paise, line.qty, line.notes || null, itemStatus);
  }
  if (table && status !== 'completed') {
    db.prepare('UPDATE dining_tables SET status = ?, current_order_id = ? WHERE id = ? AND restaurant_id = ?').run('occupied', orderId, table.id, ctx.restaurantId);
  }
  consumeRecipes(db, ctx, orderId, resolved);
  const jobId = newId();
  db.prepare(
    `INSERT INTO print_jobs (id, restaurant_id, branch_id, order_id, kind, status, detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'created', NULL, ?, ?)`
  ).run(jobId, ctx.restaurantId, ctx.branchId, orderId, status === 'completed' ? 'receipt' : 'kot', now, now);
  audit(db, ctx, status === 'completed' ? 'order.pay' : 'order.kot', 'order', orderId, { number, total: toRupees(priced.totalPaise) });
  return { orderId, printJobId: jobId };
}

function replay(db, ctx, key) {
  if (!key) return null;
  const row = db.prepare('SELECT order_id FROM idempotency_keys WHERE restaurant_id = ? AND key = ?').get(ctx.restaurantId, key);
  if (!row) return null;
  const order = db.prepare('SELECT id, branch_id FROM orders WHERE id = ? AND restaurant_id = ?').get(row.order_id, ctx.restaurantId);
  return order || { missing: true };
}

function remember(db, ctx, key, orderId) {
  if (!key) return;
  db.prepare('INSERT INTO idempotency_keys (restaurant_id, key, order_id, created_at) VALUES (?, ?, ?, ?)').run(ctx.restaurantId, String(key).slice(0, 80), orderId, Date.now());
}

const PAYMENTS = new Set(['cash', 'card', 'upi', 'wallet']);

export function performAction(db, ctx, action, payload = {}) {
  if (action === 'switchRestaurant') {
    if (ctx.platformRole !== 'super_admin') fail(403, 'Only a super admin can switch restaurants.');
    const restaurant = db.prepare('SELECT id FROM restaurants WHERE id = ?').get(payload.restaurantId);
    if (!restaurant) fail(404, 'Restaurant not found.');
    const branch = db.prepare('SELECT id FROM branches WHERE restaurant_id = ? ORDER BY name LIMIT 1').get(restaurant.id);
    if (!branch) fail(400, 'This restaurant has no branch.');
    db.prepare('UPDATE sessions SET restaurant_id = ?, branch_id = ? WHERE id = ?').run(restaurant.id, branch.id, ctx.sessionId);
    ctx.restaurantId = restaurant.id;
    ctx.branchId = branch.id;
    audit(db, ctx, 'restaurant.switch', 'restaurant', restaurant.id);
    return { reload: true };
  }
  if (action === 'placeOrder' || action === 'saveAsKOT') {
    assertPermission(ctx, action === 'placeOrder' ? 'orders.pay' : 'orders.create');
    const existing = replay(db, ctx, payload.idempotencyKey);
    if (existing?.id) {
      if (existing.branch_id !== ctx.branchId) fail(409, 'This submission belongs to another branch.');
      const job = db.prepare('SELECT id FROM print_jobs WHERE order_id = ? AND restaurant_id = ? ORDER BY created_at DESC').get(existing.id, ctx.restaurantId);
      return { orderId: existing.id, printJobId: job?.id, replayed: true };
    }
    const type = ['dine-in', 'takeaway', 'delivery', 'online'].includes(payload.type) ? payload.type : 'dine-in';
    const resolved = resolveLines(db, ctx, payload.lines);
    if (action === 'placeOrder' && !PAYMENTS.has(payload.payment)) fail(400, 'Choose a payment method.');
    const created = insertOrder(db, ctx, {
      type,
      tableId: type === 'dine-in' ? payload.tableId : null,
      customerId: payload.customerId,
      resolved,
      discount: payload.discount,
      status: action === 'placeOrder' ? 'completed' : 'preparing',
      payment: action === 'placeOrder' ? payload.payment : 'unpaid',
      itemStatus: action === 'placeOrder' ? 'served' : 'new',
    });
    if (action === 'placeOrder') {
      db.prepare(
        `INSERT INTO payments (id, restaurant_id, branch_id, order_id, method, amount_paise, status, recorded_by, created_at)
         VALUES (?, ?, ?, ?, ?, (SELECT total_paise FROM orders WHERE id = ?), 'recorded_manual', ?, ?)`
      ).run(newId(), ctx.restaurantId, ctx.branchId, created.orderId, payload.payment, created.orderId, ctx.userId, Date.now());
      if (payload.customerId) creditCustomer(db, ctx, payload.customerId, created.orderId);
    }
    remember(db, ctx, payload.idempotencyKey, created.orderId);
    return created;
  }

  if (action === 'payOrder') {
    assertPermission(ctx, 'orders.pay');
    if (!PAYMENTS.has(payload.method)) fail(400, 'Choose a payment method.');
    const order = scopedOrder(db, ctx, payload.id);
    if (!order) fail(404, 'Order not found.');
    requireVersion(order, payload.version);
    if (order.status === 'cancelled') fail(400, 'Cancelled orders cannot be paid.');
    if (order.payment === 'channel' || order.channel) fail(409, 'This aggregator order is not collected by the cashier.');
    if (order.payment !== 'unpaid') fail(409, 'This order is already settled.');
    const now = Date.now();
    db.prepare('UPDATE orders SET payment = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ? AND restaurant_id = ?').run(
      payload.method,
      'completed',
      now,
      order.id,
      ctx.restaurantId
    );
    db.prepare(
      `INSERT INTO payments (id, restaurant_id, branch_id, order_id, method, amount_paise, status, recorded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'recorded_manual', ?, ?)`
    ).run(newId(), ctx.restaurantId, ctx.branchId, order.id, payload.method, order.total_paise, ctx.userId, now);
    db.prepare(
      `UPDATE dining_tables SET status = 'cleaning', current_order_id = NULL WHERE current_order_id = ? AND restaurant_id = ? AND branch_id = ?`
    ).run(order.id, ctx.restaurantId, ctx.branchId);
    if (order.customer_id) creditCustomer(db, ctx, order.customer_id, order.id);
    audit(db, ctx, 'order.pay', 'order', order.id, { method: payload.method, manual: true });
    return {};
  }

  if (action === 'cancelOrder') {
    assertPermission(ctx, 'orders.cancel');
    const order = scopedOrder(db, ctx, payload.id);
    if (!order) fail(404, 'Order not found.');
    requireVersion(order, payload.version);
    if (order.status === 'cancelled') return {};
    if (order.channel) fail(409, 'Cancel this order from Online orders so the delivery platform is updated.');
    if (order.payment !== 'unpaid') fail(400, 'Paid orders cannot be deleted. Record a refund instead.');
    db.prepare('UPDATE orders SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND restaurant_id = ?').run('cancelled', Date.now(), order.id, ctx.restaurantId);
    db.prepare(
      `UPDATE dining_tables SET status = 'free', current_order_id = NULL WHERE current_order_id = ? AND restaurant_id = ? AND branch_id = ?`
    ).run(order.id, ctx.restaurantId, ctx.branchId);
    audit(db, ctx, 'order.cancel', 'order', order.id, { reason: String(payload.reason || '').slice(0, 200) });
    return {};
  }

  if (action === 'addItemsToOrder') return addItemsToOrder(db, ctx, payload);
  if (action === 'refundOrder') return refundOrder(db, ctx, payload);
  if (action === 'openShift') return openShift(db, ctx, payload);
  if (action === 'closeShift') return closeShift(db, ctx, payload);
  if (action === 'previewMenuImport') return previewMenuImport(ctx, payload);
  if (action === 'commitMenuImport') return commitMenuImport(db, ctx, payload);

  if (action === 'updateOrderStatus' || action === 'updateOrderItemStatus') {
    assertPermission(ctx, 'kds.update');
    const order = scopedOrder(db, ctx, payload.orderId || payload.id);
    if (!order) fail(404, 'Order not found.');
    requireVersion(order, payload.version);
    if (action === 'updateOrderStatus') {
      const allowed = new Set(['pending', 'preparing', 'ready', 'served', 'completed']);
      if (!allowed.has(payload.status)) fail(400, 'Invalid status.');
      db.prepare('UPDATE orders SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND restaurant_id = ?').run(payload.status, Date.now(), order.id, ctx.restaurantId);
    } else {
      const allowed = new Set(['new', 'preparing', 'ready', 'served']);
      if (!allowed.has(payload.status)) fail(400, 'Invalid item status.');
      const item = db.prepare('SELECT id FROM order_items WHERE id = ? AND order_id = ? AND restaurant_id = ?').get(payload.itemId, order.id, ctx.restaurantId);
      if (!item) fail(404, 'Item not found.');
      db.prepare('UPDATE order_items SET status = ? WHERE id = ? AND restaurant_id = ?').run(payload.status, item.id, ctx.restaurantId);
      db.prepare('UPDATE orders SET version = version + 1, updated_at = ? WHERE id = ? AND restaurant_id = ?').run(Date.now(), order.id, ctx.restaurantId);
    }
    audit(db, ctx, action, 'order', order.id, { status: payload.status });
    return {};
  }

  if (action === 'upsertCategory') return upsertCategory(db, ctx, payload);
  if (action === 'deleteCategory') return deleteCategory(db, ctx, payload);
  if (action === 'upsertMenuItem') return upsertMenuItem(db, ctx, payload);
  if (action === 'deleteMenuItem') return deleteMenuItem(db, ctx, payload);
  if (action === 'toggleAvailability') return toggleAvailability(db, ctx, payload);
  if (action === 'upsertTable') return upsertTable(db, ctx, payload);
  if (action === 'deleteTable') return deleteTable(db, ctx, payload);
  if (action === 'setTableStatus') return setTableStatus(db, ctx, payload);
  if (action === 'upsertCustomer') return upsertCustomer(db, ctx, payload);
  if (action === 'deleteCustomer') return deleteCustomer(db, ctx, payload);
  if (action === 'upsertIngredient') return upsertIngredient(db, ctx, payload);
  if (action === 'deleteIngredient') return deleteIngredient(db, ctx, payload);
  if (action === 'adjustStock') return adjustStock(db, ctx, payload);
  if (action === 'upsertVendor') return upsertVendor(db, ctx, payload);
  if (action === 'deleteVendor') return deleteVendor(db, ctx, payload);
  if (action === 'upsertStaff') return upsertStaff(db, ctx, payload);
  if (action === 'deleteStaff') return deleteStaff(db, ctx, payload);
  if (action === 'updateSettings') return updateSettings(db, ctx, payload);
  if (action === 'resetDemoData') {
    assertPermission(ctx, 'demo.reset');
    resetDemoRestaurant(db, ctx.restaurantId);
    audit(db, ctx, 'demo.reset', 'restaurant', ctx.restaurantId);
    return { reload: true };
  }
  fail(404, 'Unknown action.');
}

function creditCustomer(db, ctx, customerId, orderId) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND restaurant_id = ?').get(customerId, ctx.restaurantId);
  const order = db.prepare('SELECT total_paise FROM orders WHERE id = ? AND restaurant_id = ?').get(orderId, ctx.restaurantId);
  if (!customer || !order) return;
  const restaurant = restaurantRow(db, ctx);
  const points = Math.floor((toRupees(order.total_paise) * restaurant.loyalty_percent) / 100);
  db.prepare(
    `UPDATE customers SET visits = visits + 1, total_spent_paise = total_spent_paise + ?, loyalty_points = loyalty_points + ?, last_visit = ? WHERE id = ? AND restaurant_id = ?`
  ).run(order.total_paise, points, Date.now(), customer.id, ctx.restaurantId);
}

function upsertCategory(db, ctx, payload) {
  assertPermission(ctx, 'menu.write');
  const name = String(payload.name || '').trim();
  if (!name) fail(400, 'Category name is required.');
  const id = payload.id || newId();
  const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (existing) {
    const owned = db.prepare('SELECT id FROM categories WHERE id = ? AND restaurant_id = ?').get(id, ctx.restaurantId);
    if (!owned) fail(404, 'Category not found.');
    db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ? AND restaurant_id = ?').run(name, payload.color || null, id, ctx.restaurantId);
  } else {
    db.prepare('INSERT INTO categories (id, restaurant_id, name, color, icon) VALUES (?, ?, ?, ?, NULL)').run(id, ctx.restaurantId, name, payload.color || null);
  }
  return {};
}

function deleteCategory(db, ctx, payload) {
  assertPermission(ctx, 'menu.write');
  const owned = db.prepare('SELECT id FROM categories WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!owned) fail(404, 'Category not found.');
  const images = db.prepare('SELECT image_key FROM menu_items WHERE category_id = ? AND restaurant_id = ? AND image_key IS NOT NULL').all(payload.id, ctx.restaurantId);
  db.prepare('DELETE FROM menu_items WHERE category_id = ? AND restaurant_id = ?').run(payload.id, ctx.restaurantId);
  for (const row of images) deleteMenuImageKey(row.image_key);
  db.prepare('DELETE FROM categories WHERE id = ? AND restaurant_id = ?').run(payload.id, ctx.restaurantId);
  return {};
}

function upsertMenuItem(db, ctx, payload) {
  assertPermission(ctx, 'menu.write');
  const name = String(payload.name || '').trim();
  if (!name) fail(400, 'Item name is required.');
  const category = db.prepare('SELECT id FROM categories WHERE id = ? AND restaurant_id = ?').get(payload.categoryId, ctx.restaurantId);
  if (!category) fail(400, 'Choose a category on this restaurant.');
  const price = Number(payload.price);
  if (!Number.isFinite(price) || price < 0) fail(400, 'Invalid price.');
  const id = payload.id || newId();
  const existing = db.prepare('SELECT id, restaurant_id FROM menu_items WHERE id = ?').get(id);
  const values = [payload.categoryId, name, toPaise(price), payload.description || null, payload.veg ? 1 : 0, payload.available === false ? 0 : 1, Number(payload.tax) || 0, payload.recipe ? JSON.stringify(payload.recipe) : null, id, ctx.restaurantId];
  if (existing) {
    if (existing.restaurant_id !== ctx.restaurantId) fail(404, 'Item not found.');
    db.prepare(
      `UPDATE menu_items SET category_id = ?, name = ?, price_paise = ?, description = ?, veg = ?, available = ?, tax = ?, recipe_json = ? WHERE id = ? AND restaurant_id = ?`
    ).run(...values);
  } else {
    db.prepare(
      `INSERT INTO menu_items (category_id, name, price_paise, description, veg, available, tax, recipe_json, id, restaurant_id, modifiers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).run(...values);
  }
  return {};
}

function deleteMenuItem(db, ctx, payload) {
  assertPermission(ctx, 'menu.write');
  const owned = db.prepare('SELECT id, image_key FROM menu_items WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!owned) fail(404, 'Item not found.');
  db.prepare('DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?').run(payload.id, ctx.restaurantId);
  deleteMenuImageKey(owned.image_key);
  return {};
}

function toggleAvailability(db, ctx, payload) {
  assertPermission(ctx, 'menu.write');
  const item = db.prepare('SELECT available FROM menu_items WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!item) fail(404, 'Item not found.');
  db.prepare('UPDATE menu_items SET available = ? WHERE id = ? AND restaurant_id = ?').run(item.available ? 0 : 1, payload.id, ctx.restaurantId);
  return {};
}

function upsertTable(db, ctx, payload) {
  assertPermission(ctx, 'tables.write');
  const name = String(payload.name || '').trim();
  if (!name) fail(400, 'Table name is required.');
  const id = payload.id || newId();
  const existing = db.prepare('SELECT id, restaurant_id FROM dining_tables WHERE id = ?').get(id);
  if (existing && existing.restaurant_id !== ctx.restaurantId) fail(404, 'Table not found.');
  if (existing) {
    db.prepare('UPDATE dining_tables SET name = ?, area = ?, seats = ? WHERE id = ? AND restaurant_id = ? AND branch_id = ?').run(
      name,
      payload.area || 'Indoor',
      Number(payload.seats) || 2,
      id,
      ctx.restaurantId,
      ctx.branchId
    );
  } else {
    db.prepare(
      `INSERT INTO dining_tables (id, restaurant_id, branch_id, name, area, seats, status, current_order_id)
       VALUES (?, ?, ?, ?, ?, ?, 'free', NULL)`
    ).run(id, ctx.restaurantId, ctx.branchId, name, payload.area || 'Indoor', Number(payload.seats) || 2);
  }
  return {};
}

function deleteTable(db, ctx, payload) {
  assertPermission(ctx, 'tables.write');
  const table = db.prepare('SELECT * FROM dining_tables WHERE id = ? AND restaurant_id = ? AND branch_id = ?').get(payload.id, ctx.restaurantId, ctx.branchId);
  if (!table) fail(404, 'Table not found.');
  if (table.current_order_id) fail(400, 'Move or settle the open order before deleting this table.');
  db.prepare('DELETE FROM dining_tables WHERE id = ? AND restaurant_id = ?').run(table.id, ctx.restaurantId);
  return {};
}

function setTableStatus(db, ctx, payload) {
  assertPermission(ctx, 'tables.write');
  const allowed = new Set(['free', 'occupied', 'reserved', 'cleaning']);
  if (!allowed.has(payload.status)) fail(400, 'Invalid table status.');
  const table = db.prepare('SELECT * FROM dining_tables WHERE id = ? AND restaurant_id = ? AND branch_id = ?').get(payload.id, ctx.restaurantId, ctx.branchId);
  if (!table) fail(404, 'Table not found.');
  if ((payload.status === 'free' || payload.status === 'cleaning') && table.current_order_id) {
    const order = db.prepare('SELECT payment, status FROM orders WHERE id = ? AND restaurant_id = ?').get(table.current_order_id, ctx.restaurantId);
    if (order && order.payment === 'unpaid' && order.status !== 'cancelled') {
      fail(409, 'This table has an unpaid order. Settle or cancel it before closing the table.');
    }
  }
  db.prepare('UPDATE dining_tables SET status = ? WHERE id = ? AND restaurant_id = ?').run(payload.status, table.id, ctx.restaurantId);
  return {};
}

function upsertCustomer(db, ctx, payload) {
  assertPermission(ctx, 'customers.write');
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').trim();
  if (!name || !phone) fail(400, 'Name and phone are required.');
  const id = payload.id || newId();
  const existing = db.prepare('SELECT id, restaurant_id FROM customers WHERE id = ?').get(id);
  if (existing && existing.restaurant_id !== ctx.restaurantId) fail(404, 'Customer not found.');
  if (existing) {
    db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, address = ? WHERE id = ? AND restaurant_id = ?').run(name, phone, payload.email || null, payload.address || null, id, ctx.restaurantId);
  } else {
    db.prepare(
      `INSERT INTO customers (id, restaurant_id, name, phone, email, address, loyalty_points, visits, total_spent_paise, last_visit)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NULL)`
    ).run(id, ctx.restaurantId, name, phone, payload.email || null, payload.address || null);
  }
  return { customerId: id };
}

function deleteCustomer(db, ctx, payload) {
  assertPermission(ctx, 'customers.write');
  const owned = db.prepare('SELECT id FROM customers WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!owned) fail(404, 'Customer not found.');
  db.prepare('DELETE FROM customers WHERE id = ? AND restaurant_id = ?').run(payload.id, ctx.restaurantId);
  return {};
}

function upsertIngredient(db, ctx, payload) {
  assertPermission(ctx, 'inventory.adjust');
  const name = String(payload.name || '').trim();
  if (!name) fail(400, 'Ingredient name is required.');
  const id = payload.id || newId();
  const existing = db.prepare('SELECT id, restaurant_id, stock FROM ingredients WHERE id = ?').get(id);
  if (existing && existing.restaurant_id !== ctx.restaurantId) fail(404, 'Ingredient not found.');
  if (existing) {
    db.prepare('UPDATE ingredients SET name = ?, unit = ?, min_stock = ?, cost_paise = ?, vendor_id = ?, last_updated = ? WHERE id = ? AND restaurant_id = ?').run(
      name,
      payload.unit || 'kg',
      Number(payload.minStock) || 0,
      toPaise(payload.costPerUnit || 0),
      payload.vendorId || null,
      Date.now(),
      id,
      ctx.restaurantId
    );
  } else {
    const stock = Number(payload.stock) || 0;
    db.prepare(
      `INSERT INTO ingredients (id, restaurant_id, name, unit, stock, min_stock, cost_paise, vendor_id, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, ctx.restaurantId, name, payload.unit || 'kg', stock, Number(payload.minStock) || 0, toPaise(payload.costPerUnit || 0), payload.vendorId || null, Date.now());
    db.prepare(
      `INSERT INTO stock_movements (id, restaurant_id, branch_id, ingredient_id, qty_delta, reason, ref_type, ref_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'opening', 'ingredient', ?, ?, ?)`
    ).run(newId(), ctx.restaurantId, ctx.branchId, id, stock, id, ctx.userId, Date.now());
  }
  return {};
}

function deleteIngredient(db, ctx, payload) {
  assertPermission(ctx, 'inventory.adjust');
  const owned = db.prepare('SELECT id FROM ingredients WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!owned) fail(404, 'Ingredient not found.');
  db.prepare('DELETE FROM ingredients WHERE id = ? AND restaurant_id = ?').run(payload.id, ctx.restaurantId);
  return {};
}

function adjustStock(db, ctx, payload) {
  assertPermission(ctx, 'inventory.adjust');
  const delta = Number(payload.delta);
  if (!Number.isFinite(delta) || delta === 0) fail(400, 'Invalid stock adjustment.');
  const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!ingredient) fail(404, 'Ingredient not found.');
  db.prepare(
    `INSERT INTO stock_movements (id, restaurant_id, branch_id, ingredient_id, qty_delta, reason, ref_type, ref_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'adjustment', 'ingredient', ?, ?, ?)`
  ).run(newId(), ctx.restaurantId, ctx.branchId, ingredient.id, delta, ingredient.id, ctx.userId, Date.now());
  db.prepare('UPDATE ingredients SET stock = ?, last_updated = ? WHERE id = ? AND restaurant_id = ?').run(
    Math.max(0, ingredient.stock + delta),
    Date.now(),
    ingredient.id,
    ctx.restaurantId
  );
  audit(db, ctx, 'stock.adjust', 'ingredient', ingredient.id, { delta });
  return {};
}

function upsertVendor(db, ctx, payload) {
  assertPermission(ctx, 'vendors.write');
  const name = String(payload.name || '').trim();
  if (!name) fail(400, 'Vendor name is required.');
  const id = payload.id || newId();
  const existing = db.prepare('SELECT restaurant_id FROM vendors WHERE id = ?').get(id);
  if (existing && existing.restaurant_id !== ctx.restaurantId) fail(404, 'Vendor not found.');
  if (existing) {
    db.prepare('UPDATE vendors SET name = ?, phone = ?, category = ? WHERE id = ? AND restaurant_id = ?').run(name, payload.phone || '', payload.category || '', id, ctx.restaurantId);
  } else {
    db.prepare('INSERT INTO vendors (id, restaurant_id, name, phone, category) VALUES (?, ?, ?, ?, ?)').run(id, ctx.restaurantId, name, payload.phone || '', payload.category || '');
  }
  return {};
}

function deleteVendor(db, ctx, payload) {
  assertPermission(ctx, 'vendors.write');
  const owned = db.prepare('SELECT id FROM vendors WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!owned) fail(404, 'Vendor not found.');
  db.prepare('DELETE FROM vendors WHERE id = ? AND restaurant_id = ?').run(payload.id, ctx.restaurantId);
  return {};
}

function upsertStaff(db, ctx, payload) {
  assertPermission(ctx, 'staff.write');
  const name = String(payload.name || '').trim();
  if (!name) fail(400, 'Staff name is required.');
  const id = payload.id || newId();
  const existing = db.prepare('SELECT restaurant_id, pin_hash FROM staff WHERE id = ?').get(id);
  if (existing && existing.restaurant_id !== ctx.restaurantId) fail(404, 'Staff member not found.');
  const pin = String(payload.pin || '');
  const pinHash = pin ? hashSecret(pin) : existing?.pin_hash || null;
  if (existing) {
    db.prepare('UPDATE staff SET name = ?, role = ?, phone = ?, email = ?, active = ?, pin_hash = ? WHERE id = ? AND restaurant_id = ?').run(
      name,
      payload.role || 'waiter',
      payload.phone || '',
      payload.email || null,
      payload.active === false ? 0 : 1,
      pinHash,
      id,
      ctx.restaurantId
    );
  } else {
    db.prepare(
      `INSERT INTO staff (id, restaurant_id, branch_id, name, role, phone, email, active, pin_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, ctx.restaurantId, ctx.branchId, name, payload.role || 'waiter', payload.phone || '', payload.email || null, payload.active === false ? 0 : 1, pinHash);
  }
  return {};
}

function deleteStaff(db, ctx, payload) {
  assertPermission(ctx, 'staff.write');
  const owned = db.prepare('SELECT id FROM staff WHERE id = ? AND restaurant_id = ?').get(payload.id, ctx.restaurantId);
  if (!owned) fail(404, 'Staff member not found.');
  db.prepare('DELETE FROM staff WHERE id = ? AND restaurant_id = ?').run(payload.id, ctx.restaurantId);
  return {};
}

function updateSettings(db, ctx, payload) {
  assertPermission(ctx, 'settings.write');
  const restaurant = restaurantRow(db, ctx);
  db.prepare(
    `UPDATE restaurants SET name = ?, currency = ?, tax_label = ?, default_tax = ?, service_charge = ?, printer_width = ?, loyalty_percent = ?, invoice_prefix = ?, footer_note = ? WHERE id = ?`
  ).run(
    String(payload.restaurantName || restaurant.name).slice(0, 80),
    String(payload.currency || restaurant.currency).slice(0, 8),
    String(payload.taxLabel || restaurant.tax_label).slice(0, 20),
    Number(payload.defaultTax ?? restaurant.default_tax) || 0,
    Number(payload.serviceCharge ?? restaurant.service_charge) || 0,
    Number(payload.printerWidth) || restaurant.printer_width,
    Number(payload.loyaltyPercent ?? restaurant.loyalty_percent) || 0,
    String(payload.invoicePrefix || restaurant.invoice_prefix).slice(0, 12),
    String(payload.footerNote ?? restaurant.footer_note).slice(0, 200),
    ctx.restaurantId
  );
  if (Array.isArray(payload.outlets)) {
    const incoming = payload.outlets;
    const current = db.prepare('SELECT id FROM branches WHERE restaurant_id = ?').all(ctx.restaurantId);
    const keep = new Set(incoming.map((o) => o.id).filter(Boolean));
    for (const branch of current) {
      if (!keep.has(branch.id)) {
        const orders = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE branch_id = ? AND restaurant_id = ?').get(branch.id, ctx.restaurantId);
        if (orders.n > 0) fail(400, 'A branch with orders cannot be removed.');
        if (current.length <= 1) fail(400, 'At least one branch is required.');
        db.prepare('DELETE FROM dining_tables WHERE branch_id = ? AND restaurant_id = ?').run(branch.id, ctx.restaurantId);
        db.prepare('DELETE FROM order_counters WHERE branch_id = ?').run(branch.id);
        db.prepare('DELETE FROM branches WHERE id = ? AND restaurant_id = ?').run(branch.id, ctx.restaurantId);
      }
    }
    for (const outlet of incoming) {
      const name = String(outlet.name || '').trim();
      if (!name) fail(400, 'Branch name is required.');
      const owned = outlet.id ? db.prepare('SELECT id, restaurant_id FROM branches WHERE id = ?').get(outlet.id) : null;
      if (owned && owned.restaurant_id !== ctx.restaurantId) fail(404, 'Branch not found.');
      if (owned) {
        db.prepare('UPDATE branches SET name = ?, address = ?, phone = ?, gstin = ? WHERE id = ? AND restaurant_id = ?').run(
          name,
          outlet.address || '',
          outlet.phone || '',
          outlet.gstin || null,
          outlet.id,
          ctx.restaurantId
        );
      } else {
        const plan = restaurant.plan_code || 'starter';
        const branchCount = db.prepare('SELECT COUNT(*) AS n FROM branches WHERE restaurant_id = ?').get(ctx.restaurantId).n;
        if (plan !== 'multi-outlet' && branchCount >= 1) {
          fail(403, 'This restaurant is on a single-outlet setup. Another outlet is not included, and no price is configured.');
        }
        const id = newId();
        db.prepare('INSERT INTO branches (id, restaurant_id, name, address, phone, gstin) VALUES (?, ?, ?, ?, ?, ?)').run(id, ctx.restaurantId, name, outlet.address || '', outlet.phone || '', outlet.gstin || null);
        db.prepare('INSERT INTO order_counters (branch_id, next_number) VALUES (?, 1001)').run(id);
      }
    }
  }
  if (payload.activeOutletId && payload.activeOutletId !== ctx.branchId) {
    if (!canAccessBranch(ctx, payload.activeOutletId)) fail(403, 'You cannot switch to that branch.');
    db.prepare('UPDATE sessions SET branch_id = ? WHERE id = ?').run(payload.activeOutletId, ctx.sessionId);
    ctx.branchId = payload.activeOutletId;
  }
  audit(db, ctx, 'settings.update', 'restaurant', ctx.restaurantId);
  return { reload: true };
}

function addItemsToOrder(db, ctx, payload) {
  assertPermission(ctx, 'orders.create');
  const existing = replay(db, ctx, payload.idempotencyKey);
  if (existing?.id) {
    if (existing.branch_id !== ctx.branchId) fail(409, 'This submission belongs to another branch.');
    const job = db.prepare('SELECT id, detail FROM print_jobs WHERE order_id = ? AND restaurant_id = ? ORDER BY created_at DESC').get(existing.id, ctx.restaurantId);
    let deltaItemIds = [];
    try {
      deltaItemIds = JSON.parse(job?.detail || '{}').itemIds || [];
    } catch {
      deltaItemIds = [];
    }
    return { orderId: existing.id, printJobId: job?.id || null, deltaItemIds, replayed: true };
  }
  const order = scopedOrder(db, ctx, payload.orderId);
  if (!order) fail(404, 'Order not found.');
  requireVersion(order, payload.version);
  if (order.status === 'cancelled' || order.status === 'completed' || order.payment !== 'unpaid') {
    fail(400, 'Items can only be added to an open, unpaid order.');
  }
  const resolved = resolveLines(db, ctx, payload.lines);
  const batch = db.prepare('SELECT COALESCE(MAX(kot_batch), 0) AS n FROM order_items WHERE order_id = ? AND restaurant_id = ?').get(order.id, ctx.restaurantId).n + 1;
  const itemIds = [];
  for (const line of resolved) {
    const id = newId();
    itemIds.push(id);
    db.prepare(
      `INSERT INTO order_items (id, order_id, restaurant_id, menu_item_id, name, price_paise, qty, notes, modifiers_json, status, kot_batch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'new', ?)`
    ).run(id, order.id, ctx.restaurantId, line.item.id, line.item.name, line.item.price_paise, line.qty, line.notes || null, batch);
  }
  consumeRecipes(db, ctx, order.id, resolved);
  const lines = db.prepare('SELECT price_paise, qty FROM order_items WHERE order_id = ? AND restaurant_id = ?').all(order.id, ctx.restaurantId);
  const restaurant = restaurantRow(db, ctx);
  const priced = priceOrder(
    lines.map((line) => ({ pricePaise: line.price_paise, qty: line.qty })),
    toRupees(order.discount_paise),
    restaurant.default_tax
  );
  const now = Date.now();
  db.prepare(
    `UPDATE orders SET subtotal_paise = ?, discount_paise = ?, tax_paise = ?, total_paise = ?, version = version + 1, updated_at = ? WHERE id = ? AND restaurant_id = ?`
  ).run(priced.subtotalPaise, priced.discountPaise, priced.taxPaise, priced.totalPaise, now, order.id, ctx.restaurantId);
  const jobId = newId();
  db.prepare(
    `INSERT INTO print_jobs (id, restaurant_id, branch_id, order_id, kind, status, detail, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'kot', 'created', ?, ?, ?)`
  ).run(jobId, ctx.restaurantId, ctx.branchId, order.id, JSON.stringify({ batch, itemIds }), now, now);
  remember(db, ctx, payload.idempotencyKey, order.id);
  audit(db, ctx, 'order.kot.add', 'order', order.id, { batch, items: itemIds.length });
  return { orderId: order.id, printJobId: jobId, deltaItemIds: itemIds };
}

function refundOrder(db, ctx, payload) {
  assertPermission(ctx, 'orders.pay');
  const order = scopedOrder(db, ctx, payload.id);
  if (!order) fail(404, 'Order not found.');
  requireVersion(order, payload.version);
  if (order.payment === 'unpaid' || order.status === 'cancelled') fail(400, 'Only a settled order can be refunded.');
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ? AND restaurant_id = ? ORDER BY created_at DESC').get(order.id, ctx.restaurantId);
  if (!payment) fail(400, 'No payment is recorded for this order.');
  const already = db.prepare('SELECT COALESCE(SUM(amount_paise), 0) AS n FROM refunds WHERE order_id = ? AND restaurant_id = ?').get(order.id, ctx.restaurantId).n;
  const amount = toPaise(payload.amount);
  if (!Number.isInteger(amount) || amount < 1) fail(400, 'Enter a refund amount.');
  if (amount > payment.amount_paise - already) fail(400, 'That refund is more than the remaining payment.');
  const reason = String(payload.reason || '').trim();
  if (!reason) fail(400, 'A refund reason is required.');
  const now = Date.now();
  db.prepare(
    `INSERT INTO refunds (id, restaurant_id, branch_id, order_id, payment_id, method, amount_paise, reason, recorded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), ctx.restaurantId, ctx.branchId, order.id, payment.id, payment.method, amount, reason.slice(0, 200), ctx.userId, now);
  db.prepare('UPDATE orders SET version = version + 1, updated_at = ? WHERE id = ? AND restaurant_id = ?').run(now, order.id, ctx.restaurantId);
  audit(db, ctx, 'order.refund', 'order', order.id, { amount: toRupees(amount), method: payment.method });
  return { orderId: order.id };
}

function openShift(db, ctx, payload) {
  assertPermission(ctx, 'orders.pay');
  const open = db.prepare('SELECT id FROM cashier_shifts WHERE restaurant_id = ? AND branch_id = ? AND closed_at IS NULL').get(ctx.restaurantId, ctx.branchId);
  if (open) fail(409, 'A cashier shift is already open on this outlet.');
  const opening = toPaise(payload.openingCash || 0);
  if (!Number.isInteger(opening) || opening < 0) fail(400, 'Enter the opening cash.');
  const now = Date.now();
  const id = newId();
  db.prepare(
    `INSERT INTO cashier_shifts (id, restaurant_id, branch_id, opened_by, opened_at, opening_cash_paise)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, ctx.restaurantId, ctx.branchId, ctx.userId, now, opening);
  audit(db, ctx, 'shift.open', 'shift', id, { openingCash: toRupees(opening) });
  return { shiftId: id };
}

function expectedCash(db, ctx, shift, at) {
  const sales = db.prepare(
    `SELECT COALESCE(SUM(amount_paise), 0) AS n FROM payments
     WHERE restaurant_id = ? AND branch_id = ? AND method = 'cash' AND created_at >= ? AND created_at <= ?`
  ).get(ctx.restaurantId, ctx.branchId, shift.opened_at, at).n;
  const refunded = db.prepare(
    `SELECT COALESCE(SUM(amount_paise), 0) AS n FROM refunds
     WHERE restaurant_id = ? AND branch_id = ? AND method = 'cash' AND created_at >= ? AND created_at <= ?`
  ).get(ctx.restaurantId, ctx.branchId, shift.opened_at, at).n;
  return shift.opening_cash_paise + sales - refunded;
}

function closeShift(db, ctx, payload) {
  assertPermission(ctx, 'orders.pay');
  const shift = db.prepare('SELECT * FROM cashier_shifts WHERE restaurant_id = ? AND branch_id = ? AND closed_at IS NULL').get(ctx.restaurantId, ctx.branchId);
  if (!shift) fail(400, 'No cashier shift is open.');
  const counted = toPaise(payload.countedCash);
  if (!Number.isInteger(counted) || counted < 0) fail(400, 'Enter the counted cash.');
  const now = Date.now();
  const expected = expectedCash(db, ctx, shift, now);
  db.prepare(
    `UPDATE cashier_shifts SET closed_by = ?, closed_at = ?, counted_cash_paise = ?, expected_cash_paise = ?, note = ? WHERE id = ? AND restaurant_id = ?`
  ).run(ctx.userId, now, counted, expected, String(payload.note || '').slice(0, 200), shift.id, ctx.restaurantId);
  audit(db, ctx, 'shift.close', 'shift', shift.id, { expected: toRupees(expected), counted: toRupees(counted) });
  return { shiftId: shift.id, expectedCash: toRupees(expected), countedCash: toRupees(counted) };
}

function parseMenuCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const table = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim())) table.push(row);
      row = [];
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) table.push(row);
  }
  if (table.length < 2) fail(400, 'The file needs a header and at least one item.');
  const header = table[0].map((value) => value.trim().toLowerCase());
  const index = (name) => header.indexOf(name);
  if (index('category') < 0 || index('name') < 0 || index('price') < 0) fail(400, 'The header must include category, name and price.');
  const seen = new Set();
  return table.slice(1, 501).map((values, offset) => {
    const read = (name) => (values[index(name)] || '').trim();
    const errors = [];
    const category = read('category');
    const name = read('name');
    const priceText = read('price');
    const vegText = index('veg') >= 0 ? read('veg').toLowerCase() : '';
    const description = index('description') >= 0 ? read('description') : '';
    const price = Number(priceText);
    if (!category) errors.push('Category is required.');
    if (!name) errors.push('Name is required.');
    if (!Number.isFinite(price) || price < 0) errors.push('Price must be a number that is zero or more.');
    let veg = true;
    if (vegText) {
      if (['yes', 'true', '1', 'veg'].includes(vegText)) veg = true;
      else if (['no', 'false', '0', 'non-veg', 'nonveg'].includes(vegText)) veg = false;
      else errors.push('Veg must be yes or no.');
    }
    const key = `${category.toLowerCase()}|${name.toLowerCase()}`;
    if (name && seen.has(key)) errors.push('This item is repeated in the file.');
    if (name) seen.add(key);
    return { line: offset + 2, category, name, price: Number.isFinite(price) ? price : null, veg, description: description.slice(0, 200), errors };
  });
}

function previewMenuImport(ctx, payload) {
  assertPermission(ctx, 'menu.write');
  return { importPreview: parseMenuCsv(payload.csv) };
}

function commitMenuImport(db, ctx, payload) {
  assertPermission(ctx, 'menu.write');
  const rows = parseMenuCsv(payload.csv);
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.errors.length) {
      skipped += 1;
      continue;
    }
    let category = db.prepare('SELECT id FROM categories WHERE restaurant_id = ? AND lower(name) = lower(?)').get(ctx.restaurantId, row.category);
    if (!category) {
      const id = newId();
      db.prepare('INSERT INTO categories (id, restaurant_id, name, color, icon) VALUES (?, ?, ?, NULL, NULL)').run(id, ctx.restaurantId, row.category);
      category = { id };
    }
    const duplicate = db.prepare('SELECT id FROM menu_items WHERE restaurant_id = ? AND category_id = ? AND lower(name) = lower(?)').get(ctx.restaurantId, category.id, row.name);
    if (duplicate) {
      skipped += 1;
      continue;
    }
    db.prepare(
      `INSERT INTO menu_items (id, restaurant_id, category_id, name, price_paise, description, veg, available, tax, recipe_json, modifiers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, NULL)`
    ).run(newId(), ctx.restaurantId, category.id, row.name, toPaise(row.price), row.description || null, row.veg ? 1 : 0);
    imported += 1;
  }
  audit(db, ctx, 'menu.import', 'menu', ctx.restaurantId, { imported, skipped });
  return { imported, skipped };
}

export function markPrintOpened(db, ctx, id) {
  const job = db.prepare('SELECT * FROM print_jobs WHERE id = ? AND restaurant_id = ? AND branch_id = ?').get(id, ctx.restaurantId, ctx.branchId);
  if (!job) fail(404, 'Print job not found.');
  if (job.status === 'created') {
    db.prepare(
      `UPDATE print_jobs SET status = 'delivery_unknown', detail = ?, updated_at = ? WHERE id = ? AND restaurant_id = ?`
    ).run('Browser print dialog opened. Physical printing was not confirmed.', Date.now(), id, ctx.restaurantId);
  }
  return db.prepare('SELECT id, status, detail, kind FROM print_jobs WHERE id = ?').get(id);
}

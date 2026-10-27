import { hashSecret, newId } from './auth.js';
import { toPaise } from './money.js';
import {
  seedCategories,
  seedCustomers,
  seedIngredients,
  seedMenu,
  seedOrders,
  seedOutlets,
  seedSettings,
  seedStaff,
  seedTables,
  seedVendors,
} from '../src/data/seed.ts';

function insertCatalog(db, restaurantId, branchIds) {
  for (const category of seedCategories) {
    db.prepare('INSERT INTO categories (id, restaurant_id, name, color, icon) VALUES (?, ?, ?, ?, ?)').run(
      `${restaurantId}-${category.id}`,
      restaurantId,
      category.name,
      category.color || null,
      category.icon || null
    );
  }
  for (const item of seedMenu) {
    db.prepare(
      `INSERT INTO menu_items (id, restaurant_id, category_id, name, price_paise, description, veg, available, tax, modifiers_json, recipe_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `${restaurantId}-${item.id}`,
      restaurantId,
      `${restaurantId}-${item.categoryId}`,
      item.name,
      toPaise(item.price),
      item.description || null,
      item.veg ? 1 : 0,
      item.available ? 1 : 0,
      item.tax,
      item.modifiers ? JSON.stringify(item.modifiers) : null,
      item.recipe ? JSON.stringify(item.recipe.map((r) => ({ ...r, ingredientId: `${restaurantId}-${r.ingredientId}` }))) : null
    );
  }
  for (const ingredient of seedIngredients) {
    db.prepare(
      `INSERT INTO ingredients (id, restaurant_id, name, unit, stock, min_stock, cost_paise, vendor_id, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `${restaurantId}-${ingredient.id}`,
      restaurantId,
      ingredient.name,
      ingredient.unit,
      ingredient.stock,
      ingredient.minStock,
      toPaise(ingredient.costPerUnit),
      ingredient.vendorId ? `${restaurantId}-${ingredient.vendorId}` : null,
      ingredient.lastUpdated
    );
  }
  for (const vendor of seedVendors) {
    db.prepare('INSERT INTO vendors (id, restaurant_id, name, phone, category) VALUES (?, ?, ?, ?, ?)').run(
      `${restaurantId}-${vendor.id}`,
      restaurantId,
      vendor.name,
      vendor.phone,
      vendor.category
    );
  }
  for (const person of seedStaff) {
    db.prepare(
      `INSERT INTO staff (id, restaurant_id, branch_id, name, role, phone, email, active, pin_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `${restaurantId}-${person.id}`,
      restaurantId,
      branchIds[0],
      person.name,
      person.role,
      person.phone,
      person.email || null,
      person.active ? 1 : 0,
      hashSecret(person.pin)
    );
  }
  for (const customer of seedCustomers) {
    db.prepare(
      `INSERT INTO customers (id, restaurant_id, name, phone, email, address, loyalty_points, visits, total_spent_paise, last_visit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `${restaurantId}-${customer.id}`,
      restaurantId,
      customer.name,
      customer.phone,
      customer.email || null,
      customer.address || null,
      customer.loyaltyPoints,
      customer.visits,
      toPaise(customer.totalSpent),
      customer.lastVisit || null
    );
  }
  for (const branchId of branchIds) {
    for (const table of seedTables) {
      const id = branchId.endsWith('o1') || branchId === 'o1' ? `${restaurantId}-${table.id}` : `${branchId}-${table.id}`;
      db.prepare(
        `INSERT INTO dining_tables (id, restaurant_id, branch_id, name, area, seats, status, current_order_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(id, restaurantId, branchId, table.name, table.area, table.seats, branchId === branchIds[0] ? table.status : 'free');
    }
    db.prepare('INSERT INTO order_counters (branch_id, next_number) VALUES (?, 1001)').run(branchId);
  }
}

function insertHistory(db, restaurantId, branchId) {
  const orders = seedOrders();
  let max = 1000;
  for (const order of orders) {
    max = Math.max(max, order.number);
    const orderId = newId();
    db.prepare(
      `INSERT INTO orders (id, restaurant_id, branch_id, number, type, table_id, customer_id, status, payment, discount_paise, tax_paise, subtotal_paise, total_paise, notes, served_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)`
    ).run(
      orderId,
      restaurantId,
      branchId,
      order.number,
      order.type,
      order.status,
      order.payment,
      toPaise(order.discount),
      toPaise(order.taxAmount),
      toPaise(order.subtotal),
      toPaise(order.total),
      order.createdAt,
      order.updatedAt
    );
    for (const item of order.items) {
      db.prepare(
        `INSERT INTO order_items (id, order_id, restaurant_id, menu_item_id, name, price_paise, qty, notes, modifiers_json, status, kot_batch)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1)`
      ).run(newId(), orderId, restaurantId, `${restaurantId}-${item.menuItemId}`, item.name, toPaise(item.price), item.qty, item.status || 'served');
    }
    db.prepare(
      `INSERT INTO payments (id, restaurant_id, branch_id, order_id, method, amount_paise, status, recorded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'recorded_manual', NULL, ?)`
    ).run(newId(), restaurantId, branchId, orderId, order.payment, toPaise(order.total), order.createdAt);
  }
  db.prepare('UPDATE order_counters SET next_number = ? WHERE branch_id = ?').run(max + 1, branchId);
}

function clearRestaurantData(db, restaurantId) {
  const tables = ['order_items', 'payments', 'orders', 'print_jobs', 'idempotency_keys', 'stock_movements', 'dining_tables', 'staff', 'customers', 'ingredients', 'vendors', 'menu_items', 'categories'];
  for (const table of tables) {
    if (table === 'idempotency_keys' || table === 'order_items') {
      db.prepare(`DELETE FROM ${table} WHERE restaurant_id = ?`).run(restaurantId);
    } else {
      db.prepare(`DELETE FROM ${table} WHERE restaurant_id = ?`).run(restaurantId);
    }
  }
  const branches = db.prepare('SELECT id FROM branches WHERE restaurant_id = ?').all(restaurantId);
  for (const branch of branches) db.prepare('DELETE FROM order_counters WHERE branch_id = ?').run(branch.id);
}

export function seedIfEmpty(db) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM restaurants').get();
  if (existing.n > 0) return;
  const now = Date.now();
  const ownerPassword = process.env.DEMO_OWNER_PASSWORD || 'RasoiSet-demo-1';
  const waiterPassword = process.env.DEMO_WAITER_PASSWORD || 'RasoiSet-demo-1';
  const otherPassword = process.env.DEMO_OTHER_PASSWORD || 'RasoiSet-demo-1';

  const ownerId = 'user-demo-owner';
  const waiterId = 'user-demo-waiter';
  const otherId = 'user-other-owner';
  db.prepare('INSERT INTO users (id, email, phone, password_hash, name, platform_role, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(ownerId, 'owner@demo.rasoiset.test', '9000000001', hashSecret(ownerPassword), 'Demo Owner', now);
  db.prepare('INSERT INTO users (id, email, phone, password_hash, name, platform_role, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(waiterId, 'waiter@demo.rasoiset.test', '9000000002', hashSecret(waiterPassword), 'Demo Waiter', now);
  db.prepare('INSERT INTO users (id, email, phone, password_hash, name, platform_role, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(otherId, 'owner@other.rasoiset.test', '9000000003', hashSecret(otherPassword), 'Other Owner', now);

  const restaurantId = 'rest-demo';
  db.prepare(
    `INSERT INTO restaurants (id, name, is_demo, timezone, currency, tax_label, default_tax, service_charge, printer_width, loyalty_percent, invoice_prefix, footer_note, plan_code, created_at)
     VALUES (?, ?, 1, 'Asia/Kolkata', ?, ?, ?, ?, ?, ?, ?, ?, 'multi-outlet', ?)`
  ).run(
    restaurantId,
    seedSettings.restaurantName,
    seedSettings.currency,
    seedSettings.taxLabel,
    seedSettings.defaultTax,
    seedSettings.serviceCharge,
    seedSettings.printerWidth,
    seedSettings.loyaltyPercent,
    seedSettings.invoicePrefix,
    seedSettings.footerNote,
    now
  );
  const branchIds = [];
  for (const outlet of seedOutlets) {
    const branchId = `${restaurantId}-${outlet.id}`;
    branchIds.push(branchId);
    db.prepare('INSERT INTO branches (id, restaurant_id, name, address, phone, gstin) VALUES (?, ?, ?, ?, ?, ?)').run(
      branchId,
      restaurantId,
      outlet.name,
      outlet.address,
      outlet.phone,
      outlet.gstin || null
    );
  }
  db.prepare('INSERT INTO memberships (id, user_id, restaurant_id, branch_id, role) VALUES (?, ?, ?, NULL, ?)').run(newId(), ownerId, restaurantId, 'owner');
  db.prepare('INSERT INTO memberships (id, user_id, restaurant_id, branch_id, role) VALUES (?, ?, ?, ?, ?)').run(newId(), waiterId, restaurantId, branchIds[0], 'waiter');
  insertCatalog(db, restaurantId, branchIds);
  insertHistory(db, restaurantId, branchIds[0]);

  const otherRestaurant = 'rest-other';
  db.prepare(
    `INSERT INTO restaurants (id, name, is_demo, timezone, currency, tax_label, default_tax, service_charge, printer_width, loyalty_percent, invoice_prefix, footer_note, plan_code, created_at)
     VALUES (?, 'Other Kitchen (isolated demo)', 1, 'Asia/Kolkata', '₹', 'GST', 5, 0, 80, 0, 'OTH', 'Demo tenant', 'multi-outlet', ?)`
  ).run(otherRestaurant, now);
  const otherBranch = 'rest-other-main';
  db.prepare('INSERT INTO branches (id, restaurant_id, name, address, phone, gstin) VALUES (?, ?, ?, ?, ?, NULL)').run(
    otherBranch,
    otherRestaurant,
    'Other Kitchen — Private',
    'Not visible to RasoiSet demo',
    '0000000000'
  );
  db.prepare('INSERT INTO memberships (id, user_id, restaurant_id, branch_id, role) VALUES (?, ?, ?, NULL, ?)').run(newId(), otherId, otherRestaurant, 'owner');
  db.prepare('INSERT INTO categories (id, restaurant_id, name, color, icon) VALUES (?, ?, ?, NULL, NULL)').run('rest-other-cat', otherRestaurant, 'Private');
  db.prepare(
    `INSERT INTO menu_items (id, restaurant_id, category_id, name, price_paise, description, veg, available, tax, modifiers_json, recipe_json)
     VALUES ('rest-other-item', ?, 'rest-other-cat', 'Secret Dish', 12300, NULL, 1, 1, 5, NULL, NULL)`
  ).run(otherRestaurant);
  db.prepare('INSERT INTO order_counters (branch_id, next_number) VALUES (?, 5001)').run(otherBranch);
  db.prepare(
    `INSERT INTO orders (id, restaurant_id, branch_id, number, type, table_id, customer_id, status, payment, discount_paise, tax_paise, subtotal_paise, total_paise, notes, served_by, version, created_at, updated_at)
     VALUES ('rest-other-order', ?, ?, 5000, 'dine-in', NULL, NULL, 'completed', 'cash', 0, 0, 12300, 12300, 'private', NULL, 1, ?, ?)`
  ).run(otherRestaurant, otherBranch, now, now);
  db.prepare(
    `INSERT INTO order_items (id, order_id, restaurant_id, menu_item_id, name, price_paise, qty, notes, modifiers_json, status, kot_batch)
     VALUES ('rest-other-line', 'rest-other-order', ?, 'rest-other-item', 'Secret Dish', 12300, 1, NULL, NULL, 'served', 1)`
  ).run(otherRestaurant);
}

export function resetDemoRestaurant(db, restaurantId) {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(restaurantId);
  if (!restaurant?.is_demo) {
    const error = new Error('Demo reset is only available for the labelled demo restaurant.');
    error.status = 403;
    throw error;
  }
  clearRestaurantData(db, restaurantId);
  const branches = db.prepare('SELECT id FROM branches WHERE restaurant_id = ? ORDER BY id').all(restaurantId).map((b) => b.id);
  insertCatalog(db, restaurantId, branches);
  insertHistory(db, restaurantId, branches[0]);
  db.prepare(
    `UPDATE restaurants SET name = ?, currency = ?, tax_label = ?, default_tax = ?, service_charge = ?, printer_width = ?, loyalty_percent = ?, invoice_prefix = ?, footer_note = ? WHERE id = ?`
  ).run(
    seedSettings.restaurantName,
    seedSettings.currency,
    seedSettings.taxLabel,
    seedSettings.defaultTax,
    seedSettings.serviceCharge,
    seedSettings.printerWidth,
    seedSettings.loyaltyPercent,
    seedSettings.invoicePrefix,
    seedSettings.footerNote,
    restaurantId
  );
}

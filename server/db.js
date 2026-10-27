import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  platform_role TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT '₹',
  tax_label TEXT NOT NULL DEFAULT 'GST',
  default_tax REAL NOT NULL DEFAULT 5,
  service_charge REAL NOT NULL DEFAULT 0,
  printer_width INTEGER NOT NULL DEFAULT 80,
  loyalty_percent REAL NOT NULL DEFAULT 2,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  footer_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  gstin TEXT
);
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  branch_id TEXT,
  role TEXT NOT NULL,
  UNIQUE(user_id, restaurant_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  restaurant_id TEXT,
  branch_id TEXT,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  restaurant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  order_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (restaurant_id, key)
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT
);
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL,
  description TEXT,
  veg INTEGER NOT NULL,
  available INTEGER NOT NULL,
  tax REAL NOT NULL,
  modifiers_json TEXT,
  recipe_json TEXT
);
CREATE TABLE IF NOT EXISTS dining_tables (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  seats INTEGER NOT NULL,
  status TEXT NOT NULL,
  current_order_id TEXT
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  total_spent_paise INTEGER NOT NULL DEFAULT 0,
  last_visit INTEGER
);
CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  stock REAL NOT NULL,
  min_stock REAL NOT NULL,
  cost_paise INTEGER NOT NULL,
  vendor_id TEXT,
  last_updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  branch_id TEXT,
  ingredient_id TEXT NOT NULL,
  qty_delta REAL NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  branch_id TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  active INTEGER NOT NULL,
  pin_hash TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  type TEXT NOT NULL,
  table_id TEXT,
  customer_id TEXT,
  status TEXT NOT NULL,
  payment TEXT NOT NULL,
  discount_paise INTEGER NOT NULL,
  tax_paise INTEGER NOT NULL,
  subtotal_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  notes TEXT,
  served_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  menu_item_id TEXT,
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  notes TEXT,
  modifiers_json TEXT,
  status TEXT,
  kot_batch INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL,
  recorded_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_counters (
  branch_id TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  order_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_scope ON orders(restaurant_id, branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_menu_scope ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS demo_requests (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT,
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  outlets INTEGER NOT NULL,
  message TEXT,
  interest TEXT NOT NULL,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS demo_requests_idempotency
  ON demo_requests(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key != '';
`;

export function openDatabase(filePath) {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  const row = db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (!row) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
  }
  migratePhoneLogin(db);
  migrateOperations(db);
  migrateMenuImages(db);
  migrateChannels(db);
  return db;
}

function migratePhoneLogin(db) {
  const done = db.prepare('SELECT version FROM schema_migrations WHERE version = 2').get();
  if (done) return;
  const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  if (!columns.includes('phone')) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      CREATE TABLE users_v2 (
        id TEXT PRIMARY KEY,
        email TEXT,
        phone TEXT,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        platform_role TEXT,
        created_at INTEGER NOT NULL
      );
      INSERT INTO users_v2 (id, email, phone, password_hash, name, platform_role, created_at)
      SELECT id, NULLIF(email, ''), NULL, password_hash, name, platform_role, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_v2 RENAME TO users;
    `);
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone != '';
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL AND email != '';
    CREATE TABLE IF NOT EXISTS phone_verifications (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      verified_at INTEGER,
      reset_token_hash TEXT,
      reset_expires_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
  const demoPhones = [
    ['9000000001', 'owner@demo.rasoiset.test'],
    ['9000000002', 'waiter@demo.rasoiset.test'],
    ['9000000003', 'owner@other.rasoiset.test'],
  ];
  for (const [phone, email] of demoPhones) {
    db.prepare(`UPDATE users SET phone = ? WHERE email = ? AND (phone IS NULL OR phone = '')`).run(phone, email);
  }
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(new Date().toISOString());
}

function migrateOperations(db) {
  const done = db.prepare('SELECT version FROM schema_migrations WHERE version = 3').get();
  if (done) return;
  const columns = db.prepare('PRAGMA table_info(restaurants)').all().map((column) => column.name);
  if (!columns.includes('plan_code')) {
    db.exec(`ALTER TABLE restaurants ADD COLUMN plan_code TEXT NOT NULL DEFAULT 'starter'`);
  }
  db.prepare(`UPDATE restaurants SET plan_code = 'multi-outlet' WHERE is_demo = 1 AND (plan_code IS NULL OR plan_code = 'starter')`).run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      reason TEXT NOT NULL,
      recorded_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cashier_shifts (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      opened_by TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      opening_cash_paise INTEGER NOT NULL,
      closed_by TEXT,
      closed_at INTEGER,
      counted_cash_paise INTEGER,
      expected_cash_paise INTEGER,
      note TEXT
    );
  `);
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)').run(new Date().toISOString());
}

function migrateChannels(db) {
  const done = db.prepare('SELECT version FROM schema_migrations WHERE version = 5').get();
  if (done) return;
  const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name);
  if (!orderColumns.includes('channel')) db.exec('ALTER TABLE orders ADD COLUMN channel TEXT');
  if (!orderColumns.includes('external_order_id')) db.exec('ALTER TABLE orders ADD COLUMN external_order_id TEXT');
  if (!orderColumns.includes('channel_alert')) db.exec('ALTER TABLE orders ADD COLUMN channel_alert TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_connections (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      transport TEXT NOT NULL,
      environment TEXT NOT NULL,
      status TEXT NOT NULL,
      external_outlet_id TEXT,
      last_check_at INTEGER,
      last_check_ok INTEGER,
      last_check_error TEXT,
      last_order_at INTEGER,
      last_menu_sync_at INTEGER,
      disabled_at INTEGER,
      activated_at INTEGER,
      updated_by TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS channel_connection_branch ON channel_connections(restaurant_id, branch_id, channel);
    CREATE UNIQUE INDEX IF NOT EXISTS channel_outlet_one_branch ON channel_connections(channel, external_outlet_id)
      WHERE external_outlet_id IS NOT NULL AND disabled_at IS NULL;
    CREATE TABLE IF NOT EXISTS channel_audits (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_item_maps (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      external_item_id TEXT NOT NULL,
      channel_price_paise INTEGER,
      updated_by TEXT,
      updated_at INTEGER NOT NULL,
      UNIQUE(restaurant_id, channel, external_item_id),
      UNIQUE(restaurant_id, channel, menu_item_id)
    );
    CREATE TABLE IF NOT EXISTS channel_events (
      id TEXT PRIMARY KEY,
      dedupe_key TEXT NOT NULL UNIQUE,
      transport TEXT NOT NULL,
      channel TEXT,
      restaurant_id TEXT,
      branch_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      redacted_json TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      processed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS channel_orders (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      order_id TEXT,
      channel TEXT NOT NULL,
      transport TEXT NOT NULL,
      external_order_id TEXT NOT NULL,
      external_outlet_id TEXT NOT NULL,
      provider_state TEXT NOT NULL,
      fulfilment_state TEXT NOT NULL,
      collection_state TEXT NOT NULL,
      settlement_state TEXT NOT NULL,
      simulated INTEGER NOT NULL DEFAULT 0,
      customer_total_paise INTEGER,
      item_total_paise INTEGER,
      discount_paise INTEGER,
      merchant_discount_paise INTEGER,
      platform_discount_paise INTEGER,
      tax_paise INTEGER,
      packaging_paise INTEGER,
      delivery_paise INTEGER,
      cash_to_collect_paise INTEGER,
      discrepancy TEXT,
      instructions TEXT,
      unmapped_count INTEGER NOT NULL DEFAULT 0,
      kot_created INTEGER NOT NULL DEFAULT 0,
      inventory_applied INTEGER NOT NULL DEFAULT 0,
      print_status TEXT,
      can_reject INTEGER NOT NULL DEFAULT 0,
      delivery_type TEXT,
      prep_deadline_at INTEGER,
      rider_state TEXT,
      rider_name TEXT,
      attention TEXT,
      received_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(transport, external_outlet_id, external_order_id)
    );
    CREATE TABLE IF NOT EXISTS channel_lines (
      id TEXT PRIMARY KEY,
      channel_order_id TEXT NOT NULL,
      external_item_id TEXT,
      menu_item_id TEXT,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price_paise INTEGER NOT NULL,
      modifiers_json TEXT,
      notes TEXT,
      unmapped INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS channel_actions (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      channel_order_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_jobs (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)').run(new Date().toISOString());
}

function migrateMenuImages(db) {
  const done = db.prepare('SELECT version FROM schema_migrations WHERE version = 4').get();
  if (done) return;
  const columns = db.prepare('PRAGMA table_info(menu_items)').all().map((column) => column.name);
  if (!columns.includes('image_key')) {
    db.exec('ALTER TABLE menu_items ADD COLUMN image_key TEXT');
  }
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)').run(new Date().toISOString());
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* already closed */
    }
    throw error;
  }
}

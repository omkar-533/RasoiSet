import { imagePath } from './menuImages.js';
import { toRupees } from './money.js';

export function loadWorkspace(db, ctx) {
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(ctx.restaurantId);
  const branches = ctx.branches;
  const categories = db.prepare('SELECT * FROM categories WHERE restaurant_id = ? ORDER BY name').all(ctx.restaurantId);
  const menu = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY name').all(ctx.restaurantId);
  const tables = db.prepare('SELECT * FROM dining_tables WHERE restaurant_id = ? AND branch_id = ? ORDER BY name').all(ctx.restaurantId, ctx.branchId);
  const customers = db.prepare('SELECT * FROM customers WHERE restaurant_id = ? ORDER BY name').all(ctx.restaurantId);
  const ingredients = db.prepare('SELECT * FROM ingredients WHERE restaurant_id = ? ORDER BY name').all(ctx.restaurantId);
  const vendors = db.prepare('SELECT * FROM vendors WHERE restaurant_id = ? ORDER BY name').all(ctx.restaurantId);
  const staff = db.prepare('SELECT * FROM staff WHERE restaurant_id = ? ORDER BY name').all(ctx.restaurantId);
  const orders = db.prepare(
    'SELECT * FROM orders WHERE restaurant_id = ? AND branch_id = ? ORDER BY created_at DESC'
  ).all(ctx.restaurantId, ctx.branchId);
  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length
    ? db.prepare(`SELECT * FROM order_items WHERE restaurant_id = ? AND order_id IN (${orderIds.map(() => '?').join(',')})`).all(ctx.restaurantId, ...orderIds)
    : [];
  const itemsByOrder = new Map();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }
  const counter = db.prepare('SELECT next_number FROM order_counters WHERE branch_id = ?').get(ctx.branchId);
  const refunds = orderIds.length
    ? db.prepare(`SELECT order_id, COALESCE(SUM(amount_paise), 0) AS amount FROM refunds WHERE restaurant_id = ? AND order_id IN (${orderIds.map(() => '?').join(',')}) GROUP BY order_id`).all(ctx.restaurantId, ...orderIds)
    : [];
  const refundedByOrder = new Map(refunds.map((row) => [row.order_id, row.amount]));
  const shift = db.prepare('SELECT * FROM cashier_shifts WHERE restaurant_id = ? AND branch_id = ? AND closed_at IS NULL').get(ctx.restaurantId, ctx.branchId);

  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color || undefined, icon: c.icon || undefined })),
    menu: menu.map((m) => ({
      id: m.id,
      name: m.name,
      categoryId: m.category_id,
      price: toRupees(m.price_paise),
      description: m.description || undefined,
      veg: !!m.veg,
      available: !!m.available,
      tax: m.tax,
      image: imagePath(m.image_key),
      modifiers: m.modifiers_json ? JSON.parse(m.modifiers_json) : undefined,
      recipe: m.recipe_json ? JSON.parse(m.recipe_json) : undefined,
    })),
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      area: t.area,
      seats: t.seats,
      status: t.status,
      currentOrderId: t.current_order_id || undefined,
    })),
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || undefined,
      address: c.address || undefined,
      loyaltyPoints: c.loyalty_points,
      visits: c.visits,
      totalSpent: toRupees(c.total_spent_paise),
      lastVisit: c.last_visit || undefined,
    })),
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      stock: i.stock,
      minStock: i.min_stock,
      costPerUnit: toRupees(i.cost_paise),
      vendorId: i.vendor_id || undefined,
      lastUpdated: i.last_updated,
    })),
    vendors: vendors.map((v) => ({ id: v.id, name: v.name, phone: v.phone, category: v.category })),
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      phone: s.phone,
      email: s.email || undefined,
      active: !!s.active,
      pin: '',
      pinSet: !!s.pin_hash,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      type: o.type,
      tableId: o.table_id || undefined,
      customerId: o.customer_id || undefined,
      status: o.status,
      payment: o.payment,
      discount: toRupees(o.discount_paise),
      taxAmount: toRupees(o.tax_paise),
      subtotal: toRupees(o.subtotal_paise),
      total: toRupees(o.total_paise),
      notes: o.notes || undefined,
      channel: o.channel || undefined,
      externalOrderId: o.external_order_id || undefined,
      channelAlert: o.channel_alert || undefined,
      servedBy: o.served_by || undefined,
      version: o.version,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      refunded: toRupees(refundedByOrder.get(o.id) || 0),
      items: (itemsByOrder.get(o.id) || []).map((it) => ({
        id: it.id,
        menuItemId: it.menu_item_id,
        name: it.name,
        price: toRupees(it.price_paise),
        qty: it.qty,
        notes: it.notes || undefined,
        modifiers: it.modifiers_json ? JSON.parse(it.modifiers_json) : undefined,
        status: it.status || undefined,
        kotBatch: it.kot_batch || 1,
      })),
    })),
    settings: {
      restaurantName: restaurant.name,
      currency: restaurant.currency,
      taxLabel: restaurant.tax_label,
      defaultTax: restaurant.default_tax,
      serviceCharge: restaurant.service_charge,
      printerWidth: restaurant.printer_width,
      loyaltyPercent: restaurant.loyalty_percent,
      invoicePrefix: restaurant.invoice_prefix,
      footerNote: restaurant.footer_note,
      plan: restaurant.plan_code || 'starter',
      activeOutletId: ctx.branchId,
      outlets: branches.map((b) => ({ id: b.id, name: b.name, address: b.address, phone: b.phone, gstin: b.gstin || undefined })),
    },
    orderCounter: counter?.next_number || 1001,
    shift: shift
      ? { id: shift.id, openingCash: toRupees(shift.opening_cash_paise), openedAt: shift.opened_at }
      : null,
    permissions: ctx.permissions,
    session: {
      name: ctx.name,
      email: ctx.email,
      role: ctx.role,
      platformRole: ctx.platformRole || null,
      restaurantId: ctx.restaurantId,
      branchId: ctx.branchId,
      isDemo: !!restaurant.is_demo,
      restaurants: ctx.platformRole === 'super_admin'
        ? db.prepare('SELECT id, name FROM restaurants ORDER BY name').all()
        : [],
    },
  };
}

export function buildContext(db, session) {
  const branches = session.membership_branch
    ? db.prepare('SELECT * FROM branches WHERE restaurant_id = ? AND id = ?').all(session.restaurant_id, session.membership_branch)
    : db.prepare('SELECT * FROM branches WHERE restaurant_id = ? ORDER BY name').all(session.restaurant_id);
  return {
    userId: session.user_id,
    email: session.email,
    name: session.name,
    role: session.role,
    restaurantId: session.restaurant_id,
    branchId: session.branch_id,
    membershipBranch: session.membership_branch,
    branches,
    permissions: null,
  };
}

const ALL = [
  'orders.read',
  'orders.create',
  'orders.pay',
  'orders.cancel',
  'orders.discount',
  'kds.update',
  'menu.write',
  'tables.write',
  'customers.write',
  'inventory.adjust',
  'vendors.write',
  'staff.write',
  'settings.write',
  'reports.read',
  'demo.reset',
];

const ROLE_PERMISSIONS = {
  owner: ALL,
  manager: ALL.filter((p) => p !== 'demo.reset'),
  cashier: ['orders.read', 'orders.create', 'orders.pay', 'orders.cancel', 'orders.discount', 'tables.write', 'customers.write', 'reports.read'],
  waiter: ['orders.read', 'orders.create', 'customers.write'],
  kitchen: ['orders.read', 'kds.update'],
  inventory: ['orders.read', 'inventory.adjust', 'vendors.write'],
  accountant: ['orders.read', 'reports.read'],
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function assertPermission(ctx, permission) {
  if (!ctx.permissions.includes(permission)) {
    const error = new Error('You do not have permission for this action.');
    error.status = 403;
    error.code = 'forbidden';
    throw error;
  }
}

export function canAccessBranch(ctx, branchId) {
  if (!branchId) return false;
  if (ctx.membershipBranch && ctx.membershipBranch !== branchId) return false;
  return ctx.branches.some((b) => b.id === branchId);
}

import { create } from 'zustand';
import { api, uploadFile } from '../api/client';
import type {
  Category,
  Customer,
  ID,
  IngredientStock,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Settings,
  Staff,
  Table,
  Vendor,
  TableStatus,
  OrderType,
  CashierShift,
} from '../types';

const uid = () => Math.random().toString(36).slice(2, 10);

interface CartLine {
  id: ID;
  menuItemId: ID;
  qty: number;
  notes?: string;
}

interface SessionInfo {
  name: string;
  email: string | null;
  role: string;
  platformRole?: string | null;
  restaurantId: string;
  branchId: string;
  isDemo: boolean;
  restaurants?: { id: string; name: string }[];
}

interface Workspace {
  categories: Category[];
  menu: MenuItem[];
  tables: Table[];
  customers: Customer[];
  ingredients: IngredientStock[];
  vendors: Vendor[];
  staff: Staff[];
  orders: Order[];
  settings: Settings;
  orderCounter: number;
  permissions: string[];
  session: SessionInfo;
  shift: CashierShift | null;
}

interface State {
  categories: Category[];
  menu: MenuItem[];
  tables: Table[];
  customers: Customer[];
  ingredients: IngredientStock[];
  vendors: Vendor[];
  staff: Staff[];
  orders: Order[];
  settings: Settings;
  currentUserId: ID | null;
  cart: CartLine[];
  cartType: OrderType;
  cartTableId?: ID;
  cartCustomerId?: ID;
  cartDiscount: number;
  orderCounter: number;
  hydrated: boolean;
  session: SessionInfo | null;
  permissions: string[];
  notice: string | null;
  shift: CashierShift | null;
  can: (permission: string) => boolean;
  dismissNotice: () => void;
  addToCart: (menuItemId: ID, qty?: number) => void;
  updateCartQty: (lineId: ID, qty: number) => void;
  removeFromCart: (lineId: ID) => void;
  setCartNotes: (lineId: ID, notes: string) => void;
  setCartType: (t: OrderType) => void;
  setCartTable: (id?: ID) => void;
  setCartCustomer: (id?: ID) => void;
  setCartDiscount: (d: number) => void;
  clearCart: () => void;
  placeOrder: (payment: PaymentMethod, idempotencyKey: string) => Promise<Order | null>;
  saveAsKOT: (idempotencyKey: string) => Promise<Order | null>;
  addItemsToOrder: (orderId: ID, idempotencyKey: string) => Promise<{ order: Order | null; deltaItemIds: string[] | null }>;
  refundOrder: (id: ID, amount: number, reason: string) => Promise<void>;
  openShift: (openingCash: number) => Promise<void>;
  closeShift: (countedCash: number) => Promise<{ expectedCash: number | null; countedCash: number | null }>;
  previewMenuImport: (csv: string) => Promise<{ line: number; category: string; name: string; price: number | null; veg: boolean; description: string; errors: string[] }[]>;
  commitMenuImport: (csv: string) => Promise<{ imported: number; skipped: number }>;
  updateOrderStatus: (id: ID, status: OrderStatus) => void;
  updateOrderItemStatus: (orderId: ID, itemId: ID, status: NonNullable<OrderItem['status']>) => void;
  payOrder: (id: ID, method: PaymentMethod) => void;
  cancelOrder: (id: ID) => void;
  setTableStatus: (id: ID, status: TableStatus) => void;
  upsertTable: (t: Table) => void;
  deleteTable: (id: ID) => void;
  upsertCategory: (c: Category) => void;
  deleteCategory: (id: ID) => void;
  upsertMenuItem: (m: MenuItem) => void;
  saveMenuItem: (m: MenuItem) => Promise<void>;
  uploadMenuImage: (id: ID, file: File) => Promise<void>;
  removeMenuImage: (id: ID) => Promise<void>;
  deleteMenuItem: (id: ID) => void;
  toggleAvailability: (id: ID) => void;
  upsertCustomer: (c: Customer) => Promise<Customer>;
  deleteCustomer: (id: ID) => void;
  upsertIngredient: (i: IngredientStock) => void;
  deleteIngredient: (id: ID) => void;
  adjustStock: (id: ID, delta: number) => void;
  upsertVendor: (v: Vendor) => void;
  deleteVendor: (id: ID) => void;
  upsertStaff: (s: Staff) => void;
  deleteStaff: (id: ID) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  resetDemoData: () => Promise<void>;
}

const emptySettings: Settings = {
  restaurantName: '',
  currency: '₹',
  taxLabel: 'GST',
  defaultTax: 0,
  serviceCharge: 0,
  printerWidth: 80,
  outlets: [],
  activeOutletId: '',
  loyaltyPercent: 0,
  invoicePrefix: 'INV',
  footerNote: '',
  plan: 'starter',
};

function applyWorkspace(workspace: Workspace, clearCart = false) {
  useStore.setState((state) => ({
    categories: workspace.categories,
    menu: workspace.menu,
    tables: workspace.tables,
    customers: workspace.customers,
    ingredients: workspace.ingredients,
    vendors: workspace.vendors,
    staff: workspace.staff,
    orders: workspace.orders,
    settings: workspace.settings,
    orderCounter: workspace.orderCounter,
    permissions: workspace.permissions,
    session: workspace.session,
    shift: workspace.shift,
    hydrated: true,
    notice: null,
    cart: clearCart ? [] : state.cart,
    cartTableId: clearCart ? undefined : state.cartTableId,
    cartCustomerId: clearCart ? undefined : state.cartCustomerId,
    cartDiscount: clearCart ? 0 : state.cartDiscount,
  }));
}

async function commit(action: string, payload: unknown, clearCart = false) {
  try {
    const data = await api<{
      workspace: Workspace;
      order: Order | null;
      customer: Customer | null;
      printJobId: string | null;
      replayed?: boolean;
      deltaItemIds?: string[] | null;
      importPreview?: { line: number; category: string; name: string; price: number | null; veg: boolean; description: string; errors: string[] }[] | null;
      imported?: number | null;
      skipped?: number | null;
      expectedCash?: number | null;
      countedCash?: number | null;
    }>(
      `/api/actions/${action}`,
      { method: 'POST', body: payload }
    );
    applyWorkspace(data.workspace, clearCart);
    return data;
  } catch (error) {
    useStore.setState({ notice: error instanceof Error ? error.message : 'Request failed' });
    throw error;
  }
}

export async function bootstrap() {
  try {
    const data = await api<{ workspace: Workspace }>('/api/workspace');
    applyWorkspace(data.workspace);
  } catch (error) {
    const status = error instanceof Error && 'status' in error ? Number((error as { status: number }).status) : 0;
    useStore.setState({
      hydrated: true,
      session: null,
      notice: status === 401 ? null : error instanceof Error ? error.message : 'Could not reach RasoiSet',
    });
  }
}

export async function login(phone: string, password: string) {
  await api('/api/auth/login', { method: 'POST', body: { phone, password } });
  await bootstrap();
}

export async function switchRestaurant(restaurantId: string) {
  await commit('switchRestaurant', { restaurantId }, true);
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  useStore.setState({ session: null, cart: [], notice: null });
}

export const useStore = create<State>()((set, get) => ({
  categories: [],
  menu: [],
  tables: [],
  customers: [],
  ingredients: [],
  vendors: [],
  staff: [],
  orders: [],
  settings: emptySettings,
  currentUserId: null,
  cart: [],
  cartType: 'dine-in',
  cartDiscount: 0,
  orderCounter: 1001,
  hydrated: false,
  session: null,
  permissions: [],
  notice: null,
  shift: null,
  can: (permission) => get().permissions.includes(permission),
  dismissNotice: () => set({ notice: null }),

  addToCart: (menuItemId, qty = 1) => {
    const cart = [...get().cart];
    const idx = cart.findIndex((l) => l.menuItemId === menuItemId);
    if (idx >= 0) cart[idx] = { ...cart[idx], qty: cart[idx].qty + qty };
    else cart.push({ id: uid(), menuItemId, qty });
    set({ cart });
  },
  updateCartQty: (lineId, qty) =>
    set({
      cart: get()
        .cart.map((l) => (l.id === lineId ? { ...l, qty: Math.max(1, qty) } : l))
        .filter((l) => l.qty > 0),
    }),
  removeFromCart: (lineId) => set({ cart: get().cart.filter((l) => l.id !== lineId) }),
  setCartNotes: (lineId, notes) => set({ cart: get().cart.map((l) => (l.id === lineId ? { ...l, notes } : l)) }),
  setCartType: (t) => set({ cartType: t, cartTableId: t === 'dine-in' ? get().cartTableId : undefined }),
  setCartTable: (id) => set({ cartTableId: id }),
  setCartCustomer: (id) => set({ cartCustomerId: id }),
  setCartDiscount: (d) => set({ cartDiscount: Math.max(0, d) }),
  clearCart: () => set({ cart: [], cartTableId: undefined, cartCustomerId: undefined, cartDiscount: 0, cartType: 'dine-in' }),

  placeOrder: async (payment, idempotencyKey) => {
    const s = get();
    if (s.cart.length === 0) return null;
    const data = await commit(
      'placeOrder',
      {
        idempotencyKey,
        payment,
        type: s.cartType,
        tableId: s.cartTableId,
        customerId: s.cartCustomerId,
        discount: s.cartDiscount,
        lines: s.cart.map((line) => ({ menuItemId: line.menuItemId, qty: line.qty, notes: line.notes })),
      },
      true
    );
    return data.order;
  },
  saveAsKOT: async (idempotencyKey) => {
    const s = get();
    if (s.cart.length === 0) return null;
    const data = await commit(
      'saveAsKOT',
      {
        idempotencyKey,
        type: s.cartType,
        tableId: s.cartTableId,
        customerId: s.cartCustomerId,
        discount: s.cartDiscount,
        lines: s.cart.map((line) => ({ menuItemId: line.menuItemId, qty: line.qty, notes: line.notes })),
      },
      true
    );
    return data.order;
  },
  addItemsToOrder: async (orderId, idempotencyKey) => {
    const s = get();
    const order = s.orders.find((item) => item.id === orderId);
    if (s.cart.length === 0 || !order) return { order: null, deltaItemIds: null };
    const data = await commit(
      'addItemsToOrder',
      {
        idempotencyKey,
        orderId,
        version: order.version,
        lines: s.cart.map((line) => ({ menuItemId: line.menuItemId, qty: line.qty, notes: line.notes })),
      },
      true
    );
    return { order: data.order, deltaItemIds: data.deltaItemIds || null };
  },
  refundOrder: async (id, amount, reason) => {
    const order = get().orders.find((item) => item.id === id);
    await commit('refundOrder', { id, version: order?.version, amount, reason });
  },
  openShift: async (openingCash) => {
    await commit('openShift', { openingCash });
  },
  closeShift: async (countedCash) => {
    const data = await commit('closeShift', { countedCash });
    return { expectedCash: data.expectedCash ?? null, countedCash: data.countedCash ?? null };
  },
  previewMenuImport: async (csv) => {
    const data = await commit('previewMenuImport', { csv });
    return data.importPreview || [];
  },
  commitMenuImport: async (csv) => {
    const data = await commit('commitMenuImport', { csv });
    return { imported: data.imported || 0, skipped: data.skipped || 0 };
  },
  updateOrderStatus: (id, status) => {
    const order = get().orders.find((o) => o.id === id);
    commit('updateOrderStatus', { id, status, version: order?.version }).catch(() => undefined);
  },
  updateOrderItemStatus: (orderId, itemId, status) => {
    const order = get().orders.find((o) => o.id === orderId);
    commit('updateOrderItemStatus', { orderId, itemId, status, version: order?.version }).catch(() => undefined);
  },
  payOrder: (id, method) => {
    const order = get().orders.find((o) => o.id === id);
    commit('payOrder', { id, method, version: order?.version }).catch(() => undefined);
  },
  cancelOrder: (id) => {
    const order = get().orders.find((o) => o.id === id);
    commit('cancelOrder', { id, version: order?.version, reason: 'Cancelled from register' }).catch(() => undefined);
  },
  setTableStatus: (id, status) => {
    commit('setTableStatus', { id, status }).catch(() => undefined);
  },
  upsertTable: (t) => {
    commit('upsertTable', t).catch(() => undefined);
  },
  deleteTable: (id) => {
    commit('deleteTable', { id }).catch(() => undefined);
  },
  upsertCategory: (c) => {
    commit('upsertCategory', c).catch(() => undefined);
  },
  deleteCategory: (id) => {
    commit('deleteCategory', { id }).catch(() => undefined);
  },
  upsertMenuItem: (m) => {
    commit('upsertMenuItem', m).catch(() => undefined);
  },
  saveMenuItem: async (item) => {
    await commit('upsertMenuItem', item);
  },
  uploadMenuImage: async (id, file) => {
    const data = await uploadFile<{ workspace: Workspace }>(`/api/menu-items/${encodeURIComponent(id)}/image`, file);
    applyWorkspace(data.workspace);
  },
  removeMenuImage: async (id) => {
    const data = await api<{ workspace: Workspace }>(`/api/menu-items/${encodeURIComponent(id)}/image`, { method: 'DELETE' });
    applyWorkspace(data.workspace);
  },
  deleteMenuItem: (id) => {
    commit('deleteMenuItem', { id }).catch(() => undefined);
  },
  toggleAvailability: (id) => {
    commit('toggleAvailability', { id }).catch(() => undefined);
  },
  upsertCustomer: async (c) => {
    const data = await commit('upsertCustomer', c);
    return data.customer || c;
  },
  deleteCustomer: (id) => {
    commit('deleteCustomer', { id }).catch(() => undefined);
  },
  upsertIngredient: (i) => {
    commit('upsertIngredient', i).catch(() => undefined);
  },
  deleteIngredient: (id) => {
    commit('deleteIngredient', { id }).catch(() => undefined);
  },
  adjustStock: (id, delta) => {
    commit('adjustStock', { id, delta }).catch(() => undefined);
  },
  upsertVendor: (v) => {
    commit('upsertVendor', v).catch(() => undefined);
  },
  deleteVendor: (id) => {
    commit('deleteVendor', { id }).catch(() => undefined);
  },
  upsertStaff: (s) => {
    commit('upsertStaff', s).catch(() => undefined);
  },
  deleteStaff: (id) => {
    commit('deleteStaff', { id }).catch(() => undefined);
  },
  updateSettings: async (patch) => {
    await commit('updateSettings', patch);
  },
  resetDemoData: async () => {
    await commit('resetDemoData', {});
  },
}));

export const newId = uid;

export type ID = string;

export type OrderType = 'dine-in' | 'takeaway' | 'delivery' | 'online';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'wallet' | 'unpaid' | 'channel';
export type TableStatus = 'free' | 'occupied' | 'reserved' | 'cleaning';
export type StaffRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'chef' | 'delivery';

export interface Category {
  id: ID;
  name: string;
  icon?: string;
  color?: string;
}

export interface Modifier {
  id: ID;
  name: string;
  price: number;
}

export interface MenuItem {
  id: ID;
  name: string;
  categoryId: ID;
  price: number;
  description?: string;
  veg: boolean;
  available: boolean;
  image?: string;
  tax: number; // %
  modifiers?: Modifier[];
  recipe?: { ingredientId: ID; quantity: number }[];
}

export interface OrderItem {
  id: ID; // line id
  menuItemId: ID;
  name: string;
  price: number;
  qty: number;
  notes?: string;
  modifiers?: Modifier[];
  status?: 'new' | 'preparing' | 'ready' | 'served';
  kotBatch?: number;
}

export interface Order {
  id: ID;
  number: number;
  type: OrderType;
  tableId?: ID;
  customerId?: ID;
  items: OrderItem[];
  status: OrderStatus;
  payment: PaymentMethod;
  discount: number; // amount
  taxAmount: number;
  subtotal: number;
  total: number;
  createdAt: number;
  updatedAt: number;
  servedBy?: ID;
  notes?: string;
  version?: number;
  refunded?: number;
  channel?: string;
  externalOrderId?: string;
  channelAlert?: string;
}

export interface Table {
  id: ID;
  name: string;
  area: string;
  seats: number;
  status: TableStatus;
  currentOrderId?: ID;
}

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  loyaltyPoints: number;
  visits: number;
  totalSpent: number;
  lastVisit?: number;
}

export interface IngredientStock {
  id: ID;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  costPerUnit: number;
  vendorId?: ID;
  lastUpdated: number;
}

export interface Vendor {
  id: ID;
  name: string;
  phone: string;
  category: string;
}

export interface Staff {
  id: ID;
  name: string;
  role: StaffRole;
  phone: string;
  email?: string;
  active: boolean;
  pin: string;
  pinSet?: boolean;
}

export interface Outlet {
  id: ID;
  name: string;
  address: string;
  phone: string;
  gstin?: string;
}

export interface Settings {
  restaurantName: string;
  currency: string; // symbol
  taxLabel: string;
  defaultTax: number;
  serviceCharge: number;
  printerWidth: number;
  outlets: Outlet[];
  activeOutletId: ID;
  loyaltyPercent: number; // % of total earned as points
  invoicePrefix: string;
  footerNote: string;
  plan?: string;
}

export interface CashierShift {
  id: ID;
  openingCash: number;
  openedAt: number;
}

import { useMemo, useRef, useState } from 'react';
import { Search, Plus, Minus, Trash2, Receipt, Save, UserPlus, Tag, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Order, OrderType, PaymentMethod } from '../types';
import { fmtMoney } from '../utils/format';
import Modal from '../components/Modal';
import MenuPhoto from '../components/MenuPhoto';
import CashierShift from '../components/CashierShift';
import { printOrder, printKOT } from '../utils/invoice';
import { api } from '../api/client';

export default function POS() {
  const s = useStore();
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [showCustomer, setShowCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const items = useMemo(() => {
    const filtered = s.menu.filter((m) =>
      (activeCat === 'all' || m.categoryId === activeCat) &&
      (search === '' || m.name.toLowerCase().includes(search.toLowerCase())) &&
      m.available
    );
    return filtered;
  }, [s.menu, activeCat, search]);

  const cartItems = s.cart.map((l) => {
    const m = s.menu.find((x) => x.id === l.menuItemId)!;
    return { ...l, name: m.name, price: m.price, veg: m.veg };
  });
  const subtotal = cartItems.reduce((a, b) => a + b.price * b.qty, 0);
  const afterDiscount = Math.max(0, subtotal - s.cartDiscount);
  const taxAmount = Math.round((afterDiscount * s.settings.defaultTax) / 100);
  const total = afterDiscount + taxAmount;
  const customer = s.customers.find((c) => c.id === s.cartCustomerId);
  const table = s.tables.find((t) => t.id === s.cartTableId);

  const submissionKey = () => {
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    return idempotencyKey.current;
  };

  const noteBrowserPrint = (printJobId?: string | null) => {
    if (!printJobId) return;
    api(`/api/print-jobs/${printJobId}/browser`, { method: 'POST' }).catch(() => undefined);
  };

  const handlePay = async (method: PaymentMethod) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const o = await s.placeOrder(method, submissionKey());
      setShowPay(false);
      idempotencyKey.current = null;
      if (o) {
        printOrder(o, s.settings);
        noteBrowserPrint((o as Order & { printJobId?: string }).printJobId);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openOrder = s.orders.find((order) => order.id === table?.currentOrderId && order.payment === 'unpaid' && order.status !== 'cancelled' && order.status !== 'completed');

  const handleSaveKOT = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (openOrder) {
        const added = await s.addItemsToOrder(openOrder.id, submissionKey());
        idempotencyKey.current = null;
        if (added.order) {
          const delta = new Set(added.deltaItemIds || []);
          const ticket = delta.size ? { ...added.order, items: added.order.items.filter((item) => delta.has(item.id)) } : added.order;
          printKOT(ticket, s.settings);
          noteBrowserPrint((added.order as Order & { printJobId?: string }).printJobId);
        }
      } else {
        const o = await s.saveAsKOT(submissionKey());
        idempotencyKey.current = null;
        if (o) {
          printKOT(o, s.settings);
          noteBrowserPrint((o as Order & { printJobId?: string }).printJobId);
        }
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not send the order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!newCust.name || !newCust.phone) return;
    const c = await s.upsertCustomer({
      id: Math.random().toString(36).slice(2, 10),
      name: newCust.name,
      phone: newCust.phone,
      loyaltyPoints: 0,
      visits: 0,
      totalSpent: 0,
    });
    s.setCartCustomer(c.id);
    setNewCust({ name: '', phone: '' });
    setShowCustomer(false);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col lg:flex-row">
      {/* Left: Menu */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu..."
              className="input pl-9"
            />
          </div>
          <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200">
            {(['dine-in', 'takeaway', 'delivery', 'online'] as OrderType[]).map((t) => (
              <button
                key={t}
                onClick={() => s.setCartType(t)}
                className={`px-3 py-1.5 text-xs rounded font-medium capitalize transition ${
                  s.cartType === t ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          <button
            onClick={() => setActiveCat('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              activeCat === 'all' ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            All Items
          </button>
          {s.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                activeCat === c.id ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((m) => (
            <button
              key={m.id}
              onClick={() => s.addToCart(m.id)}
              className="card group relative p-3 text-left transition hover:border-slate-300 hover:shadow-md"
            >
              <MenuPhoto src={m.image} className="mb-2 aspect-video w-full rounded-lg" />
              <div className="flex items-center gap-1 mb-1">
                <span
                  className={`w-3 h-3 border ${m.veg ? 'border-emerald-500' : 'border-red-500'} flex items-center justify-center`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${m.veg ? 'bg-emerald-500' : 'bg-red-500'}`} />
                </span>
                <div className="font-medium text-sm text-slate-800 line-clamp-1">{m.name}</div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{fmtMoney(m.price, s.settings.currency)}</span>
                <span className="opacity-0 group-hover:opacity-100 transition text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">+ Add</span>
              </div>
            </button>
          ))}
        </div>
        {items.length === 0 && (
          <div className="text-center text-slate-400 py-16">No items match your filter.</div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="flex max-h-[48%] w-full min-h-0 shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-800">Current Order</div>
            <span className="capitalize text-xs px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full">{s.cartType}</span>
          </div>
          <CashierShift />
          {/* Table & Customer chips */}
          <div className="flex gap-2 flex-wrap">
            {s.cartType === 'dine-in' && (
              <select
                value={s.cartTableId || ''}
                onChange={(e) => s.setCartTable(e.target.value || undefined)}
                className="text-xs px-2 py-1 rounded-lg bg-slate-100 border-0 focus:outline-none flex-1"
              >
                <option value="">Select Table</option>
                {s.tables.filter((t) => t.status !== 'cleaning').map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.area} · {t.seats}p)
                  </option>
                ))}
              </select>
            )}
            {customer ? (
              <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-brand-50 text-brand-700">
                {customer.name}
                <button onClick={() => s.setCartCustomer(undefined)}><X size={12} /></button>
              </div>
            ) : (
              <button onClick={() => setShowCustomer(true)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
                <UserPlus size={12} /> Add Customer
              </button>
            )}
          </div>
          {table && <div className="text-xs text-slate-500 mt-2">Table: {table.name}{openOrder ? ` · adding to #${openOrder.number}` : ''}</div>}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4">
          {cartItems.length === 0 && (
            <div className="text-center text-slate-400 py-16 text-sm">
              <Receipt size={40} className="mx-auto mb-3 text-slate-300" />
              No items in cart.<br />Tap menu items to add.
            </div>
          )}
          {cartItems.map((it) => (
            <div key={it.id} className="py-3 border-b border-slate-100">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 pr-2">
                  <div className="text-sm font-medium text-slate-800">{it.name}</div>
                  <div className="text-xs text-slate-500">{fmtMoney(it.price, s.settings.currency)} ea</div>
                </div>
                <div className="text-sm font-semibold text-slate-800">{fmtMoney(it.price * it.qty, s.settings.currency)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => s.updateCartQty(it.id, it.qty - 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <Minus size={12} />
                  </button>
                  <span className="text-sm font-semibold w-6 text-center">{it.qty}</span>
                  <button onClick={() => s.updateCartQty(it.id, it.qty + 1)} className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                    <Plus size={12} />
                  </button>
                </div>
                <button onClick={() => s.removeFromCart(it.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                value={it.notes || ''}
                onChange={(e) => s.setCartNotes(it.id, e.target.value)}
                placeholder="Note (e.g., extra spicy)"
                className="mt-2 w-full text-xs px-2 py-1 rounded bg-slate-50 border-0 focus:outline-none"
              />
            </div>
          ))}
        </div>

        {/* Totals */}
        {cartItems.length > 0 && (
          <div className="p-4 border-t border-slate-200 space-y-2 bg-slate-50">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>{fmtMoney(subtotal, s.settings.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Tag size={14} /> Discount
              </div>
              <input
                type="number"
                value={s.cartDiscount || ''}
                onChange={(e) => s.setCartDiscount(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-20 text-right text-sm bg-white px-2 py-0.5 rounded border border-slate-200 focus:outline-none focus:border-brand-400"
              />
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>{s.settings.taxLabel} ({s.settings.defaultTax}%)</span>
              <span>{fmtMoney(taxAmount, s.settings.currency)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{fmtMoney(total, s.settings.currency)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={handleSaveKOT} disabled={submitting} className="btn-secondary">
                <Save size={16} /> {openOrder ? 'Add to KOT' : 'Save KOT'}
              </button>
              <button onClick={() => setShowPay(true)} disabled={submitting} className="btn-primary">
                <Receipt size={16} /> Pay Now
              </button>
            </div>
            <button onClick={s.clearCart} className="w-full text-xs text-red-500 hover:text-red-700 py-1">
              Clear cart
            </button>
          </div>
        )}
      </div>

      {/* Pay modal */}
      <Modal open={showPay} onClose={() => setShowPay(false)} title="Select Payment Method">
        <div className="space-y-3">
          <div className="text-3xl font-bold text-slate-900 text-center mb-4">{fmtMoney(total, s.settings.currency)}</div>
          <div className="grid grid-cols-2 gap-3">
            {(['cash', 'card', 'upi', 'wallet'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => handlePay(m)}
                className="card p-6 hover:border-brand-400 hover:bg-brand-50 transition text-center"
              >
                <div className="text-3xl mb-2">{m === 'cash' ? '💵' : m === 'card' ? '💳' : m === 'upi' ? '📱' : '👛'}</div>
                <div className="text-sm font-semibold capitalize">{m}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Customer modal */}
      <Modal
        open={showCustomer}
        onClose={() => setShowCustomer(false)}
        title="Add Customer"
        footer={
          <>
            <button onClick={() => setShowCustomer(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleAddCustomer} className="btn-primary">Add</button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">Search existing or add new</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {s.customers.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  s.setCartCustomer(c.id);
                  setShowCustomer(false);
                }}
                className="w-full text-left px-3 py-2 rounded hover:bg-slate-100 text-sm flex justify-between"
              >
                <span>{c.name}</span>
                <span className="text-slate-500">{c.phone}</span>
              </button>
            ))}
          </div>
          <div className="border-t pt-3">
            <label className="label">Name</label>
            <input value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} className="input mb-2" />
            <label className="label">Phone</label>
            <input value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} className="input" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

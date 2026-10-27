import { useState, useMemo } from 'react';
import { Search, Printer, Eye, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { fmtMoney, fmtDate } from '../utils/format';
import type { Order, OrderType, PaymentMethod } from '../types';
import { printOrder } from '../utils/invoice';
import CashierShift from '../components/CashierShift';

export default function Orders() {
  const s = useStore();
  const [view, setView] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<OrderType | 'all'>('all');
  const [pay, setPay] = useState<PaymentMethod | 'all'>('all');
  const [status, setStatus] = useState<'all' | Order['status']>('all');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState('');

  const filtered = useMemo(
    () =>
      s.orders.filter(
        (o) =>
          (search === '' || `${o.number}`.includes(search)) &&
          (type === 'all' || o.type === type) &&
          (pay === 'all' || o.payment === pay) &&
          (status === 'all' || o.status === status)
      ),
    [s.orders, search, type, pay, status]
  );

  return (
    <div className="p-6">
      <PageHeader title="Orders" subtitle={`${s.orders.length} total · ${filtered.length} shown`} />
      <div className="mb-4"><CashierShift /></div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #" className="input pl-9 w-40" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value as any)} className="input w-40">
          <option value="all">All Types</option>
          <option value="dine-in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
          <option value="delivery">Delivery</option>
          <option value="online">Online</option>
        </select>
        <select value={pay} onChange={(e) => setPay(e.target.value as any)} className="input w-40">
          <option value="all">All Payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="upi">UPI</option>
          <option value="wallet">Wallet</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input w-40">
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Order #</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-right px-4 py-3">Items</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Payment</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((o) => {
              const cust = s.customers.find((c) => c.id === o.customerId);
              return (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">#{o.number}</td>
                  <td className="px-4 py-3 capitalize">{o.type}</td>
                  <td className="px-4 py-3">{cust?.name || '—'}</td>
                  <td className="px-4 py-3 text-right">{o.items.reduce((a, b) => a + b.qty, 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtMoney(o.total, s.settings.currency)}</td>
                  <td className="px-4 py-3 capitalize">
                    <span className={`badge ${o.payment === 'unpaid' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{o.payment}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${
                        o.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : o.status === 'cancelled'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => { setView(o); setRefundAmount(''); setRefundReason(''); setRefundError(''); }} className="text-slate-500 hover:text-brand-700 mr-2">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => printOrder(o, s.settings)} className="text-slate-500 hover:text-brand-700 mr-2">
                      <Printer size={14} />
                    </button>
                    {s.can('orders.cancel') && o.payment === 'unpaid' && o.status !== 'cancelled' && (
                      <button onClick={() => confirm('Cancel order?') && s.cancelOrder(o.id)} className="text-red-500">
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!view} onClose={() => setView(null)} title={`Order #${view?.number}`} size="md">
        {view && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-500">Type:</span> <span className="capitalize">{view.type}</span></div>
              <div><span className="text-slate-500">Payment:</span> <span className="capitalize">{view.payment}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className="capitalize">{view.status}</span></div>
              <div><span className="text-slate-500">Date:</span> {fmtDate(view.createdAt)}</div>
            </div>
            <div className="border-t pt-3">
              {view.items.map((it) => (
                <div key={it.id} className="flex justify-between py-1.5 text-sm border-b border-slate-100">
                  <div>
                    <span className="font-medium">{it.qty}× {it.name}</span>
                    {it.notes && <div className="text-xs text-slate-500 italic">{it.notes}</div>}
                  </div>
                  <div>{fmtMoney(it.qty * it.price, s.settings.currency)}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-sm pt-2">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtMoney(view.subtotal, s.settings.currency)}</span></div>
              {view.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-{fmtMoney(view.discount, s.settings.currency)}</span></div>}
              <div className="flex justify-between"><span>Tax</span><span>{fmtMoney(view.taxAmount, s.settings.currency)}</span></div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>{fmtMoney(view.total, s.settings.currency)}</span></div>
              {(view.refunded || 0) > 0 && <div className="flex justify-between text-red-600"><span>Refunded</span><span>{fmtMoney(view.refunded || 0, s.settings.currency)}</span></div>}
            </div>
            {s.can('orders.pay') && view.payment !== 'unpaid' && view.status !== 'cancelled' && (
              <form
                className="space-y-2 border-t pt-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setRefundError('');
                  try {
                    await s.refundOrder(view.id, Number(refundAmount), refundReason);
                    const updated = useStore.getState().orders.find((order) => order.id === view.id);
                    if (updated) setView(updated);
                    setRefundAmount('');
                    setRefundReason('');
                  } catch (error) {
                    setRefundError(error instanceof Error ? error.message : 'Refund failed');
                  }
                }}
              >
                <p className="text-xs text-slate-500">The original payment stays recorded. Cooked stock is not returned.</p>
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label="Refund amount" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} inputMode="decimal" placeholder="Amount" className="input" required />
                  <input aria-label="Refund reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Reason" className="input" required />
                </div>
                {refundError && <p className="text-xs text-red-600">{refundError}</p>}
                <button type="submit" className="btn-secondary">Record refund</button>
              </form>
            )}
            <button onClick={() => printOrder(view, s.settings)} className="btn-primary w-full">
              <Printer size={16} /> Print Bill
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import { bootstrap } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import { fmtMoney } from '../utils/format';

type Line = { id: string; name: string; qty: number; unitPrice: number; modifiers: { name: string; price: number }[]; notes: string; unmapped: boolean };
type OnlineOrder = {
  id: string;
  channel: string;
  externalOrderId: string;
  orderId: string | null;
  providerState: string;
  fulfilmentState: string;
  collectionState: string;
  settlementState: string;
  simulated: boolean;
  customerTotal: number | null;
  packaging: number | null;
  deliveryCharge: number | null;
  discount: number | null;
  tax: number | null;
  cashToCollect: number | null;
  discrepancy: string;
  instructions: string;
  unmappedCount: number;
  attention: string;
  canReject: boolean;
  deliveryType: string;
  prepDeadlineAt: number | null;
  riderName: string;
  riderState: string;
  printStatus: string;
  receivedAt: number;
  lines: Line[];
  actions: { id: string; kind: string; status: string; error: string }[];
};

const FILTERS = ['all', 'zomato', 'swiggy', 'new', 'preparing', 'ready', 'completed', 'cancelled', 'attention'] as const;
const REASONS = ['item_out_of_stock', 'store_closed', 'store_busy', 'rider_not_available', 'out_of_delivery_radius', 'connectivity_issue', 'total_mismatch', 'invalid_item', 'option_out_of_stock', 'invalid_option', 'special_instructions', 'unspecified'];

export default function OnlineOrders() {
  const currency = useStore((s) => s.settings.currency);
  const canAccept = useStore((s) => s.can('orders.create'));
  const canReject = useStore((s) => s.can('orders.cancel'));
  const canSimulate = useStore((s) => s.can('settings.write'));
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [swiggyLive, setSwiggyLive] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('item_out_of_stock');
  const [soundOn, setSoundOn] = useState(localStorage.getItem('rasoiset-online-sound') === 'on');
  const [muted, setMuted] = useState(localStorage.getItem('rasoiset-online-mute') === 'on');

  const load = async () => {
    const data = await api<{ orders: OnlineOrder[]; connections: { channel: string; credentialsConfigured: boolean }[] }>('/api/channels');
    setSwiggyLive(Boolean(data.connections.find((connection) => connection.channel === 'swiggy')?.credentialsConfigured));
    setOrders((current) => {
      const known = new Set(current.map((order) => order.id));
      if (soundOn && !muted && data.orders.some((order) => !known.has(order.id) && !order.simulated && current.length)) {
        try { new Audio('data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTA=') .play(); } catch { /* browser blocked playback */ }
      }
      return data.orders;
    });
  };

  useEffect(() => {
    load().catch((error) => setNotice(error.message));
    const timer = window.setInterval(() => load().catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, [soundOn, muted]);

  const act = async (id: string, action: string, body?: unknown) => {
    setNotice('');
    try {
      await api(`/api/channels/orders/${id}/${action}`, { method: 'POST', body });
      await Promise.all([load(), bootstrap()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Request failed');
      await load();
    }
  };

  const visible = orders.filter((order) => {
    if (filter === 'zomato' || filter === 'swiggy') return order.channel === filter;
    if (filter === 'new') return order.fulfilmentState === 'new';
    if (filter === 'preparing') return order.fulfilmentState === 'preparing';
    if (filter === 'ready') return order.fulfilmentState === 'ready';
    if (filter === 'completed') return order.fulfilmentState === 'completed';
    if (filter === 'cancelled') return order.fulfilmentState === 'cancelled';
    if (filter === 'attention') return Boolean(order.attention && order.attention !== 'cancel_seen') || order.unmappedCount > 0 || order.actions.some((action) => action.status === 'needs_reconciliation' || action.status === 'failed');
    return true;
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Online orders"
        subtitle="Zomato and Swiggy"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => { localStorage.setItem('rasoiset-online-sound', 'on'); setSoundOn(true); }}>Enable sound</button>
            <button className="btn-secondary" onClick={() => { const next = !muted; localStorage.setItem('rasoiset-online-mute', next ? 'on' : 'off'); setMuted(next); }}>{muted ? 'Unmute' : 'Mute'}</button>
          </div>
        }
      />
      <p className="mb-4 text-sm text-slate-500">This page refreshes every 15 seconds. It does not receive orders while this browser is offline. Simulated orders are labelled and do not affect stock, cashier cash or sales reports.</p>
      {notice && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button key={item} className={filter === item ? 'btn-primary' : 'btn-secondary'} onClick={() => setFilter(item)}>{item === 'attention' ? 'Needs attention' : item}</button>
        ))}
      </div>
      {canSimulate && (
        <form
          className="card mb-4 p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            await actSimulate(form, setNotice, load);
            event.currentTarget.reset();
          }}
        >
          <h2 className="font-semibold text-slate-900">Simulated order</h2>
          <p className="text-xs text-slate-500">Synthetic only. Nothing is sent to Zomato or Swiggy.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <select name="channel" className="input"><option value="swiggy">Swiggy</option><option value="zomato">Zomato</option></select>
            <input name="externalOrderId" className="input" placeholder="Synthetic id" required />
            <input name="itemName" className="input" placeholder="Item name" required />
            <input name="externalItemId" className="input" placeholder="External item id" required />
          </div>
          <button className="btn-secondary mt-2">Create simulated order</button>
        </form>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((order) => (
          <article key={order.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs uppercase text-slate-500">{order.channel} · {order.externalOrderId}</div>
                <div className="font-semibold text-slate-900">{order.fulfilmentState} · provider {order.providerState}</div>
              </div>
              {order.simulated && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Simulated</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">{new Date(order.receivedAt).toLocaleString()}{order.prepDeadlineAt ? ` · prepare by ${new Date(order.prepDeadlineAt).toLocaleTimeString()}` : ''}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {order.lines.map((line) => (
                <li key={line.id}>
                  {line.qty}× {line.name} · {fmtMoney(line.unitPrice, currency)}
                  {line.unmapped && <span className="ml-2 text-xs text-red-700">Unmapped</span>}
                  {line.modifiers.map((modifier) => <span key={modifier.name} className="ml-1 text-xs text-slate-500">{modifier.name}</span>)}
                  {line.notes && <span className="block text-xs text-amber-700">{line.notes}</span>}
                </li>
              ))}
            </ul>
            {order.instructions && <p className="mt-2 text-xs text-amber-700">{order.instructions}</p>}
            <p className="mt-2 text-sm text-slate-700">Customer total {order.customerTotal == null ? 'not supplied' : fmtMoney(order.customerTotal, currency)} · {order.collectionState.replace(/_/g, ' ')}</p>
            <p className="text-xs text-slate-500">Packaging {money(order.packaging, currency)} · delivery charge {money(order.deliveryCharge, currency)} · discount {money(order.discount, currency)} · tax {money(order.tax, currency)}</p>
            <p className="text-xs text-slate-500">Settlement: {order.settlementState.replace(/_/g, ' ')}. Delivery charge is not added to restaurant revenue.</p>
            {order.cashToCollect != null && <p className="text-xs text-slate-600">Cash to collect {fmtMoney(order.cashToCollect, currency)}. This is not cashier-shift cash.</p>}
            {order.discrepancy && <p className="text-xs text-red-700">{order.discrepancy}</p>}
            {order.riderName && <p className="text-xs text-slate-500">Rider {order.riderName} · {order.riderState}</p>}
            {order.printStatus === 'failed' && <button className="mt-2 text-xs font-semibold text-red-700" onClick={() => act(order.id, 'retry-print')}>Retry kitchen print</button>}
            {order.actions.some((action) => action.status === 'needs_reconciliation' || action.status === 'pending' || action.status === 'failed') && (
              <p className="mt-2 text-xs text-red-700">{order.actions.find((action) => action.error)?.error || 'A provider action is still unresolved.'}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {canAccept && order.fulfilmentState === 'new' && order.providerState !== 'cancelled' && (order.simulated || swiggyLive) && <button className="btn-primary" onClick={() => act(order.id, 'accept')}>{order.simulated ? 'Simulate accept' : 'Accept'}</button>}
              {canAccept && order.fulfilmentState === 'preparing' && <button className="btn-secondary" onClick={() => act(order.id, 'ready')}>{order.simulated ? 'Simulate ready' : 'Mark ready'}</button>}
              {canReject && order.canReject && order.fulfilmentState !== 'cancelled' && order.fulfilmentState !== 'completed' && (
                <>
                  <select className="input max-w-[180px]" value={reason} onChange={(event) => setReason(event.target.value)}>{REASONS.map((item) => <option key={item}>{item}</option>)}</select>
                  <button className="btn-secondary" onClick={() => act(order.id, 'reject', { reasonCode: reason })}>{order.simulated ? 'Simulate reject' : 'Reject'}</button>
                </>
              )}
            </div>
          </article>
        ))}
        {!visible.length && <p className="text-sm text-slate-500">No online orders in this filter.</p>}
      </div>
    </div>
  );
}

function money(value: number | null, currency: string) {
  return value == null ? 'not supplied' : fmtMoney(value, currency);
}

async function actSimulate(form: FormData, setNotice: (value: string) => void, load: () => Promise<void>) {
  try {
    await api('/api/channels/simulate', {
      method: 'POST',
      body: {
        channel: form.get('channel'),
        externalOrderId: form.get('externalOrderId'),
        customerTotal: 100,
        itemTotal: 100,
        items: [{ externalItemId: form.get('externalItemId'), name: form.get('itemName'), qty: 1, unitPrice: 100 }],
      },
    });
    setNotice('Simulated order saved. It was not sent to a delivery platform.');
    await load();
  } catch (error) {
    setNotice(error instanceof Error ? error.message : 'Could not create the simulated order');
  }
}

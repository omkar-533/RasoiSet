import { Printer, CheckCircle2, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import { fmtTime, ago, fmtMoney } from '../utils/format';
import { printKOT } from '../utils/invoice';
import { api } from '../api/client';
import { bootstrap } from '../store/useStore';

export default function KOT() {
  const s = useStore();
  const active = s.orders.filter((o) => o.status === 'preparing' || o.status === 'ready' || o.status === 'pending' || (o.channel && o.channelAlert === 'cancel'));

  return (
    <div className="p-6">
      <PageHeader title="Kitchen Order Tickets" subtitle={`${active.length} active KOT(s)`} />

      {active.length === 0 && (
        <div className="card p-12 text-center text-slate-400">
          No active KOTs. New orders will appear here.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {active.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs text-slate-500 capitalize">{o.channel ? `${o.channel} · ${o.externalOrderId}` : `${o.type} · KOT`}</div>
                <div className="text-2xl font-bold text-slate-900">#{o.number}</div>
                {o.tableId && (
                  <div className="text-xs text-slate-500">
                    Table: {s.tables.find((t) => t.id === o.tableId)?.name}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">{fmtTime(o.createdAt)}</div>
                <div className="text-[10px] text-amber-600 font-medium">{ago(o.createdAt)}</div>
              </div>
            </div>
            {o.channelAlert === 'cancel' && (
              <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                Platform cancelled this order. Prepared food is not returned to stock.
                <button
                  type="button"
                  className="mt-1 block font-semibold"
                  onClick={async () => {
                    await api(`/api/channels/orders/${o.id}/kitchen-ack`, { method: 'POST' });
                    await bootstrap();
                  }}
                >
                  Kitchen saw this
                </button>
              </div>
            )}
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {o.items.map((it) => (
                <div key={it.id} className="flex items-start justify-between text-sm py-1 border-b border-slate-100">
                  <div>
                    <div>
                      <span className="font-bold text-slate-900">{it.qty}×</span> {it.name}
                      {(it.kotBatch || 1) > 1 && <span className="ml-1 text-[10px] text-slate-400">batch {it.kotBatch}</span>}
                    </div>
                    {it.notes && <div className="text-xs text-slate-500 italic">{it.notes}</div>}
                  </div>
                  <div className="flex gap-1">
                    {(['new', 'preparing', 'ready', 'served'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => s.updateOrderItemStatus(o.id, it.id, st)}
                        title={st}
                        className={`w-2 h-2 rounded-full ${
                          it.status === st
                            ? st === 'served'
                              ? 'bg-emerald-500'
                              : st === 'ready'
                              ? 'bg-blue-500'
                              : st === 'preparing'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Total</span>
              <span className="font-semibold text-slate-700">{fmtMoney(o.total, s.settings.currency)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => printKOT(o, s.settings)} className="btn-secondary flex-1">
                <Printer size={14} /> Print
              </button>
              <button
                onClick={() => s.can('kds.update') && s.updateOrderStatus(o.id, 'served')}
                disabled={!s.can('kds.update')}
                className="btn-primary flex-1"
              >
                <CheckCircle2 size={14} /> Served
              </button>
              {s.can('orders.cancel') && (
              <button
                onClick={() => {
                  if (confirm('Cancel this KOT?')) s.cancelOrder(o.id);
                }}
                className="btn-ghost text-red-500"
              >
                <X size={14} />
              </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

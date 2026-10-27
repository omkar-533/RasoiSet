import { useStore } from '../store/useStore';
import { ago } from '../utils/format';

export default function KDS() {
  const s = useStore();
  const active = s.orders.filter((o) => o.status === 'preparing' || o.status === 'pending');

  const cols: Record<string, typeof active> = { new: [], preparing: [], ready: [], served: [] };
  active.forEach((o) => {
    const earliest = o.items.reduce((min, it) => {
      const v = it.status || 'new';
      if (v === 'new') return 'new';
      if (v === 'preparing' && min !== 'new') return 'preparing';
      if (v === 'ready' && min === 'served') return 'ready';
      return min;
    }, 'served');
    cols[earliest as string].push(o);
  });

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kitchen Display System</h1>
          <p className="text-sm text-slate-500">Live ticket board · auto-updates</p>
        </div>
        <div className="text-xs text-slate-400">{active.length} active tickets</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-4 md:overflow-hidden">
        {(['new', 'preparing', 'ready', 'served'] as const).map((col) => (
          <div key={col} className="flex min-h-[240px] flex-col overflow-hidden rounded-xl bg-slate-100 md:min-h-0">
            <div className="px-4 py-2 bg-white border-b border-slate-200 font-semibold text-sm capitalize flex items-center justify-between">
              {col}
              <span className="text-xs text-slate-400">{cols[col].length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cols[col].map((o) => {
                const age = Math.floor((Date.now() - o.createdAt) / 60000);
                return (
                  <div
                    key={o.id}
                    className={`bg-white p-3 rounded-lg shadow-sm border-l-4 ${
                      age > 15 ? 'border-red-500' : age > 8 ? 'border-amber-500' : 'border-emerald-500'
                    }`}
                  >
                    <div className="flex justify-between mb-2">
                      <div className="font-bold text-slate-900">#{o.number}</div>
                      <div className="text-[11px] text-slate-500">{ago(o.createdAt)}</div>
                    </div>
                    <div className="text-[11px] uppercase text-slate-500 mb-2">
                      {o.channel ? `${o.channel} · ${o.externalOrderId}` : o.type} {o.tableId && `· ${s.tables.find((t) => t.id === o.tableId)?.name}`}
                    </div>
                    {o.items.map((it) => (
                      <div key={it.id} className="text-sm py-1 flex items-start justify-between">
                        <div>
                          <span className="font-bold">{it.qty}×</span> {it.name}
                          {it.notes && <div className="text-[11px] text-amber-600 italic">{it.notes}</div>}
                        </div>
                        <select
                          value={it.status || 'new'}
                          onChange={(e) => s.updateOrderItemStatus(o.id, it.id, e.target.value as any)}
                          className="text-[10px] bg-slate-100 border-0 rounded px-1"
                        >
                          <option value="new">New</option>
                          <option value="preparing">Cooking</option>
                          <option value="ready">Ready</option>
                          <option value="served">Served</option>
                        </select>
                      </div>
                    ))}
                  </div>
                );
              })}
              {cols[col].length === 0 && (
                <div className="text-center text-slate-400 text-xs py-8">No tickets</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

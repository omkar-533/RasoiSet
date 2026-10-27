import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import { fmtMoney, fmtDay, startOfDay } from '../utils/format';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';

export default function Reports() {
  const s = useStore();
  const [days, setDays] = useState(7);

  const since = startOfDay(Date.now() - (days - 1) * 86400000);
  const inRange = useMemo(() => s.orders.filter((o) => o.createdAt >= since && o.status !== 'cancelled' && o.payment !== 'unpaid' && o.payment !== 'channel'), [s.orders, since]);

  const totalRevenue = inRange.reduce((a, b) => a + b.total, 0);
  const totalTax = inRange.reduce((a, b) => a + b.taxAmount, 0);
  const aov = inRange.length ? totalRevenue / inRange.length : 0;

  // daily series
  const daily: { day: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay(Date.now() - i * 86400000);
    const ds = inRange.filter((o) => o.createdAt >= d && o.createdAt < d + 86400000);
    daily.push({ day: fmtDay(d), revenue: ds.reduce((a, b) => a + b.total, 0), orders: ds.length });
  }

  // category split
  const catRev = new Map<string, number>();
  inRange.forEach((o) =>
    o.items.forEach((it) => {
      const m = s.menu.find((x) => x.id === it.menuItemId);
      const cat = s.categories.find((c) => c.id === m?.categoryId)?.name || 'Other';
      catRev.set(cat, (catRev.get(cat) || 0) + it.qty * it.price);
    })
  );
  const catData = [...catRev.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const colors = ['#f97316', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#fbbf24', '#14b8a6', '#ef4444', '#6366f1'];

  // payment split
  const payData = ['cash', 'card', 'upi', 'wallet'].map((p) => ({
    name: p.toUpperCase(),
    value: inRange.filter((o) => o.payment === p).reduce((a, b) => a + b.total, 0),
  }));

  // top items
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  inRange.forEach((o) =>
    o.items.forEach((it) => {
      const cur = itemMap.get(it.menuItemId) || { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.qty * it.price;
      itemMap.set(it.menuItemId, cur);
    })
  );
  const topItems = [...itemMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reports & Analytics"
        subtitle={`Last ${days} days · ${inRange.length} orders`}
        actions={
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value))} className="input">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="text-xs text-slate-500 uppercase">Revenue</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(totalRevenue, s.settings.currency)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-slate-500 uppercase">Orders</div>
          <div className="text-2xl font-bold mt-1">{inRange.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-slate-500 uppercase">Avg Order Value</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(aov, s.settings.currency)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-slate-500 uppercase">Tax Collected</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(totalTax, s.settings.currency)}</div>
        </div>
      </div>

      <div className="card min-w-0 p-5">
        <div className="mb-4 text-sm font-semibold text-slate-800">Sales Trend</div>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#F97316" strokeWidth={2} name="Revenue" dot={false} />
              <Line type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} name="Orders" yAxisId={0} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-5">
          <div className="text-sm font-semibold text-slate-800 mb-4">Revenue by Category</div>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" outerRadius={78}>
                  {catData.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtMoney(v, s.settings.currency)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card min-w-0 p-5">
          <div className="mb-4 text-sm font-semibold text-slate-800">Payment Methods</div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={payData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip formatter={(v: number) => fmtMoney(v, s.settings.currency)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {payData.map((_, i) => (
                    <Cell key={i} fill={colors[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-5">
        <div className="mb-4 text-sm font-semibold text-slate-800">Top 10 Items by Revenue</div>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left py-2">#</th>
              <th className="text-left py-2">Item</th>
              <th className="text-right py-2">Qty Sold</th>
              <th className="text-right py-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {topItems.map((it, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-2 text-slate-500">{i + 1}</td>
                <td className="py-2 font-medium">{it.name}</td>
                <td className="py-2 text-right">{it.qty}</td>
                <td className="py-2 text-right font-semibold">{fmtMoney(it.revenue, s.settings.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

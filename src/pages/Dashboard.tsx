import { TrendingUp, IndianRupee, ShoppingBag, Users, Package, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';
import StatCard from '../components/StatCard';
import PageHeader from '../components/PageHeader';
import { fmtMoney, fmtTime, startOfDay, fmtDay } from '../utils/format';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { orders, ingredients, settings, tables } = useStore();
  const today = startOfDay(Date.now());
  const countsAsSales = (order: { createdAt: number; status: string; payment: string }) => order.status !== 'cancelled' && order.payment !== 'unpaid' && order.payment !== 'channel';
  const todayOrders = orders.filter((o) => o.createdAt >= today && countsAsSales(o));
  const todayRevenue = todayOrders.reduce((a, b) => a + b.total, 0);
  const yesterdayOrders = orders.filter((o) => o.createdAt >= today - 86400000 && o.createdAt < today && countsAsSales(o));
  const yesterdayRevenue = yesterdayOrders.reduce((a, b) => a + b.total, 0);
  const revenueDelta = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;
  const occupied = tables.filter((t) => t.status === 'occupied').length;
  const lowStock = ingredients.filter((i) => i.stock <= i.minStock).length;

  // 7-day revenue
  const days: { day: string; revenue: number; orders: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = startOfDay(Date.now() - i * 86400000);
    const dOrders = orders.filter((o) => o.createdAt >= d && o.createdAt < d + 86400000 && countsAsSales(o));
    days.push({
      day: fmtDay(d),
      revenue: dOrders.reduce((a, b) => a + b.total, 0),
      orders: dOrders.length,
    });
  }

  // Top items
  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  todayOrders.forEach((o) => {
    o.items.forEach((it) => {
      const cur = itemMap.get(it.menuItemId) || { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.qty * it.price;
      itemMap.set(it.menuItemId, cur);
    });
  });
  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);

  // order types
  const typeLabels: Record<string, string> = {
    'dine-in': 'Dine-in',
    takeaway: 'Takeaway',
    delivery: 'Delivery',
    online: 'Online',
  };
  const typeData = ['dine-in', 'takeaway', 'delivery', 'online'].map((t) => ({
    name: typeLabels[t],
    value: todayOrders.filter((o) => o.type === t).length,
  }));
  const colors = ['#F97316', '#10B981', '#3B82F6', '#F59E0B'];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Welcome back"
        subtitle={`Here's what's happening at ${settings.restaurantName} today`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's Revenue"
          value={fmtMoney(todayRevenue, settings.currency)}
          delta={revenueDelta === null ? undefined : `${revenueDelta >= 0 ? '+' : ''}${revenueDelta.toFixed(0)}% vs yesterday`}
          deltaTone={revenueDelta !== null && revenueDelta < 0 ? 'down' : 'up'}
          Icon={IndianRupee}
          tone="green"
        />
        <StatCard
          label="Orders Today"
          value={todayOrders.length}
          delta={`Avg ${fmtMoney(todayOrders.length ? todayRevenue / todayOrders.length : 0, settings.currency)}`}
          deltaTone="muted"
          Icon={ShoppingBag}
          tone="orange"
        />
        <StatCard label="Tables Occupied" value={`${occupied}/${tables.length}`} Icon={Users} tone="blue" />
        <StatCard label="Low Stock Alerts" value={lowStock} Icon={AlertTriangle} tone={lowStock ? 'amber' : 'slate'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card min-w-0 p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Revenue (Last 7 days)</div>
              <div className="text-xs text-slate-500">Orders and sales trend</div>
            </div>
            <TrendingUp className="text-slate-400" aria-hidden size={18} />
          </div>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer>
              <LineChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="day" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} width={48} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#F97316" strokeWidth={2} dot={{ r: 3, fill: '#F97316' }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card min-w-0 p-4 sm:p-5">
          <div className="mb-4 text-sm font-semibold text-slate-900">Order Types Today</div>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" outerRadius={72} stroke="#ffffff">
                  {typeData.map((_, i) => (
                    <Cell key={i} fill={colors[i]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card min-w-0 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Top Selling Today</div>
            <Link to="/reports" className="text-xs font-medium text-brand-700 hover:underline">View report</Link>
          </div>
          {topItems.length === 0 && <div className="text-sm text-slate-400 py-8 text-center">No orders yet today</div>}
          <div className="h-56 sm:h-64">
            <ResponsiveContainer>
              <BarChart data={topItems} layout="vertical" margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} width={108} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="qty" fill="#F97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card min-w-0 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Recent Orders</div>
            <Link to="/orders" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {orders.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-slate-900">#{o.number} · <span className="capitalize text-slate-500">{o.type}</span></div>
                  <div className="text-xs text-slate-500">{o.items.length} items · {fmtTime(o.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">{fmtMoney(o.total, settings.currency)}</div>
                  <div className={`text-[10px] uppercase font-medium ${o.status === 'completed' ? 'text-emerald-600' : o.status === 'cancelled' ? 'text-red-500' : 'text-amber-600'}`}>
                    {o.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lowStock > 0 && (
        <div className="card p-5 border-l-4 border-red-500">
          <div className="flex items-center gap-3 mb-3">
            <Package className="text-red-500" />
            <div>
              <div className="font-semibold text-slate-800">Low Stock Warning</div>
              <div className="text-xs text-slate-500">{lowStock} ingredient(s) need restocking</div>
            </div>
            <Link to="/inventory" className="ml-auto btn-secondary text-xs">Manage Inventory →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {ingredients.filter((i) => i.stock <= i.minStock).slice(0, 8).map((i) => (
              <div key={i.id} className="text-xs p-2 rounded bg-red-50">
                <div className="font-medium text-red-800">{i.name}</div>
                <div className="text-red-600">{i.stock} {i.unit} (min {i.minStock})</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

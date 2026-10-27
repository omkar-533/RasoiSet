import { Calendar, ChefHat, ClipboardList, LayoutDashboard, Package, Settings, Table2, Utensils } from 'lucide-react';
import { LogoMark } from '../Logo';

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Orders', icon: ClipboardList },
  { label: 'Tables', icon: Table2 },
  { label: 'Kitchen', icon: ChefHat },
  { label: 'Inventory', icon: Package },
  { label: 'Reports', icon: Utensils },
  { label: 'Settings', icon: Settings },
];

const ORDERS = [
  ['#1042', '8:14 PM', 'T8', 'Paneer butter masala, naan', '₹420', 'Served'],
  ['#1041', '7:58 PM', 'T3', 'Masala dosa, filter coffee', '₹260', 'Served'],
  ['#1040', '7:41 PM', 'T5', 'Chicken biryani, raita', '₹540', 'Preparing'],
  ['#1039', '7:28 PM', 'T2', 'Veg thali', '₹180', 'Served'],
];

const POINTS = [46, 52, 44, 58, 54, 82, 74];

export default function DashboardPreview() {
  const width = 300;
  const height = 78;
  const step = width / (POINTS.length - 1);
  const coords = POINTS.map((value, index) => `${index * step},${height - (value / 100) * height}`).join(' ');
  const area = `0,${height} ${coords} ${width},${height}`;

  return (
    <div className="shadow-[0_24px_50px_rgba(15,23,42,0.14)]">
      <div className="rounded-t-[16px] border border-b-0 border-[#E2E8F0] bg-[#EEF2F6] p-1.5 pb-0 sm:p-2 sm:pb-0">
      <div className="overflow-hidden rounded-t-[10px] bg-white">
        <div className="flex">
          <aside className="hidden w-[104px] shrink-0 border-r border-slate-100 bg-white py-3 sm:block">
            <div className="flex items-center gap-1 px-2.5">
              <LogoMark size={16} />
              <span className="text-[10px] font-bold text-slate-900">RasoiSet</span>
            </div>
            <ul className="mt-3 space-y-0.5 px-1.5">
              {NAV.map((item) => (
                <li key={item.label}>
                  <span className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] ${item.active ? 'bg-[#FFF7ED] font-semibold text-[#EA580C]' : 'text-slate-500'}`}>
                    <item.icon size={11} aria-hidden />
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
          <div className="min-w-0 flex-1 px-3 py-3 sm:px-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[15px] font-semibold leading-none text-slate-900">Good evening</div>
                <div className="mt-1 text-[10px] text-slate-400">Tue, 24 Apr</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500">
                <Calendar size={11} aria-hidden />
                Today, 24 Apr 2025
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {[
                ['Orders', '128'],
                ['Total sales', '₹24,350'],
                ['Tables', '12/28'],
                ['Avg. bill', '₹356'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-100 bg-[#F8FAFC] px-2.5 py-2">
                  <div className="text-[10px] text-slate-500">{label}</div>
                  <div className="mt-0.5 text-[13px] font-semibold tracking-tight text-slate-900">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="text-[11px] font-medium text-slate-800">Sales overview</div>
              <svg viewBox={`-28 -4 ${width + 36} ${height + 22}`} className="mt-1 h-[88px] w-full" role="img" aria-label="Sample sales chart for one day, not live results">
                {[0, 1, 2, 3].map((line) => (
                  <line key={line} x1="0" x2={width} y1={(height / 4) * line} y2={(height / 4) * line} stroke="#F1F5F9" strokeWidth="1" />
                ))}
                {['400', '300', '200', '100'].map((label, index) => (
                  <text key={label} x="-6" y={(height / 4) * index + 3} fontSize="8" fill="#94A3B8" textAnchor="end">{label}</text>
                ))}
                <polygon points={area} fill="#FFF1E6" />
                <polyline points={coords} fill="none" stroke="#F97316" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                {['9 AM', '12 PM', '3 PM', '6 PM', '9 PM'].map((label, index) => (
                  <text key={label} x={(width / 4) * index} y={height + 14} fontSize="8" fill="#94A3B8">{label}</text>
                ))}
              </svg>
            </div>
            <div className="mt-1">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-800">
                Recent orders
                <span className="font-normal text-slate-400">View all</span>
              </div>
              <div className="overflow-hidden">
                <div className="hidden grid-cols-[46px_52px_32px_1fr_44px_62px] gap-1 border-b border-slate-100 pb-1 text-[9px] text-slate-400 sm:grid">
                  <span>Order</span><span>Time</span><span>Table</span><span>Items</span><span>Amount</span><span>Status</span>
                </div>
                {ORDERS.map((row) => (
                  <div key={row[0]} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-slate-50 py-1 text-[10px] last:border-b-0 sm:grid-cols-[46px_52px_32px_1fr_44px_62px] sm:gap-1">
                    <span className="font-medium text-slate-700">{row[0]}</span>
                    <span className="hidden text-slate-500 sm:block">{row[1]}</span>
                    <span className="hidden text-slate-500 sm:block">{row[2]}</span>
                    <span className="truncate text-slate-500">{row[3]}</span>
                    <span className="hidden text-slate-700 sm:block">{row[4]}</span>
                    <span className={`justify-self-end rounded-full px-1.5 py-0.5 text-[9px] font-medium sm:justify-self-start ${row[5] === 'Preparing' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{row[5]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <div className="h-3 rounded-b-[12px] bg-gradient-to-b from-[#E2E8F0] to-[#CBD5E1]" />
    </div>
  );
}

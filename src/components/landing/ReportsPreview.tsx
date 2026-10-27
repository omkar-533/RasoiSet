const BARS = [
  ['9 AM', 34],
  ['12 PM', 52],
  ['3 PM', 42],
  ['6 PM', 92],
  ['9 PM', 64],
];

const ITEMS = [
  { name: 'Masala dosa', count: '48', src: '/landing/food-masala-dosa.jpg' },
  { name: 'Paneer butter masala', count: '36', src: '/landing/food-paneer-butter.jpg' },
  { name: 'Chicken biryani', count: '28', src: '/landing/food-chicken-biryani.jpg' },
  { name: 'Veg thali', count: '24', src: '/landing/food-veg-thali.jpg' },
];

export default function ReportsPreview() {
  return (
    <div className="grid gap-5 sm:grid-cols-[1.15fr_0.85fr] sm:items-center">
      <div>
        <div className="text-[11px] text-slate-500">Total sales</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[28px] font-semibold leading-none tracking-tight text-slate-900">₹24,350</span>
          <span className="text-xs font-semibold text-emerald-600">+12%</span>
        </div>
        <div className="mt-4 flex h-[92px] items-end gap-3" role="img" aria-label="Sample hourly sales for one day, highest at 6 PM">
          {BARS.map(([label, height]) => (
            <div key={label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="flex h-16 w-full items-end">
                <div className="w-full rounded-t-sm bg-[#F97316]" style={{ height: `${height}%` }} />
              </div>
              <span className="mt-1.5 text-center text-[10px] leading-none text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-medium text-slate-500">Top items</div>
        <ol className="mt-3 space-y-2.5">
          {ITEMS.map((item) => (
            <li key={item.name} className="flex items-center gap-2 text-sm text-slate-700">
              <img src={item.src} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="font-medium text-slate-900">{item.count}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

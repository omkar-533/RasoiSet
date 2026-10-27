const ROWS = [
  { name: 'Tomato', qty: '12 kg', level: 38, status: 'Low stock', tone: 'text-amber-700', bar: 'bg-amber-500', src: '/landing/ingredient-tomato.jpg' },
  { name: 'Paneer', qty: '2 kg', level: 68, status: 'Good', tone: 'text-emerald-700', bar: 'bg-emerald-500', src: '/landing/ingredient-paneer.jpg' },
  { name: 'Basmati rice', qty: '18 kg', level: 84, status: 'Good', tone: 'text-emerald-700', bar: 'bg-emerald-500', src: '/landing/ingredient-rice.jpg' },
  { name: 'Cooking oil', qty: '5 L', level: 18, status: 'Reorder', tone: 'text-red-700', bar: 'bg-red-500', src: '/landing/ingredient-oil.jpg' },
];

export default function InventoryPreview() {
  return (
    <ul className="space-y-3">
      {ROWS.map((row) => (
        <li key={row.name} className="flex items-center gap-3">
          <img src={row.src} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-900">{row.name}</span>
              <span className="text-slate-500">{row.qty}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
              <div className={`h-1.5 rounded-full ${row.bar}`} style={{ width: `${row.level}%` }} />
            </div>
          </div>
          <span className={`w-[4.5rem] shrink-0 text-right text-[11px] font-medium ${row.tone}`}>{row.status}</span>
        </li>
      ))}
    </ul>
  );
}

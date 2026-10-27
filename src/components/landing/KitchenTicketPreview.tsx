import { ChefHat } from 'lucide-react';

const ITEMS = ['2 × Paneer butter masala', '4 × Garlic naan', '1 × Mixed raita'];

export default function KitchenTicketPreview() {
  return (
    <div className="w-[252px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.12)]" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-slate-900">
          <ChefHat size={14} className="shrink-0 text-slate-500" aria-hidden />
          Table 06 · Ready to serve
        </div>
        <span className="shrink-0 text-[10px] text-slate-400">8:14 PM</span>
      </div>
      <ul className="mt-2 space-y-1">
        {ITEMS.map((item) => (
          <li key={item} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

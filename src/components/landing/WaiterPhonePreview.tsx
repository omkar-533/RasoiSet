const ITEMS = [
  { name: 'Paneer tikka', price: '₹280', src: '/landing/food-paneer-tikka.jpg' },
  { name: 'Masala dosa', price: '₹220', src: '/landing/food-masala-dosa.jpg' },
  { name: 'Veg thali', price: '₹320', src: '/landing/food-veg-thali.jpg' },
  { name: 'Chicken biryani', price: '₹340', src: '/landing/food-chicken-biryani.jpg' },
];

export default function WaiterPhonePreview() {
  return (
    <div className="w-[196px] rounded-[28px] border-[7px] border-slate-950 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.22)]" aria-hidden>
      <div className="px-2.5 pb-2.5 pt-1.5">
        <div className="text-center text-[9px] font-medium text-slate-900">9:41</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-900">New order</span>
          <span className="text-[10px] text-slate-400">Table 12</span>
        </div>
        <div className="mt-2 flex gap-1 text-[10px]">
          <span className="rounded-full bg-[#FFF7ED] px-2 py-0.5 font-semibold text-[#EA580C]">Dine-in</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Takeaway</span>
        </div>
        <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-400">Search dishes</div>
        <ul className="mt-2 space-y-1.5">
          {ITEMS.map((item) => (
            <li key={item.name} className="flex items-center gap-1.5">
              <img src={item.src} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-medium text-slate-800">{item.name}</span>
                <span className="text-[9px] text-slate-500">{item.price}</span>
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200">−</span>
                1
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200">+</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[11px]">
          <span className="text-slate-500">Total</span>
          <span className="font-semibold text-slate-900">₹1,160</span>
        </div>
        <div className="mt-1.5 rounded-lg bg-[#F97316] py-1.5 text-center text-[11px] font-semibold text-white">Send to kitchen</div>
      </div>
    </div>
  );
}

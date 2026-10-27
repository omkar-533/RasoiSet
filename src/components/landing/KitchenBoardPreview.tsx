const COLUMNS = [
  {
    title: 'Preparing',
    tone: 'text-amber-700',
    dot: 'bg-amber-500',
    tickets: [
      ['#1045', 'T8', 'Chicken biryani', '7:41 PM'],
      ['#1046', 'T4', 'Masala dosa', '8:22 PM'],
      ['#1040', 'T5', 'Veg noodles', '7:05 PM'],
    ],
  },
  {
    title: 'Ready',
    tone: 'text-emerald-700',
    dot: 'bg-emerald-500',
    tickets: [
      ['#1042', 'T8', 'Paneer butter masala', '7:38 PM'],
      ['#1047', 'T4', 'Veg thali', '8:28 PM'],
    ],
  },
  {
    title: 'Done',
    tone: 'text-slate-500',
    dot: 'bg-slate-400',
    tickets: [
      ['#1041', 'T3', 'Masala dosa', '7:21 PM'],
      ['#1039', 'T2', 'Veg thali', '7:28 PM'],
      ['#1038', 'T12', 'Chicken roll', '7:12 PM'],
    ],
  },
];

export default function KitchenBoardPreview() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {COLUMNS.map((column) => (
        <div key={column.title} className="rounded-xl bg-[#F8FAFC] p-1.5">
          <div className={`flex items-center gap-1 px-1 py-1 text-[11px] font-semibold ${column.tone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${column.dot}`} />
            {column.title}
            <span className="ml-auto font-medium text-slate-400">{column.tickets.length}</span>
          </div>
          <div className="space-y-1.5">
            {column.tickets.map((ticket) => (
              <div key={ticket[0]} className="rounded-lg border border-slate-100 bg-white px-2 py-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="font-medium text-slate-600">{ticket[0]}</span>
                  <span>{ticket[3]}</span>
                </div>
                <div className="truncate text-[11px] font-medium text-slate-800">{ticket[2]}</div>
                <div className="text-[10px] text-slate-500">{ticket[1]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

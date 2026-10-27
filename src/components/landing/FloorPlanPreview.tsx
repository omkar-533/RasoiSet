const TABLES = [
  ['T1', '2p', false],
  ['T2', '4p', true],
  ['T3', '2p', false],
  ['T4', '4p', false],
  ['T5', '4p', false],
  ['T6', '2p', true],
  ['T7', '4p', false],
  ['T8', '6p', true],
  ['T9', '2p', false],
  ['T10', '4p', false],
  ['T11', '2p', false],
  ['T12', '4p', false],
] as const;

const FILTERS = ['All (28)', 'Dining (20)', 'Terrace (6)', 'VIP (2)'];

function Plant({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 36 48" className={className} aria-hidden>
      <ellipse cx="18" cy="16" rx="8" ry="10" fill="#86EFAC" />
      <ellipse cx="10" cy="22" rx="6" ry="8" fill="#4ADE80" />
      <ellipse cx="26" cy="22" rx="6" ry="8" fill="#22C55E" />
      <path d="M14 30h8l2 10H12l2-10Z" fill="#E7E5E4" stroke="#D6D3D1" />
    </svg>
  );
}

export default function FloorPlanPreview() {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {FILTERS.map((filter, index) => (
          <span key={filter} className={`rounded-full px-2.5 py-1 ${index === 0 ? 'bg-slate-900 font-medium text-white' : 'bg-slate-100 text-slate-500'}`}>{filter}</span>
        ))}
      </div>
      <div className="relative mt-3 overflow-hidden rounded-2xl bg-[#F4F0E8] px-8 py-4">
        <Plant className="absolute left-1 top-8 h-12 w-9" />
        <Plant className="absolute bottom-6 right-1 h-12 w-9" />
        <div className="grid grid-cols-4 gap-2">
          {TABLES.map(([name, seats, occupied]) => (
            <div key={name} className={`rounded-xl border bg-white px-1 py-2 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${occupied ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
              <div className="text-[12px] font-semibold text-slate-900">{name}</div>
              <div className="text-[10px] text-slate-400">{seats}</div>
              <div className={`text-[10px] font-medium ${occupied ? 'text-amber-700' : 'text-emerald-600'}`}>{occupied ? 'Occupied' : 'Available'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

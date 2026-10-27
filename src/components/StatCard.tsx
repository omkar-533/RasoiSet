import type { LucideIcon } from 'lucide-react';

const tones = {
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-brand-50 text-brand-700',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-500',
} as const;

interface Props {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'muted';
  Icon: LucideIcon;
  tone?: keyof typeof tones;
}

export default function StatCard({ label, value, delta, deltaTone = 'up', Icon, tone = 'orange' }: Props) {
  const deltaClass = deltaTone === 'down' ? 'text-red-600' : deltaTone === 'muted' ? 'text-slate-500' : 'text-emerald-600';

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-500">{label}</div>
          <div className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</div>
          {delta && <div className={`mt-2 text-xs font-medium ${deltaClass}`}>{delta}</div>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={18} aria-hidden />
        </div>
      </div>
    </div>
  );
}

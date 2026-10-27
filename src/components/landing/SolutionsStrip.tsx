import { ArrowRight, Building2, Store, TrendingUp } from 'lucide-react';

const PLANS = [
  { name: 'Starter', text: 'Everything you need to get started.', icon: Store },
  { name: 'Growth', text: 'More tools for a growing restaurant.', icon: TrendingUp },
  { name: 'Multi-outlet', text: 'Built for multiple locations.', icon: Building2 },
];

export default function SolutionsStrip({ onSelect }: { onSelect: (interest: string) => void }) {
  return (
    <section id="plans" className="scroll-mt-24 border-y border-slate-200 bg-white">
      <div className="mx-auto grid max-w-[1240px] items-center gap-6 px-6 py-8 lg:grid-cols-[0.82fr_1.18fr] lg:px-10">
        <div>
          <h2 className="text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] text-slate-900 sm:text-[34px]">
            One outlet today.
            <br />
            Room to grow tomorrow.
          </h2>
          <p className="mt-2 text-sm text-slate-500">Simple plans for where you are, and where you’re headed.</p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid flex-1 gap-4 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className="sm:border-l sm:border-slate-200 sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
                <plan.icon size={18} className="text-slate-500" aria-hidden />
                <h3 className="mt-2 text-sm font-semibold text-slate-900">{plan.name}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{plan.text}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#EA580C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            onClick={() => onSelect('general')}
          >
            Find your fit <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

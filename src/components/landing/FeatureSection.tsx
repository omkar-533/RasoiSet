import { BarChart3, ChefHat, ChevronDown, Package, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import FloorPlanPreview from './FloorPlanPreview';
import InventoryPreview from './InventoryPreview';
import KitchenBoardPreview from './KitchenBoardPreview';
import ReportsPreview from './ReportsPreview';

const shell = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6';

function Panel({
  icon,
  title,
  text,
  action,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
  children: ReactNode;
  className: string;
}) {
  return (
    <article className={`${shell} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span className="text-slate-500">{icon}</span>
            {title}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{text}</p>
        </div>
        <div className="shrink-0 pt-0.5 text-[12px] text-slate-400">{action}</div>
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

export default function FeatureSection() {
  return (
    <section id="product" className="scroll-mt-24 bg-app py-12 sm:py-16">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-10">
        <div className="grid items-center gap-4 lg:grid-cols-2">
          <h2 className="text-[36px] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-900 sm:text-[44px]">
            A busy service.
            <br />
            A clear picture.
          </h2>
          <p className="max-w-sm text-base leading-7 text-slate-500 lg:justify-self-end">
            Everything you need to run your restaurant, from the first order to the final bill.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-12">
          <Panel
            className="lg:col-span-7"
            icon={<Table2 size={18} aria-hidden />}
            title="Tables & orders"
            text="See your floor, manage tables and track orders in real time."
            action={<span>Live floor view</span>}
          >
            <FloorPlanPreview />
          </Panel>
          <Panel
            className="lg:col-span-5"
            icon={<ChefHat size={18} aria-hidden />}
            title="Keep the kitchen moving"
            text="Live kitchen display keeps everyone in sync."
            action={<span>View all</span>}
          >
            <KitchenBoardPreview />
          </Panel>
          <Panel
            className="lg:col-span-5"
            icon={<Package size={18} aria-hidden />}
            title="Stock that stays in check"
            text="Track ingredients, get low-stock alerts and reduce waste."
            action={<span>View inventory</span>}
          >
            <InventoryPreview />
          </Panel>
          <Panel
            className="lg:col-span-7"
            icon={<BarChart3 size={18} aria-hidden />}
            title="Know your numbers"
            text="Get a clear view of sales, top items and restaurant performance."
            action={<span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-500">Today <ChevronDown size={12} aria-hidden /></span>}
          >
            <ReportsPreview />
          </Panel>
        </div>
      </div>
    </section>
  );
}

import DashboardPreview from './DashboardPreview';
import KitchenTicketPreview from './KitchenTicketPreview';
import WaiterPhonePreview from './WaiterPhonePreview';

export default function HeroProductComposition() {
  return (
    <div className="relative">
      <img
        src="/landing/hero-cafe.jpg"
        alt=""
        width={1600}
        height={900}
        fetchPriority="high"
        className="pointer-events-none absolute -right-8 top-0 hidden h-[84%] w-full rounded-[32px] object-cover object-[center_35%] lg:block"
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[46%] bg-gradient-to-r from-white via-white/70 to-transparent lg:block" />
      <p className="relative z-10 mb-2 text-right text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Product preview</p>
      <div className="relative z-10 lg:pb-8 lg:pl-10 lg:pr-1 lg:pt-1">
        <DashboardPreview />
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between lg:mt-0">
          <div className="lg:absolute lg:bottom-2 lg:left-0 lg:z-20">
            <WaiterPhonePreview />
          </div>
          <div className="lg:absolute lg:bottom-10 lg:right-2 lg:z-20">
            <KitchenTicketPreview />
          </div>
        </div>
      </div>
    </div>
  );
}

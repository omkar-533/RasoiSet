import { ArrowRight } from 'lucide-react';

export default function FinalCTA({ onBookDemo }: { onBookDemo: () => void }) {
  return (
    <section id="contact" className="relative scroll-mt-24 overflow-hidden bg-white">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-10 lg:py-10">
        <div>
          <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-slate-900 sm:text-[34px]">Your restaurant. All set.</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">Join restaurants, cafés and cloud kitchens that run smarter with RasoiSet.</p>
        </div>
        <button type="button" className="landing-cta h-11 w-fit shrink-0" onClick={onBookDemo}>
          Book a demo <ArrowRight size={16} aria-hidden />
        </button>
      </div>
      <svg aria-hidden viewBox="0 0 40 40" className="pointer-events-none absolute bottom-1 right-6 hidden h-20 w-20 text-slate-200 sm:block">
        <rect x="17" y="8" width="6" height="4.2" rx="2" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <path d="M8 28C8 16.8 13 12 20 12s12 4.8 12 16H8Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <path d="M5 31.8h30" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </section>
  );
}

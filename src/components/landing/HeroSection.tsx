import { ArrowRight, Play } from 'lucide-react';
import HeroProductComposition from './HeroProductComposition';

export default function HeroSection({ onBookDemo }: { onBookDemo: () => void }) {
  return (
    <section className="mx-auto grid max-w-[1240px] items-center gap-8 px-6 pb-10 pt-8 lg:grid-cols-[minmax(0,31rem)_minmax(0,1fr)] lg:gap-6 lg:px-10 lg:pb-8 lg:pt-10">
      <div className="landing-rise max-w-[31rem]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">The restaurant operating system</p>
        <h1 className="mt-3 text-[40px] font-extrabold leading-[1.02] tracking-[-0.04em] text-slate-900 sm:text-[52px] lg:text-[58px]">
          Great food.
          <br />
          <span className="lg:whitespace-nowrap">
            <span className="relative inline-block">
              Smooth
              <span className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-[#F97316]" aria-hidden />
            </span>
            {' '}operations.
          </span>
        </h1>
        <p className="mt-5 max-w-sm text-lg leading-7 text-slate-500">
          Orders, kitchen, billing and stock.
          <br />
          Finally, working together.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <button type="button" className="landing-cta h-11" onClick={onBookDemo}>
            Book a demo <ArrowRight size={16} aria-hidden />
          </button>
          <a href="#product" className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700">
              <Play size={13} fill="currentColor" aria-hidden />
            </span>
            Explore the product
          </a>
        </div>
        <p className="mt-8 text-sm text-slate-500">
          Restaurants <span aria-hidden> / </span> Cafés <span aria-hidden> / </span> Cloud kitchens <span aria-hidden> / </span> Multi-outlet teams
        </p>
      </div>
      <HeroProductComposition />
    </section>
  );
}

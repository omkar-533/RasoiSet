import { LineChart, UtensilsCrossed, Zap } from 'lucide-react';

const BENEFITS = [
  { icon: UtensilsCrossed, title: 'Fewer handoffs', text: 'Orders flow directly from table to kitchen.' },
  { icon: LineChart, title: 'Clearer daily decisions', text: 'Live data, easy reports.' },
  { icon: Zap, title: 'One connected workflow', text: 'Front of house, kitchen and back office — in sync.' },
];

export default function RestaurantStory() {
  return (
    <section id="solutions" className="scroll-mt-24 mx-auto grid max-w-[1240px] items-center gap-8 px-6 py-14 lg:grid-cols-2 lg:px-10 lg:py-16">
      <div className="overflow-hidden rounded-2xl bg-app">
        <img
          src="/landing/plating.jpg"
          alt="Chef’s hands plating a restaurant dish"
          width={1200}
          height={900}
          loading="lazy"
          decoding="async"
          className="aspect-[16/10] h-full w-full object-cover"
        />
      </div>
      <div>
        <h2 className="text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] text-slate-900 sm:text-5xl">More time for what you do best.</h2>
        <p className="mt-3 max-w-md text-base leading-7 text-slate-500">Let RasoiSet handle the operational complexity, so you can focus on great food and happy guests.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title}>
              <benefit.icon size={16} className="text-slate-500" aria-hidden />
              <div className="mt-2 text-sm font-semibold text-slate-900">{benefit.title}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{benefit.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

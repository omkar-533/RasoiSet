import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from '../Logo';

const LINKS = [
  { id: 'product', label: 'Product' },
  { id: 'solutions', label: 'Solutions' },
  { id: 'plans', label: 'Pricing' },
];

function SectionLink({ id, label, onNavigate }: { id: string; label: string; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const className = 'rounded-md px-1 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';
  if (pathname === '/') {
    return (
      <a href={`#${id}`} className={className} onClick={onNavigate}>
        {label}
      </a>
    );
  }
  return (
    <Link to={`/#${id}`} className={className} onClick={onNavigate}>
      {label}
    </Link>
  );
}

export default function SiteHeader({ onBookDemo }: { onBookDemo?: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);
  const demoClass = 'landing-cta h-10 px-4';

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-4 px-6 lg:px-10">
        <Link to="/" aria-label="RasoiSet home" className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700" onClick={close}>
          <Logo markSize={32} />
        </Link>
        <nav aria-label="Page" className="ml-6 hidden items-center gap-5 md:flex">
          {LINKS.map((link) => (
            <SectionLink key={link.id} {...link} onNavigate={close} />
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <Link to="/login" className="rounded-md px-2 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
            Log in
          </Link>
          {onBookDemo ? (
            <button type="button" className={demoClass} onClick={onBookDemo}>Book a demo</button>
          ) : (
            <Link to="/?demo=general" className={demoClass}>Book a demo</Link>
          )}
        </div>
        <button
          type="button"
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col">
            {LINKS.map((link) => (
              <SectionLink key={link.id} {...link} onNavigate={close} />
            ))}
            <Link to="/login" className="rounded-md px-1 py-2 text-sm font-medium text-slate-700" onClick={close}>
              Log in
            </Link>
            {onBookDemo ? (
              <button type="button" className={`${demoClass} mt-2`} onClick={() => { close(); onBookDemo(); }}>Book a demo</button>
            ) : (
              <Link to="/?demo=general" className={`${demoClass} mt-2`} onClick={close}>Book a demo</Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

import { Link } from 'react-router-dom';
import Logo from '../Logo';

export default function SiteFooter({ onContact }: { onContact?: () => void }) {
  const linkClass = 'rounded-md text-sm text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700';
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <Link to="/" aria-label="RasoiSet home" className="w-fit rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
          <Logo markSize={32} />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <a className={linkClass} href="/#product">Product</a>
          {onContact ? (
            <button type="button" className={linkClass} onClick={onContact}>Contact</button>
          ) : (
            <a className={linkClass} href="/#contact">Contact</a>
          )}
          <Link className={linkClass} to="/privacy">Privacy</Link>
          <Link className={linkClass} to="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

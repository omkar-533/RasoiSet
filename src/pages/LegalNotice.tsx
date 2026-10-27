import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import SiteFooter from '../components/landing/SiteFooter';
import SiteHeader from '../components/landing/SiteHeader';

export default function LegalNotice({ topic }: { topic: 'privacy' | 'terms' }) {
  const title = topic === 'privacy' ? 'Privacy' : 'Terms';
  useEffect(() => {
    document.title = `${title} | RasoiSet`;
  }, [title]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          RasoiSet has not published a {topic === 'privacy' ? 'privacy policy' : 'terms of service'}. Demo requests entered on this server are stored in its database.
          No email notification is sent, because no mail provider is configured.
        </p>
        <Link to="/" className="mt-8 inline-flex text-sm font-medium text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
          Back to RasoiSet
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

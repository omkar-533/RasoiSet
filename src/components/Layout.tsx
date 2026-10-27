import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { brand } from '../brand';
import { useStore } from '../store/useStore';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function Layout() {
  const notice = useStore((s) => s.notice);
  const dismissNotice = useStore((s) => s.dismissNotice);
  const isDemo = useStore((s) => s.session?.isDemo);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.title = brand.documentTitle;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-app text-slate-900">
      <div className={`hidden h-full shrink-0 md:block ${collapsed ? 'w-[72px]' : 'w-60'}`}>
        <Sidebar collapsed={collapsed} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Navigation" className="relative h-full w-60 max-w-[85vw] shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-app">
          {isDemo && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Demo restaurant. Records here are sample data and are kept separate from other restaurants.
            </div>
          )}
          {notice && (
            <div className="flex items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
              <span>{notice}</span>
              <button type="button" className="shrink-0 font-medium" onClick={dismissNotice}>Dismiss</button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

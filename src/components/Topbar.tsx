import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logout, switchRestaurant, useStore } from '../store/useStore';

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}

export default function Topbar({ collapsed, onToggleCollapse, onOpenMobile }: Props) {
  const { settings, updateSettings, session } = useStore();
  const name = session?.name || 'Account';
  const role = session?.platformRole === 'super_admin' ? 'Super admin' : session?.role || '';
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex h-16 min-w-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-3 sm:px-5">
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label="Open menu"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50 md:hidden"
      >
        <Menu size={20} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50 md:inline-flex"
      >
        {collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
      </button>

      <div className="relative min-w-0 flex-1 max-w-md">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          aria-label="Search menu, orders, and customers"
          placeholder="Search menu, order #, customer..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {session?.platformRole === 'super_admin' && (
          <select
            aria-label="Active restaurant"
            value={session.restaurantId}
            onChange={(e) => switchRestaurant(e.target.value)}
            className="max-w-[8rem] truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 focus:outline-none sm:max-w-[14rem]"
          >
            {(session.restaurants || []).map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5 text-slate-600">
          <Store size={16} aria-hidden className="hidden sm:block" />
          <select
            aria-label="Active branch"
            value={settings.activeOutletId}
            onChange={(e) => updateSettings({ activeOutletId: e.target.value })}
            className="max-w-[9.5rem] truncate bg-transparent text-sm font-medium text-slate-700 focus:outline-none sm:max-w-[16rem]"
          >
            {settings.outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="hidden text-sm text-slate-500 xl:block">
          {time.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })} ·{' '}
          {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50"
        >
          <Bell size={18} aria-hidden />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <div className="flex items-center gap-2" aria-label={`${name}, ${role}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white" aria-hidden>
            {name.charAt(0)}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-slate-900">{name}</div>
            <div className="text-[11px] capitalize text-slate-500">{role}</div>
          </div>
          <button type="button" className="btn-secondary hidden h-10 px-3 sm:inline-flex" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

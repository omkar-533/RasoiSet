import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Grid3X3,
  ChefHat,
  MonitorPlay,
  UtensilsCrossed,
  Package,
  Users,
  Globe,
  ReceiptText,
  BarChart3,
  UserCog,
  Settings as SettingsIcon,
  Truck,
  X,
} from 'lucide-react';
import { brand } from '../brand';
import Logo from './Logo';

const items = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, exact: true },
  { to: '/pos', label: 'POS / Billing', Icon: ShoppingCart },
  { to: '/tables', label: 'Tables', Icon: Grid3X3 },
  { to: '/kot', label: 'KOT', Icon: ChefHat },
  { to: '/kds', label: 'Kitchen Display', Icon: MonitorPlay },
  { to: '/menu', label: 'Menu', Icon: UtensilsCrossed },
  { to: '/inventory', label: 'Inventory', Icon: Package },
  { to: '/vendors', label: 'Vendors', Icon: Truck },
  { to: '/customers', label: 'Customers', Icon: Users },
  { to: '/online', label: 'Online orders', Icon: Globe },
  { to: '/orders', label: 'Orders', Icon: ReceiptText },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/staff', label: 'Staff', Icon: UserCog },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

interface Props {
  collapsed?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
}

export default function Sidebar({ collapsed = false, onNavigate, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (onClose) closeRef.current?.focus();
  }, [onClose]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white">
      <div className={`flex items-center border-b border-slate-200 ${collapsed ? 'justify-center px-2 py-4' : 'gap-2 px-4 py-4'}`}>
        <NavLink to="/" onClick={onNavigate} aria-label={`${brand.name}, ${brand.subtitle}`} className="min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
          <Logo collapsed={collapsed} markSize={collapsed ? 32 : 36} />
        </NavLink>
        {onClose && (
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main">
        {items.map(({ to, label, Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            title={collapsed ? label : undefined}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 border-l-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-700 ${
                collapsed ? 'justify-center px-0' : 'px-4'
              } ${
                isActive
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-transparent text-slate-600 hover:bg-slate-50'
              }`
            }
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
            <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className={`border-t border-slate-200 text-[11px] text-slate-400 ${collapsed ? 'px-2 py-3 text-center' : 'px-4 py-3'}`}>
        {collapsed ? 'v0.1' : `${brand.name} · v0.1`}
      </div>
    </aside>
  );
}

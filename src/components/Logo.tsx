import { brand, colors } from '../brand';

interface MarkProps {
  size?: number;
  title?: string;
}

/** Flat orange serving cloche with a checkmark. Same paths as public/favicon.svg. */
export function LogoMark({ size = 36, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="shrink-0"
    >
      <rect x="17" y="8" width="6" height="4.2" rx="2" fill={colors.brand} />
      <path d="M8 28C8 16.8 13 12 20 12s12 4.8 12 16H8Z" fill={colors.brand} />
      <path d="M5 30.2h30a1.6 1.6 0 0 1 0 3.2H5a1.6 1.6 0 0 1 0-3.2Z" fill={colors.brand} />
      <path
        d="M15.4 21.6 18.5 24.8 25 17.6"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  collapsed?: boolean;
  markSize?: number;
}

export default function Logo({ collapsed = false, markSize = 36 }: LogoProps) {
  return (
    <div className={`flex items-center min-w-0 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
      <LogoMark size={markSize} />
      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold leading-none tracking-tight text-slate-900">{brand.name}</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">{brand.subtitle}</div>
        </div>
      )}
    </div>
  );
}

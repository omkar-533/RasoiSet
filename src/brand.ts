/** Central product identity. Restaurant records stay in settings and are not rewritten here. */
export const brand = {
  name: 'RasoiSet',
  subtitle: 'RESTAURANT OS',
  documentTitle: 'RasoiSet — Restaurant OS',
  description: 'RasoiSet is a restaurant operating system for billing, kitchen, inventory and reports.',
} as const;

/** Shared palette. Tailwind `brand` and `app` tokens map to these values. */
export const colors = {
  app: '#F7F9FC',
  surface: '#FFFFFF',
  ink: '#0F172A',
  muted: '#64748B',
  icon: '#475569',
  line: '#E2E8F0',
  brand: '#F97316',
  brandDeep: '#C2410C',
  navActive: '#FFF7ED',
} as const;

const PLACEHOLDER_NAMES: Record<string, string> = {
  'Pet Pooja': brand.name,
  Petpooja: brand.name,
  'petpooja': brand.name,
  'Pet Pooja — Main Branch': `${brand.name} — Main Branch`,
  'Pet Pooja — Mall Road': `${brand.name} — Mall Road`,
  'Petpooja — Main Branch': `${brand.name} — Main Branch`,
  'Petpooja — Mall Road': `${brand.name} — Mall Road`,
};

/** Replace only the original demo product names. Custom restaurant and branch names are left as stored. */
export function applyPlaceholderBrand<T extends { restaurantName: string; outlets?: Array<{ name: string }> }>(settings: T): T {
  return {
    ...settings,
    restaurantName: PLACEHOLDER_NAMES[settings.restaurantName] ?? settings.restaurantName,
    outlets: (settings.outlets ?? []).map((outlet) => ({
      ...outlet,
      name: PLACEHOLDER_NAMES[outlet.name] ?? outlet.name,
    })),
  };
}

// UPGRADE.1 — the Pro pitch, in ONE place.
//
// Two surfaces sell the same plan: the public pricing grid
// (src/components/landing/PricingSection.tsx) and the in-app upgrade page
// (src/pages/Upgrade.tsx). The price, the $15 anchor, the founding-price
// promise, the feature list and the interval-toggle labels live here so the two
// can never drift. Copy that belongs to a single surface (page headings, button
// labels, empty states) stays in that surface's i18n keys instead.
//
// This file is MARKETING copy. What each tier can actually do is enforced by
// `src/lib/entitlements.ts` (client) and the ENT.SRV quotas (server); the
// feature list below is written to match ENTITLEMENTS.pro.
//
// Strings are inline en/es pairs rather than dictionary keys because the pricing
// grid has always worked that way — moving them into `useLanguage` would fork
// the copy mid-migration, which is exactly what this module exists to prevent.

import type { BillingInterval } from '@/lib/billing';

const tx = (language: string, en: string, es: string) => (language === 'es' ? es : en);

/** Founding rate per interval, expressed as a MONTHLY figure. The annual plan
 *  bills $84 once a year, which is the $7/mo shown here. */
export const PRO_PRICE: Record<BillingInterval, string> = {
  month: '$9',
  year: '$7',
};

/** List price the founding rate is anchored against. */
export const PRO_ANCHOR_PRICE = '$15';

/** The struck-through anchor shown beside the founding price. */
export const proAnchorLabel = (language: string): string =>
  tx(language, `then ${PRO_ANCHOR_PRICE}/mo`, `luego ${PRO_ANCHOR_PRICE}/mes`);

/** The founding-price chip — the promise that this rate never rises. */
export const proFoundingLabel = (language: string): string =>
  tx(language, 'Founding price — lock it in forever', 'Precio de lanzamiento — consérvalo para siempre');

/** Period suffix beside the price, e.g. "$7 /mo, billed annually". */
export const proPeriodLabel = (language: string, interval: BillingInterval): string =>
  interval === 'year'
    ? tx(language, '/mo, billed annually', '/mes, facturado anual')
    : tx(language, '/month', '/mes');

/** One-line positioning for the Pro tier. */
export const proDesc = (language: string): string =>
  tx(language, 'Everything to grow your brand and audience.', 'Todo para hacer crecer tu marca y audiencia.');

/** What Pro unlocks. Mirrors ENTITLEMENTS.pro in `src/lib/entitlements.ts`. */
export const proFeatures = (language: string): string[] => [
  tx(language, 'Two pages', 'Dos páginas'),
  tx(language, 'All premium themes', 'Todos los temas premium'),
  tx(language, 'Full analytics', 'Analíticas completas'),
  tx(language, 'Link animations', 'Animaciones de enlaces'),
  tx(language, 'Custom fonts & Brand Kit', 'Fuentes personalizadas y Kit de marca'),
  tx(language, 'Email subscribe block', 'Bloque de suscripción'),
  tx(language, '5 restore points', '5 puntos de restauración'),
  tx(language, 'TitiLinks badge — optional', 'Insignia de TitiLinks — opcional'),
];

/** Monthly ⇄ annual toggle copy, shared by both surfaces. */
export const intervalToggleLabels = (language: string) => ({
  monthly: tx(language, 'Monthly', 'Mensual'),
  annual: tx(language, 'Annual', 'Anual'),
  save: tx(language, 'Save 20%', 'Ahorra 20%'),
  /** Accessible name for the toggle control itself. */
  aria: tx(language, 'Toggle annual billing', 'Cambiar a facturación anual'),
});

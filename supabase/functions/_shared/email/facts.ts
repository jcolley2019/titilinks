// EMAIL.DRIP.1 — the product facts the onboarding emails quote.
//
// PURE (see layout.ts). The edge function cannot import src/, so the numbers and
// routes live here, and scripts/email-infra.test.mjs fails the guard chain the
// moment one drifts from the app:
//   FREE_SHORT_LINKS   ↔ ENTITLEMENTS.free.maxShortLinks   (src/lib/entitlements.ts)
//   PRO_PRICE_*        ↔ PRO_PRICE                         (src/lib/pricing.ts)
//   *_PATH             ↔ a <Route path="…"> in src/App.tsx
// Change the app and this file together.

/** Custom short links (/s/:slug) the Free plan allows. */
export const FREE_SHORT_LINKS = 3;

/** Pro, billed monthly. */
export const PRO_PRICE_MONTH = "$9";
/** Pro, billed yearly, shown as a monthly figure (PRO_PRICE.year). */
export const PRO_PRICE_YEAR_MONTHLY = "$7";
/** What the yearly plan bills once a year: 12 × PRO_PRICE_YEAR_MONTHLY. */
export const PRO_PRICE_YEAR_TOTAL = "$84";

/** Signed-in routes the buttons open. Each is a ProtectedRoute in App.tsx. */
export const EDITOR_PATH = "/dashboard/editor";
export const ANALYTICS_PATH = "/dashboard/analytics";
export const UPGRADE_PATH = "/dashboard/upgrade";

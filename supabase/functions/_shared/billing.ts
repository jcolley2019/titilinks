// BILL — the server-side price allowlist. This is the authority on what a
// customer may be charged; the client's `priceId` is only ever a *request*.
//
// Kept in sync by hand with `src/lib/billing.ts` (the client copy that renders
// the pricing buttons). The duplication is intentional and unavoidable: the app
// bundle is Vite/TS and this runs in Deno Edge, so there is no shared import.
// The client copy is a convenience; THIS copy decides.
//
// Stripe SANDBOX ids. Business-tier prices exist in Stripe but are deliberately
// absent here — the tier is hidden in the UI and must not be purchasable.

export type BillingInterval = "month" | "year";

export interface PriceDefinition {
  /** Stripe price id (sandbox). */
  id: string;
  /** Stripe lookup key — the stable name; ids change when a price is recreated. */
  lookupKey: string;
  /** Plan tier this price grants. Mirrors `Plan` in src/lib/entitlements.ts. */
  plan: "pro";
  interval: BillingInterval;
}

export const PRO_PRICES: PriceDefinition[] = [
  {
    id: "price_1Tw3jiGnt7Tsx25PQEBDG0SY",
    lookupKey: "pro_monthly_founding",
    plan: "pro",
    interval: "month",
  },
  {
    id: "price_1Tw447Gnt7Tsx25PVouXzkmj",
    lookupKey: "pro_yearly_founding",
    plan: "pro",
    interval: "year",
  },
];

/** Every price id a checkout session may be created for. */
export const ALLOWED_PRICE_IDS: readonly string[] = PRO_PRICES.map((p) => p.id);

/**
 * Resolve a client-supplied price id to its definition, or null when it is not
 * on the allowlist. A null return must be a 400 — never a fallback to a default
 * price, which would charge someone for something they did not pick.
 */
export function priceDefinitionFor(priceId: unknown): PriceDefinition | null {
  if (typeof priceId !== "string" || priceId.length === 0) return null;
  return PRO_PRICES.find((p) => p.id === priceId) ?? null;
}

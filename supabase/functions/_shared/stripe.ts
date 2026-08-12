// Minimal Stripe REST client + webhook signature verification for Deno Edge.
//
// Deliberately dependency-free: `fetch` + Web Crypto only, no `esm.sh/stripe`
// shim. The Stripe SDK pulls a large npm-compat bundle into every cold start
// and drags an API-version pin along with it; the three calls this app makes
// (create checkout session, create portal session, cancel subscription) plus
// HMAC signature verification are each a handful of lines against the raw API.

const STRIPE_API = "https://api.stripe.com/v1";

/**
 * BILL.PIN.1 — the Stripe API version every outbound call is pinned to.
 *
 * Sent as `Stripe-Version` on every request. Without it the calls ride the
 * ACCOUNT DEFAULT, so Stripe rolling that forward would change object shapes
 * under code that never changed — silently, and in production first.
 *
 * BUMPING THIS CONSTANT IS A DELIBERATE ACT. It is not a dependency upgrade to
 * be done in passing: it changes the shape of what `stripeFetch` returns, and
 * every field the webhook reads off a fetched object must be re-verified
 * against the new version's reference before it ships. At minimum re-check
 *   • subscription: `status`, `current_period_end` vs `items.data[].current_period_end`
 *   • invoice: `subscription` vs `parent.subscription_details`
 *   • charge: `customer`, and `dispute.charge` (the Dispute carries no customer)
 * — see `_shared/plan-lifecycle.ts`, which already straddles two shapes for the
 * first two, and `stripe-webhook/index.ts` handleDisputeCreated for the third.
 *
 * WEBHOOK PAYLOADS DO NOT COME FROM THIS. Events are delivered at the version
 * pinned on the ENDPOINT in the Stripe dashboard (Developers → Webhooks → the
 * endpoint → API version), which nothing we deploy can set. The two must be
 * kept equal by hand. Verified equal at 2026-06-24.dahlia for endpoint
 * `titilinks-live` on 2026-08-12; re-verify whenever either moves, and note the
 * endpoint version is per-endpoint, so test and live mode can diverge.
 */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

/** The Stripe secret key from the edge-function environment. Never logged. */
export function stripeSecretKey(): string {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

/**
 * Flatten a nested object into Stripe's bracketed form-encoding, e.g.
 *   { line_items: [{ price: 'p', quantity: 1 }] }
 *     → line_items[0][price]=p&line_items[0][quantity]=1
 * `undefined` and `null` values are dropped so callers can pass optional fields
 * inline without building the object conditionally.
 */
export function encodeForm(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();

  const walk = (prefix: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(`${prefix}[${k}]`, v);
      }
    } else {
      params.append(prefix, String(value));
    }
  };

  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) || typeof v === "object") walk(k, v);
    else params.append(k, String(v));
  }

  return params.toString();
}

export interface StripeCallOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  /** Stripe idempotency key — safe retries for POSTs that create objects. */
  idempotencyKey?: string;
}

/**
 * Call the Stripe REST API. Throws with Stripe's own error message on non-2xx
 * so callers can surface a useful reason without leaking the secret key.
 */
export async function stripeFetch<T = Record<string, unknown>>(
  path: string,
  { method = "POST", body, idempotencyKey }: StripeCallOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
    // Pinned, not inherited — see STRIPE_API_VERSION.
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: body ? encodeForm(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const msg =
      (parsed as { error?: { message?: string } } | null)?.error?.message ??
      `Stripe ${res.status}: ${text.slice(0, 300)}`;
    throw new Error(msg);
  }

  return parsed as T;
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/** Stripe rejects/accepts events within a 5-minute clock-skew window. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Parse a `Stripe-Signature` header into its timestamp and v1 signatures. */
export function parseSignatureHeader(header: string): { timestamp: number; v1: string[] } {
  let timestamp = 0;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "t" && v) timestamp = Number.parseInt(v, 10);
    else if (k === "v1" && v) v1.push(v);
  }
  return { timestamp, v1 };
}

/** Constant-time comparison of two hex digests of equal expected length. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify a Stripe webhook signature over the RAW request body.
 *
 * `rawBody` must be the exact bytes Stripe sent — re-serialising the parsed
 * JSON changes key order/whitespace and the HMAC will not match.
 *
 * `nowSeconds` is injectable so the replay-window branch is testable without
 * freezing the clock.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!signatureHeader) return { ok: false, reason: "missing Stripe-Signature header" };
  if (!secret) return { ok: false, reason: "STRIPE_WEBHOOK_SECRET is not set" };

  const { timestamp, v1 } = parseSignatureHeader(signatureHeader);
  if (!timestamp || v1.length === 0) {
    return { ok: false, reason: "malformed Stripe-Signature header" };
  }
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside the tolerance window" };
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  // Stripe may send several v1 signatures during a secret rotation; any match wins.
  if (v1.some((candidate) => timingSafeEqualHex(candidate, expected))) return { ok: true };

  return { ok: false, reason: "no signature matched" };
}

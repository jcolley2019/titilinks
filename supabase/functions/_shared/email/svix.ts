// EMAIL.INFRA.1 — Svix signature verification for Resend webhooks.
//
// Resend signs every delivery through Svix. The signed content is
// `${svix-id}.${svix-timestamp}.${raw body}`, HMAC-SHA256 with the base64 part
// of the `whsec_…` signing secret as the key, sent base64 in `svix-signature`
// as a space-separated list of `v1,<signature>` (several during a rotation —
// any match wins).
//
// WebCrypto + atob/btoa only, so it runs in Deno and, for the guard chain,
// under tsx. The clock is a parameter for the same reason.

const TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Constant-time string compare. Length is not secret; the bytes are. */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The base64 `v1` signature for a delivery. Exported for the unit test. */
export async function signSvix(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`));
  return bytesToBase64(new Uint8Array(mac));
}

export async function verifySvixSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!secret) return { ok: false, reason: "RESEND_WEBHOOK_SECRET is not set" };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing svix headers" };
  }
  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "malformed svix-timestamp" };
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside the tolerance window" };
  }

  let expected: string;
  try {
    expected = await signSvix(secret, headers.id, headers.timestamp, rawBody);
  } catch {
    return { ok: false, reason: "signing secret is not valid base64" };
  }

  const candidates = headers.signature
    .split(" ")
    .map((part) => part.split(","))
    .filter(([version, sig]) => version === "v1" && !!sig)
    .map(([, sig]) => sig);
  if (candidates.some((candidate) => constantTimeEquals(candidate, expected))) return { ok: true };
  return { ok: false, reason: "no signature matched" };
}

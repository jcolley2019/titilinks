// Shared CORS headers + JSON response helpers for the BILL edge functions.
//
// The pre-BILL functions (ai-enhance, shortlinks, …) each inline their
// own `corsHeaders` object. Those are deliberately left alone — this module is
// the shared home for new functions, not a refactor of the old ones.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

/** JSON response with CORS headers applied. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Standard `{ error }` payload. */
export function fail(message: string, status: number): Response {
  return json({ error: message }, status);
}

/** CORS preflight response. */
export function preflight(): Response {
  return new Response(null, { headers: corsHeaders });
}

/**
 * Resolve the site origin to build Stripe return URLs from.
 *
 * Prefers the request's `Origin` header so dev (localhost:8085) and prod both
 * work from one deploy, but only when it is a URL we recognise: an exact match
 * for the `SITE_URL` secret, or any localhost/127.0.0.1 port. Anything else
 * falls back to `SITE_URL` — a stranger's Origin header must never end up as a
 * Stripe `success_url`.
 */
export function resolveSiteOrigin(req: Request): string {
  const configured = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
  const origin = req.headers.get("origin") ?? "";

  if (origin) {
    try {
      const u = new URL(origin);
      const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (isLocal || (configured && origin.replace(/\/+$/, "") === configured)) {
        return origin.replace(/\/+$/, "");
      }
    } catch {
      /* malformed Origin — fall through to the configured value */
    }
  }

  return configured;
}

// EMAIL.INFRA.1 — one-click unsubscribe for the `news` stream.
//
// Reached as https://www.titilinks.com/u/<token> through the vercel.json
// rewrite (and the dev-server proxy in vite.config.ts), which forwards to
// <functions>/email-unsubscribe/u/<token>.
//
//   POST /u/<token>   body `List-Unsubscribe=One-Click` (RFC 8058 — what Gmail
//                     and Yahoo send when the reader presses their own
//                     "Unsubscribe" button). Opts out and answers 200 inside
//                     the request; no redirect, no page, no confirmation step.
//   GET  /u/<token>   the footer link. Writes NOTHING — mail scanners prefetch
//                     links, so opting out on load would unsubscribe readers
//                     who never clicked. Returns a page in the browser's
//                     language with one confirm button that POSTs back here.
//   POST /u/<token>   body `confirm=1` (that button). Opts out and returns the
//                     "you're unsubscribed" page.
//
// An unknown or malformed token gets the SAME 200 as a real one: the endpoint
// never reveals whether a token exists. The token is a random uuid and is the
// only credential — there is no session and no JWT.
//
// Only marketing_opt_out is written. Transactional mail is not affected.
//
// Deploy (JWT verification MUST be off — mailbox providers send no Supabase JWT):
//   npx supabase functions deploy email-unsubscribe --no-verify-jwt --project-ref ohmvlypcbrfkuudcuqub

import { serviceClient } from "../_shared/auth.ts";
import { CONFIRM_FIELD, pickLang, unsubscribePage, UUID_RE } from "../_shared/email/unsubscribe-page.ts";

const HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};
const TEXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

/** True when the write succeeded (whether or not any row matched). */
async function optOut(token: string): Promise<boolean> {
  if (!UUID_RE.test(token)) return true; // nothing to look up; still a 200
  const { error } = await serviceClient()
    .from("email_prefs")
    .update({ marketing_opt_out: true, updated_at: new Date().toISOString() })
    .eq("unsubscribe_token", token.toLowerCase());
  if (error) {
    console.error("[email-unsubscribe] update failed:", error.message);
    return false;
  }
  return true;
}

/** True when the POST came from the confirm page's button, not a mailbox provider. */
async function isConfirmForm(req: Request): Promise<boolean> {
  try {
    return new URLSearchParams(await req.text()).has(CONFIRM_FIELD);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const match = /\/u\/([^/]+)\/?$/.exec(new URL(req.url).pathname);
  const token = match ? decodeURIComponent(match[1]) : "";
  const lang = pickLang(req.headers.get("accept-language"));
  const page = { ...HTML, "Content-Language": lang, Vary: "Accept-Language" };

  if (req.method === "POST") {
    const fromButton = await isConfirmForm(req);
    const ok = await optOut(token);
    if (fromButton) {
      return new Response(unsubscribePage(lang, "done", ok), { status: ok ? 200 : 500, headers: page });
    }
    // RFC 8058 one-click. A failed write is a 500 so the mailbox provider
    // retries; it is never reported as done when it was not.
    return new Response(ok ? "ok" : "error", { status: ok ? 200 : 500, headers: TEXT });
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(req.method === "HEAD" ? null : unsubscribePage(lang, "confirm"), {
      status: 200,
      headers: page,
    });
  }

  return new Response("Method not allowed", { status: 405, headers: { ...TEXT, Allow: "GET, POST" } });
});

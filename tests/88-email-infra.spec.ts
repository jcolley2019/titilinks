// EMAIL.INFRA.1 — the outbound-email doors, probed against the LIVE deployed
// edge functions and, for the /u/<token> route, through the dev server's proxy
// (vite.config.ts mirrors the vercel.json rewrite). Green only after Joey has
// run 20261104120000_email_infra1.sql and deployed:
//   npx supabase functions deploy send-email --project-ref ohmvlypcbrfkuudcuqub
//   npx supabase functions deploy email-unsubscribe --no-verify-jwt --project-ref ohmvlypcbrfkuudcuqub
// Before that every test here is a 404 (no such function).
//
// Doors, as the tests exercise them:
//   a. POST <functions>/email-unsubscribe/u/<random uuid>, body
//      `List-Unsubscribe=One-Click`, NO headers            → 200. The token is
//      unknown, and the answer is the same as for a real one — the endpoint
//      never says whether a token exists.
//   b. GET /u/<random uuid> on the dev server              → the CONFIRM page
//      (EMAIL.INFRA.1a): it does not opt out — mail scanners prefetch links —
//      and shows one button that POSTs `confirm=1` back to the same URL;
//      Spanish for `Accept-Language: es-MX`, English otherwise. That button
//      POST then answers with the "you're unsubscribed" page.
//   c. POST <functions>/send-email with the anon key but NO
//      x-email-cron-secret (and again with a wrong one)    → 401 from the
//      function's own gate.
//
// (c) sends `apikey` + `Authorization: Bearer <anon key>` on purpose: with no
// Authorization header the GATEWAY answers 401 UNAUTHORIZED_NO_AUTH_HEADER and
// the test would pass without the function ever running (the spec-58 trap). The
// body assertion `{ error: 'Unauthorized' }` is the function's own.
//
// No email can be sent from here. The only path to Resend is behind the secret
// gate (c) proves closed, and this spec never holds the secret. EMAIL_DRY_RUN=1
// is a secret on the deployed function (supabase/.env ships it set); a spec
// cannot set a deployed function's environment, so the assignment below records
// the requirement rather than enforcing it.
//
// Writes: none that match a row. (a) and (b)'s button POSTs run an UPDATE keyed
// on a freshly generated uuid, which matches nothing; (b)'s GETs write nothing. Pure HTTP through a Playwright
// APIRequestContext — no page, no session, nothing for the TL.ISO.2 write guard
// to rule on.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { test, expect } from './fixtures';

process.env.EMAIL_DRY_RUN = '1';

/**
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — the names the app reads
 * in src/integrations/supabase/client.ts. playwright.config.ts loads only
 * .env.test into process.env; the Vite vars live in .env. Same dependency-free
 * parser as specs 57–59 and 71, .env.test first so a test-only override wins.
 */
function viteEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;
  for (const file of ['.env.test', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error(`${name} not found in process.env, .env.test or .env`);
}

const functionsUrl = () => `${viteEnv('VITE_SUPABASE_URL')}/functions/v1`;

test.describe('EMAIL.INFRA.1 — email doors (LIVE functions; green only after deploy)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'live HTTP probe — one project only');
    test.setTimeout(60_000);
  });

  test('a. one-click POST for an unknown token is a 200 — existence never leaks', async ({ playwright }) => {
    const mailbox = await playwright.request.newContext();
    try {
      const res = await mailbox.post(`${functionsUrl()}/email-unsubscribe/u/${randomUUID()}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: 'List-Unsubscribe=One-Click',
      });
      expect(res.status(), 'RFC 8058 one-click POST').toBe(200);
      expect(await res.text()).toBe('ok');

      // A malformed token is indistinguishable from an unknown one.
      const junk = await mailbox.post(`${functionsUrl()}/email-unsubscribe/u/not-a-token`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: 'List-Unsubscribe=One-Click',
      });
      expect(junk.status(), 'malformed token').toBe(200);
      expect(await junk.text()).toBe('ok');
    } finally {
      await mailbox.dispose();
    }
  });

  test('b. GET /u/<token> does NOT opt out — it shows the confirm button; the button POST does', async ({ playwright, baseURL }) => {
    const reader = await playwright.request.newContext({ baseURL });
    try {
      const esToken = randomUUID();
      const es = await reader.get(`/u/${esToken}`, { headers: { 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8' } });
      expect(es.status(), 'GET /u/<token> (es)').toBe(200);
      const esHtml = await es.text();
      expect(esHtml).toContain('<html lang="es">');
      expect(esHtml, 'not the SPA shell').not.toContain('id="root"');
      // A prefetch must not unsubscribe: the GET page asks, it never reports done.
      expect(esHtml, 'GET does not opt out (es)').not.toContain('Suscripción cancelada');
      expect(esHtml).toContain('<form method="post">');
      expect(esHtml.match(/<button\b/g) ?? [], 'exactly one confirm button (es)').toHaveLength(1);
      expect(esHtml).toContain('<button type="submit">Cancelar suscripción</button>');

      const enToken = randomUUID();
      const en = await reader.get(`/u/${enToken}`, { headers: { 'Accept-Language': 'en-US,en;q=0.9' } });
      expect(en.status(), 'GET /u/<token> (en)').toBe(200);
      const enHtml = await en.text();
      expect(enHtml).toContain('<html lang="en">');
      expect(enHtml, 'GET does not opt out (en)').not.toContain("You're unsubscribed");
      expect(enHtml).toContain('<form method="post">');
      expect(enHtml.match(/<button\b/g) ?? [], 'exactly one confirm button (en)').toHaveLength(1);
      expect(enHtml).toContain('<button type="submit">Unsubscribe</button>');
      expect(enHtml).toContain('noindex');

      // The button: the form posts `confirm=1` to the same URL and gets the
      // "you're unsubscribed" state back (unknown token → the same 200).
      const done = await reader.post(`/u/${enToken}`, {
        headers: { 'Accept-Language': 'en-US,en;q=0.9', 'Content-Type': 'application/x-www-form-urlencoded' },
        data: 'confirm=1',
      });
      expect(done.status(), 'confirm-button POST').toBe(200);
      const doneHtml = await done.text();
      expect(doneHtml).toContain("You're unsubscribed");
      expect(doneHtml, 'the done state has no second button').not.toContain('<button');

      const hecho = await reader.post(`/u/${esToken}`, {
        headers: { 'Accept-Language': 'es-MX,es;q=0.9', 'Content-Type': 'application/x-www-form-urlencoded' },
        data: 'confirm=1',
      });
      expect(hecho.status(), 'confirm-button POST (es)').toBe(200);
      expect(await hecho.text()).toContain('Suscripción cancelada');
    } finally {
      await reader.dispose();
    }
  });

  test('c. send-email without the cron secret is a 401 from the function itself', async ({ playwright }) => {
    const anon = viteEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
    const stranger = await playwright.request.newContext({
      extraHTTPHeaders: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    });
    try {
      const none = await stranger.post(`${functionsUrl()}/send-email`, { data: { batch: 1 } });
      expect(none.status(), 'no x-email-cron-secret').toBe(401);
      expect(await none.json(), "the function's own gate, not the gateway's").toEqual({ error: 'Unauthorized' });

      const wrong = await stranger.post(`${functionsUrl()}/send-email`, {
        headers: { 'x-email-cron-secret': 'not-the-secret' },
        data: { batch: 1 },
      });
      expect(wrong.status(), 'wrong x-email-cron-secret').toBe(401);
      expect(await wrong.json()).toEqual({ error: 'Unauthorized' });
    } finally {
      await stranger.dispose();
    }
  });
});

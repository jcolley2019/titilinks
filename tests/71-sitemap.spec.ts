// TL.SEO.SITEMAP.1 — the dynamic sitemap, probed against the LIVE deployed
// `sitemap` edge function and the LIVE domain (not the dev server). Green
// only after Joey deploys the function
//   npx supabase functions deploy sitemap --project-ref ohmvlypcbrfkuudcuqub --no-verify-jwt
// and Vercel has deployed the vercel.json rewrite + the robots.txt line.
// Before that, test 1 is a 404 (no such function) and test 2 is the SPA's
// index.html served as /sitemap.xml — the gap this task closes.
//
// Doors, as the tests exercise them:
//   1. GET <SUPABASE_URL>/functions/v1/sitemap, NO headers   → 200 XML urlset
//   2. GET https://titilinks.com/sitemap.xml, NO headers      → the same
//      (proves the Vercel rewrite), and robots.txt names the sitemap
//
// Not auth-gated: crawlers send no apikey and no Authorization header, so the
// probes send none either. A 401 UNAUTHORIZED_NO_AUTH_HEADER here means the
// function was deployed WITHOUT --no-verify-jwt (config.toml records
// verify_jwt = false for exactly that reason).
//
// What the listing must never carry: /go/ hops (robots disallows them), /s/
// short links, dashboard or auth routes, and the joey2019pwtest harness
// accounts. No real creator handle is named here — the positive assertions
// are the four marketing pages only.
//
// Writes: none. Pure HTTP through a Playwright APIRequestContext — no page,
// no session, nothing for the TL.ISO.2 write guard to rule on.

import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures';

// The API-request types, derived from the fixture door rather than imported
// from the runner package directly (PW-ONE-DOOR).
type TestArgs = Parameters<Parameters<typeof test>[2]>[0];
type APIRequest = TestArgs['playwright']['request'];
type APIRequestContext = Awaited<ReturnType<APIRequest['newContext']>>;
type APIResponse = Awaited<ReturnType<APIRequestContext['get']>>;

const SITE = 'https://titilinks.com';

/**
 * VITE_SUPABASE_URL — the name the app reads in
 * src/integrations/supabase/client.ts. playwright.config.ts loads only
 * .env.test into process.env; the Vite vars live in .env. Same dependency-free
 * parser as specs 57–59, .env.test first so a test-only override wins.
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

/** A crawler's view: no apikey, no Authorization, no extra headers of any kind. */
const crawlerContext = (pw: APIRequest): Promise<APIRequestContext> => pw.newContext();

/** The first stretch of a body, for failure messages (an HTML fallback is long). */
const head = (text: string) => JSON.stringify(text.slice(0, 200));

/**
 * The sitemap contract, shared by the function URL and the domain rewrite.
 * `xmlContentType` is off only for the raw function URL (see test 1).
 */
async function expectSitemap(
  res: APIResponse,
  label: string,
  { xmlContentType = true }: { xmlContentType?: boolean } = {},
): Promise<void> {
  const text = await res.text();
  expect(res.status(), `${label} must be 200 — got ${res.status()} ${head(text)}`).toBe(200);
  if (xmlContentType) {
    expect(
      res.headers()['content-type'] ?? '',
      `${label} must be served as XML — got ${res.headers()['content-type']} ${head(text)}`,
    ).toMatch(/^application\/xml/);
  }

  expect(text, `${label} is a urlset`).toContain('<urlset');
  for (const loc of [`${SITE}/</loc>`, `${SITE}/templates</loc>`, '/terms</loc>', '/privacy</loc>']) {
    expect(text, `${label} lists the marketing page ${loc}`).toContain(loc);
  }
  for (const banned of ['/go/', '/s/', '/dashboard', '/login', 'joey2019pwtest']) {
    expect(text, `${label} must never list ${banned}`).not.toContain(banned);
  }

  const locs = [...text.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length, `${label} carries at least the four marketing pages`).toBeGreaterThanOrEqual(4);
  for (const loc of locs) {
    expect(loc.startsWith(`${SITE}/`), `${label} <loc> ${loc} is on ${SITE}/`).toBe(true);
  }
}

test.describe('TL.SEO.SITEMAP.1 — dynamic sitemap (live function + live domain)', () => {
  // Pure HTTP against production — the browser engine proves nothing extra.
  // Same reasoning as specs 54–59: run once, on desktop; mobile reports
  // skipped, by design.
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== 'desktop',
      'live sitemap probe — one project only, the browser engine proves nothing extra',
    );
    // An edge-function cold start plus a Vercel proxy hop.
    test.setTimeout(60_000);
  });

  test('1. the sitemap function answers a header-less GET with the XML urlset', async ({ playwright }) => {
    const crawler = await crawlerContext(playwright.request);
    try {
      const res = await crawler.get(`${viteEnv('VITE_SUPABASE_URL')}/functions/v1/sitemap`);
      // Supabase's gateway serves function GETs as text/plain (observed 2026-09-24; HEAD keeps application/xml) and crawlers never fetch this URL — test 2 owns the content type.
      await expectSitemap(res, 'functions/v1/sitemap', { xmlContentType: false });
    } finally {
      await crawler.dispose();
    }
  });

  test('2. titilinks.com/sitemap.xml is rewritten to it, and robots.txt names it', async ({ playwright }) => {
    const crawler = await crawlerContext(playwright.request);
    try {
      const res = await crawler.get(`${SITE}/sitemap.xml`);
      await expectSitemap(res, `${SITE}/sitemap.xml`);

      const robots = await crawler.get(`${SITE}/robots.txt`);
      const robotsText = await robots.text();
      expect(robots.status(), `robots.txt must be 200 — got ${robots.status()}`).toBe(200);
      expect(robotsText, 'robots.txt carries the Sitemap line').toContain(`Sitemap: ${SITE}/sitemap.xml`);
    } finally {
      await crawler.dispose();
    }
  });
});

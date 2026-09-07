// TL.EDGE.2 — AI tools are Pro-only, probed against the LIVE deployed
// functions (not the dev server): suggest-links and ai-enhance answer
// 403 { code: 'PLAN_REQUIRED' } to a free-plan caller, via
// public.plan_allows(plan, 'aiTools') (fail-closed in _shared/plan.ts).
//
// Background (AUDIT_rev6 #10 / §2.5): the AI functions checked auth and a
// daily quota but never the plan, while src/lib/entitlements.ts has always
// said the AI tools are Pro-only — the entitlement was UI-only. TL.EDGE.2
// adds the server gate, renames aiBio → aiTools, retires the three AI
// functions nothing called (generate-bio / suggest-onboarding-content /
// ai-crop), and Joey pasted the `when 'aiTools'` row into plan_allows.
//
// What this spec can and cannot prove. The battery account is PRO
// (TL.COMP.4), so the live functions can only demonstrate the OPEN side of
// the gate here: a Pro caller is never refused with 403. The CLOSED side —
// that a free caller IS refused — rests on two things this spec pins
// directly: the SQL truth (test 4: plan_allows('free','aiTools') is false,
// 'pro' is true, read in-page through the app's own client) and the code
// path in both functions (scripts/billing.test.mjs asserts the
// planAllows(svc, user.id, "aiTools") call and the PLAN_REQUIRED answer).
// There is no free account in the battery to make the 403 itself, on
// purpose: TL.ISO.1 pinned the battery to ONE account.
//
// Doors, as the tests exercise them:
//   1. suggest-links, battery (pro) session   → status !== 403 (200, or the
//      function's own 4xx/5xx for body shape / upstream — NOT under test)
//   2. ai-enhance, battery (pro) session, 1×1 PNG → status !== 403 (same)
//   3. both, anon key only                    → 401 (unchanged since EDGE.1's
//      auth pattern; the plan gate sits BEHIND the auth gate)
//   4. in-page sb.rpc('plan_allows', …): free → false, pro → true
//
// Tests 1 and 2 may spend one AI call each on the battery's daily quota
// (40 / 20) — the price of proving the gate is open. Test 2 sends the
// smallest valid PNG so the upstream GPU call is as cheap as it can be.
//
// The ANONYMOUS side is a Playwright APIRequestContext carrying exactly what
// supabase.functions.invoke sends when there is NO session: `apikey` plus
// `Authorization: Bearer <anon key>` (a bare apikey never reaches the
// function — the gateway answers 401 UNAUTHORIZED_NO_AUTH_HEADER, which would
// pass test 3 for the wrong reason). The signed-in side overrides that header
// with the battery's access token, taken from the app's own client in-page.
//
// Writes: none. plan_allows is an IMMUTABLE sql function; PostgREST invokes
// every rpc via POST, so the TL.ISO.2 write guard needs it declared — the
// declaration below is a read, not a waiver of anything.

import fs from 'fs';
import path from 'path';
import { test, expect, allowWrites, type Page } from './fixtures';
import { PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

// The API-request types, derived from the fixture door rather than imported
// from the runner package directly (PW-ONE-DOOR).
type TestArgs = Parameters<Parameters<typeof test>[2]>[0];
type APIRequest = TestArgs['playwright']['request'];
type APIRequestContext = Awaited<ReturnType<APIRequest['newContext']>>;

/** The smallest valid PNG (1×1, transparent) — a real image, a trivial upstream job. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — the names the app reads
 * in src/integrations/supabase/client.ts. playwright.config.ts loads only
 * .env.test into process.env; the Vite vars live in .env. Same dependency-free
 * parser as specs 57/58, .env.test first so a test-only override wins.
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

/** Run supabase-js inside the page using the app's own signed-in client. */
const sb = <T,>(page: Page, body: string, arg?: unknown): Promise<T> =>
  page.evaluate(
    async ({ body, a }) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = await import('/src/integrations/supabase/client.ts');
      return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
    },
    { body, a: arg ?? null },
  );

/** The signed-in user id, or null when the session is gone. */
const signedInId = (page: Page) => sb<string | null>(page, `
  const { data } = await sb.auth.getUser();
  return data?.user?.id ?? null;`);

/**
 * Guarantee a live battery session before the first read.
 *
 * Spec 39 signs the shared session out FOR REAL — tests/fixtures.ts names
 * auth/v1/logout as a standing write-guard exception for exactly that reason.
 * Same recovery as specs 54–58: log in again rather than bet on file order.
 */
async function ensureSession(page: Page): Promise<void> {
  await page.goto('/');
  if (await signedInId(page)) return;
  await loginAsTestUser(page);
  await page.goto('/');
  if (!(await signedInId(page))) {
    throw new Error('could not establish a battery session — check .env.test credentials');
  }
}

/** The battery's access token (the JWT supabase.functions.invoke forwards). */
const accessToken = (page: Page) => sb<{ userId: string | null; token: string | null }>(page, `
  const { data } = await sb.auth.getSession();
  return { userId: data?.session?.user?.id ?? null, token: data?.session?.access_token ?? null };`);

/** plan_allows(p_plan, p_feature) through the app's own client (authenticated has EXECUTE). */
const planAllows = (page: Page, plan: string, feature: string) =>
  sb<{ data: boolean | null; error: string | null }>(page, `
    const { data, error } = await sb.rpc('plan_allows', { p_plan: arg.plan, p_feature: arg.feature });
    return { data: data ?? null, error: error ? (error.code ?? 'no-code') + ' ' + (error.message ?? '') : null };`,
    { plan, feature });

/**
 * The anonymous public: what a visitor's browser sends with no session —
 * the publishable key as both `apikey` and the Bearer token. No user JWT.
 */
const anonContext = (pw: APIRequest): Promise<APIRequestContext> => {
  const anonKey = viteEnv('VITE_SUPABASE_PUBLISHABLE_KEY');
  return pw.newContext({
    baseURL: viteEnv('VITE_SUPABASE_URL'),
    extraHTTPHeaders: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
};

/** Decode the body as JSON when possible; otherwise the raw text (for the failure message). */
async function bodyOf(res: { text(): Promise<string> }): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

test.describe('TL.EDGE.2 — AI tools are Pro-only (live functions)', () => {
  // Pure HTTP against the deployed functions plus one read-only RPC — the
  // browser engine proves nothing extra. Same reasoning as specs 54–58: run
  // once, on desktop; mobile reports skipped, by design.
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'live edge-function probe — one project only, each open-side call spends AI quota',
    );
    // A real login (when spec 39 revoked the shared session), a live edge
    // function cold start and an upstream AI call do not fit the 30s default.
    test.setTimeout(150_000);
    await ensureSession(page);
  });

  test('1. suggest-links: the battery (pro) is not refused by the plan gate', async ({ page, playwright }) => {
    const { userId, token } = await accessToken(page);
    expect(userId, 'TL.ISO.1 — the session is the battery').toBe(PINNED_TEST_USER_ID);
    expect(token, 'the battery session carries an access token').toBeTruthy();

    const anon = await anonContext(playwright.request);
    try {
      const res = await anon.post('/functions/v1/suggest-links', {
        headers: { Authorization: `Bearer ${token}` },
        data: { prompt: 'a small coffee shop' },
      });
      const body = await bodyOf(res);
      // The gate is the only thing under test: a Pro caller must never see 403.
      // 200 is the happy path; a 429 (daily quota) or 5xx (AI gateway) is the
      // function's own business and still proves the gate opened.
      expect(res.status(), `pro caller must not be plan-refused — got ${res.status()} ${JSON.stringify(body)}`).not.toBe(403);
      expect((body as { code?: string } | null)?.code, 'no PLAN_REQUIRED for a Pro caller').not.toBe('PLAN_REQUIRED');
    } finally {
      await anon.dispose();
    }
  });

  test('2. ai-enhance: the battery (pro) is not refused by the plan gate', async ({ page, playwright }) => {
    const { userId, token } = await accessToken(page);
    expect(userId, 'TL.ISO.1 — the session is the battery').toBe(PINNED_TEST_USER_ID);
    expect(token, 'the battery session carries an access token').toBeTruthy();

    const anon = await anonContext(playwright.request);
    try {
      const res = await anon.post('/functions/v1/ai-enhance', {
        headers: { Authorization: `Bearer ${token}` },
        data: { base64: TINY_PNG_BASE64, mediaType: 'image/png' },
      });
      const body = await bodyOf(res);
      expect(res.status(), `pro caller must not be plan-refused — got ${res.status()} ${JSON.stringify(body)}`).not.toBe(403);
      expect((body as { code?: string } | null)?.code, 'no PLAN_REQUIRED for a Pro caller').not.toBe('PLAN_REQUIRED');
    } finally {
      await anon.dispose();
    }
  });

  test('3. both functions: the anon key alone is still refused (401) before any plan check', async ({ playwright }) => {
    const anon = await anonContext(playwright.request);
    try {
      const links = await anon.post('/functions/v1/suggest-links', { data: { prompt: 'a small coffee shop' } });
      const linksBody = await bodyOf(links);
      expect(links.status(), `anon suggest-links must be 401 — got ${links.status()} ${JSON.stringify(linksBody)}`).toBe(401);
      // The function's own refusal, not the gateway's UNAUTHORIZED_NO_AUTH_HEADER.
      expect(linksBody, 'refused by getAuthedUser in suggest-links itself').toEqual({ error: 'Unauthorized' });

      const enhance = await anon.post('/functions/v1/ai-enhance', {
        data: { base64: TINY_PNG_BASE64, mediaType: 'image/png' },
      });
      const enhanceBody = await bodyOf(enhance);
      expect(enhance.status(), `anon ai-enhance must be 401 — got ${enhance.status()} ${JSON.stringify(enhanceBody)}`).toBe(401);
      expect(enhanceBody, 'refused by getAuthedUser in ai-enhance itself').toEqual({ error: 'Unauthorized' });
    } finally {
      await anon.dispose();
    }
  });

  test('4. plan_allows: aiTools is false for free, true for pro (the SQL truth behind the gate)', async ({ page }) => {
    // Read-only: plan_allows is IMMUTABLE sql. Declared because PostgREST
    // invokes every rpc via POST and the TL.ISO.2 guard cannot tell.
    await allowWrites(page, ['rest/v1/rpc/plan_allows']);

    const free = await planAllows(page, 'free', 'aiTools');
    expect(free.error, 'authenticated has EXECUTE on plan_allows').toBeNull();
    expect(free.data, "plan_allows('free','aiTools') — the CLOSED side of the gate").toBe(false);

    const pro = await planAllows(page, 'pro', 'aiTools');
    expect(pro.error, 'authenticated has EXECUTE on plan_allows').toBeNull();
    expect(pro.data, "plan_allows('pro','aiTools') — the OPEN side of the gate").toBe(true);

    const business = await planAllows(page, 'business', 'aiTools');
    expect(business.error).toBeNull();
    expect(business.data, "plan_allows('business','aiTools')").toBe(true);

    // A null plan (legacy row) coalesces to free — the same default plan.ts
    // sends when the profile row has no plan.
    const nullPlan = await sb<boolean | null>(page, `
      const { data, error } = await sb.rpc('plan_allows', { p_plan: null, p_feature: 'aiTools' });
      if (error) throw new Error(error.code + ' ' + error.message);
      return data ?? null;`);
    expect(nullPlan, 'null plan coalesces to free → false').toBe(false);
  });
});

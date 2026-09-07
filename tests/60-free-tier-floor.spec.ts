// TL.HARNESS.FREE.1 — the FREE-tier floor, proven by a real free account.
//
// Why this spec exists. Every plan gate in the app has two sides, and until
// now the battery could only ever prove one of them. TL.ISO.1 pinned the
// battery to a single account and TL.COMP.4 comped that account to Pro
// forever, so specs 54/56/59 are all shaped the same way: "a Pro caller is
// NOT refused", plus a SQL-level reading of what a free caller would get.
// Spec 59 says so in its own header — "There is no free account in the
// battery to make the 403 itself, on purpose".
//
// TL.HARNESS.FREE.1 adds that account: joey2019pwtestfree, signed up through
// the app's own onboarding on 2026-09-07, plan 'free', comped_until null. It
// is a SECOND LOCKED DOOR, not a loosening of the first — tests/auth.setup.ts
// pins its id exactly the way it pins the battery's, and the session it mints
// (tests/.auth/free.json) is opened only by fixtures.withFreeUser(), which
// installs the same default-deny write guard. The guard invariant PW-ONE-DOOR
// refuses that key anywhere else.
//
// What the six tests pin:
//   1. identity — the free key really opens the free account, and prod still
//      says plan 'free' / comped_until null. If someone ever comps this
//      account, every other test here would go green for the wrong reason, so
//      this one fails first and loudly.
//   2. SQL truth — plan_allows('free','aiTools') is false, and current_plan()
//      (which reads auth.uid(), not an argument) answers 'free' for THIS
//      session. Spec 59 test 4 could only pass 'free' in as a literal.
//   3. suggest-links, live, with a real free JWT → 403 PLAN_REQUIRED.
//   4. ai-enhance, live, with a real free JWT and a real PNG → 403
//      PLAN_REQUIRED. Tests 3 and 4 are the CLOSED side spec 59 could not
//      reach; note the gate fires BEFORE either function parses its body, so
//      the bodies below are valid but never read.
//   5. the free tier is visible in the product — /dashboard renders the Free
//      plan pill (its popover is the upgrade pitch) and the gold Upgrade nav
//      item, which UPGRADE.1 appends for free plans ONLY.
//   6. the write floor, on real rows — a free JWT PATCHing its own
//      profiles.plan to 'pro' is refused by guard_billing_columns, and the
//      stored plan is still 'free' afterwards.
//
// WRITES. Exactly one is ever attempted (test 6) and it is designed to fail;
// nothing is left to restore, and the final state is asserted anyway. Reads
// through the app's client are POSTs when they are RPCs, so plan_allows and
// current_plan are declared to the write guard as reads. The live-function
// probes in tests 3/4 use a Playwright APIRequestContext, which carries no
// fixture routes — the same accepted shape as spec 59; both calls are refused
// with 403 before the function does anything at all.
//
// The free page must come out of this run byte-identical.

import fs from 'fs';
import path from 'path';
import { test, expect, allowWrites, withFreeUser, type Page } from './fixtures';
import { FREE_TEST_HANDLE, FREE_TEST_USER_ID, loginAsFreeUser } from './helpers/auth';

// The API-request types, derived from the fixture door rather than imported
// from the runner package directly (PW-ONE-DOOR).
type TestArgs = Parameters<Parameters<typeof test>[2]>[0];
type APIRequest = TestArgs['playwright']['request'];
type APIRequestContext = Awaited<ReturnType<APIRequest['newContext']>>;

/** The smallest valid PNG (1×1, transparent) — a real image the gate never reads. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** plpgsql `raise exception` — the guard_billing_columns trigger. */
const RAISE_EXCEPTION = 'P0001';
/** insufficient_privilege — the profiles UPDATE policy, if the trigger were gone. */
const RLS_VIOLATION = '42501';

/**
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — the names the app reads
 * in src/integrations/supabase/client.ts. playwright.config.ts loads only
 * .env.test into process.env; the Vite vars live in .env. Same dependency-free
 * parser as specs 57/58/59, .env.test first so a test-only override wins.
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
 * Guarantee a live FREE session on this page, then assert it is the right one.
 *
 * tests/.auth/free.json is minted fresh by the setup project, but a session
 * can still be stale by the time a long run reaches this file — supabase-js
 * refreshes on its own (auth/v1/token is a standing write-guard exception),
 * and if even that fails we log in again rather than report a confusing null.
 */
async function ensureFreeSession(page: Page): Promise<void> {
  await page.goto('/');
  let id = await signedInId(page);
  if (!id) {
    await loginAsFreeUser(page);
    await page.goto('/');
    id = await signedInId(page);
  }
  if (!id) {
    throw new Error(
      'could not establish a FREE session — check TEST_FREE_USER_* in .env.test ' +
        'and re-run the setup project.',
    );
  }
  // Belt and braces over auth.setup.ts's pin: whatever happens above, this
  // spec only ever speaks to the free account.
  expect(id, 'TL.HARNESS.FREE.1 — this spec only ever touches the free account').toBe(
    FREE_TEST_USER_ID,
  );
}

interface FreeProfile {
  userId: string;
  plan: string | null;
  compedUntil: string | null;
  handle: string | null;
}

/** Own profile + own page handle, both .eq-scoped to the pinned free id. */
const readFreeProfile = (page: Page) => sb<FreeProfile>(page, `
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user?.id) throw new Error('no signed-in user — the free storageState carried no session');
  const { data, error } = await sb.from('profiles')
    .select('plan, comped_until')
    .eq('id', arg.id)
    .single();
  if (error) throw new Error('profile read failed: ' + error.code + ' ' + error.message);
  const { data: pg, error: pgErr } = await sb.from('pages')
    .select('handle')
    .eq('user_id', arg.id)
    .limit(1);
  if (pgErr) throw new Error('pages read failed: ' + pgErr.code + ' ' + pgErr.message);
  return {
    userId: auth.user.id,
    plan: data?.plan ?? null,
    compedUntil: data?.comped_until ?? null,
    handle: pg?.[0]?.handle ?? null,
  };`,
  { id: FREE_TEST_USER_ID });

/** The free session's access token — the JWT supabase.functions.invoke forwards. */
const accessToken = (page: Page) => sb<{ userId: string | null; token: string | null }>(page, `
  const { data } = await sb.auth.getSession();
  return { userId: data?.session?.user?.id ?? null, token: data?.session?.access_token ?? null };`);

/**
 * The anonymous public: what a visitor's browser sends with no session — the
 * publishable key as both `apikey` and the Bearer token. Tests 3/4 then
 * override Authorization with the FREE user's JWT; the apikey header stays,
 * because without it the gateway never routes the call to the function.
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

test.describe('TL.HARNESS.FREE.1 — the free-tier floor', () => {
  // Live edge functions, PostgREST/RLS truth and one dashboard render. The
  // free account is opened per-test by withFreeUser(), which builds its own
  // context — the project's storageState (the PRO battery) is never used
  // here, so running this on both projects would only re-probe the same live
  // functions twice. Same reasoning as specs 54–59: desktop only; mobile
  // reports skipped, by design.
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== 'desktop',
      'free-tier floor — one project only; tests 3/4 hit the LIVE deployed functions',
    );
    // A real login (if the saved session lapsed) plus two live edge-function
    // cold starts do not fit the 30s default.
    test.setTimeout(150_000);
  });

  test('1. identity: the free key opens the free account, and prod still says free', async ({ browser }) => {
    await withFreeUser(browser, async (page) => {
      await ensureFreeSession(page);

      const p = await readFreeProfile(page);
      expect(p.userId, 'the session the free key opened').toBe(FREE_TEST_USER_ID);
      expect(p.plan, 'the free account is on plan free — never comp it (TL.HARNESS.FREE.1)').toBe('free');
      expect(
        p.compedUntil,
        'comped_until is null — a comp here would silently turn tests 2-6 green for the wrong reason',
      ).toBeNull();
      expect(p.handle, 'the one page onboarding built for this account').toBe(FREE_TEST_HANDLE);
    });
  });

  test('2. SQL truth: plan_allows(aiTools) is false and current_plan() answers free for THIS session', async ({ browser }) => {
    await withFreeUser(browser, async (page) => {
      await ensureFreeSession(page);
      // Read-only: plan_allows is IMMUTABLE sql, current_plan is STABLE.
      // Declared because PostgREST invokes every rpc via POST and the
      // TL.ISO.2 guard cannot tell a read RPC from a write one.
      await allowWrites(page, ['rest/v1/rpc/plan_allows', 'rest/v1/rpc/current_plan']);

      const gate = await sb<{ data: boolean | null; error: string | null }>(page, `
        const { data, error } = await sb.rpc('plan_allows', { p_plan: 'free', p_feature: 'aiTools' });
        return { data: data ?? null, error: error ? (error.code ?? 'no-code') + ' ' + (error.message ?? '') : null };`);
      expect(gate.error, 'authenticated has EXECUTE on plan_allows').toBeNull();
      expect(gate.data, "plan_allows('free','aiTools') — the CLOSED side of the AI gate").toBe(false);

      // current_plan() takes no argument: it reads auth.uid(). This is the
      // assertion spec 59 could not make — the server's own answer about the
      // caller, not a literal the test chose.
      const plan = await sb<{ data: string | null; error: string | null }>(page, `
        const { data, error } = await sb.rpc('current_plan');
        return { data: data ?? null, error: error ? (error.code ?? 'no-code') + ' ' + (error.message ?? '') : null };`);
      expect(plan.error, 'authenticated has EXECUTE on current_plan').toBeNull();
      expect(plan.data, 'current_plan() for the free session').toBe('free');
    });
  });

  test('3. suggest-links: a real free caller is refused 403 PLAN_REQUIRED (live)', async ({ browser, playwright }) => {
    await withFreeUser(browser, async (page) => {
      await ensureFreeSession(page);
      const { userId, token } = await accessToken(page);
      expect(userId, 'the JWT below belongs to the free account').toBe(FREE_TEST_USER_ID);
      expect(token, 'the free session carries an access token').toBeTruthy();

      const anon = await anonContext(playwright.request);
      try {
        const res = await anon.post('/functions/v1/suggest-links', {
          headers: { Authorization: `Bearer ${token}` },
          // Valid, and never parsed: the plan gate returns before req.json().
          data: { prompt: 'a small coffee shop' },
        });
        const body = await bodyOf(res);
        expect(
          res.status(),
          `a free caller must be plan-refused — got ${res.status()} ${JSON.stringify(body)}`,
        ).toBe(403);
        expect((body as { code?: string } | null)?.code, 'the plan gate, not the auth or quota gate').toBe(
          'PLAN_REQUIRED',
        );
      } finally {
        await anon.dispose();
      }
    });
  });

  test('4. ai-enhance: a real free caller is refused 403 PLAN_REQUIRED (live)', async ({ browser, playwright }) => {
    await withFreeUser(browser, async (page) => {
      await ensureFreeSession(page);
      const { userId, token } = await accessToken(page);
      expect(userId, 'the JWT below belongs to the free account').toBe(FREE_TEST_USER_ID);
      expect(token, 'the free session carries an access token').toBeTruthy();

      const anon = await anonContext(playwright.request);
      try {
        const res = await anon.post('/functions/v1/ai-enhance', {
          headers: { Authorization: `Bearer ${token}` },
          data: { base64: TINY_PNG_BASE64, mediaType: 'image/png' },
        });
        const body = await bodyOf(res);
        expect(
          res.status(),
          `a free caller must be plan-refused — got ${res.status()} ${JSON.stringify(body)}`,
        ).toBe(403);
        expect((body as { code?: string } | null)?.code, 'the plan gate, not the auth or quota gate').toBe(
          'PLAN_REQUIRED',
        );
        // Refused before the GPU is ever asked: no enhanced image comes back.
        expect((body as { image?: unknown } | null)?.image, 'no work was done').toBeUndefined();
      } finally {
        await anon.dispose();
      }
    });
  });

  test('5. the dashboard shows the free tier: the Free pill and the Upgrade nav item', async ({ browser }) => {
    await withFreeUser(browser, async (page) => {
      await ensureFreeSession(page);
      await page.goto('/dashboard');
      // ProtectedRoute would bounce an un-onboarded account to /onboarding;
      // this account completed the real flow, so it must stay on /dashboard.
      await expect(page).toHaveURL(/\/dashboard$/);

      // The desktop sidebar. The mobile header is in the DOM too (lg:hidden),
      // so everything below is scoped to the aside to keep the match single.
      const sidebar = page.locator('aside').first();

      // The plan pill. On a free plan it is a Popover TRIGGER (Pro/Business
      // render a plain Badge), which is what makes aria-haspopup the stable
      // hook — and the popover it opens is the proof it is the plan badge and
      // not some other "Free" string on the page.
      const planPill = sidebar.locator('[aria-haspopup="dialog"]').filter({ hasText: /^Free$/ });
      await expect(planPill, 'exactly one Free plan pill in the sidebar').toHaveCount(1);
      await expect(planPill).toBeVisible();

      await planPill.click();
      const viewPlans = page.getByTestId('plan-badge-view-plans');
      await expect(viewPlans, 'the pill opens the upgrade pitch').toBeVisible();
      await expect(viewPlans).toHaveAttribute('href', '/dashboard/upgrade');
      await page.keyboard.press('Escape');

      // UPGRADE.1 appends this nav row for FREE plans only — on the battery
      // (Pro) it does not exist at all. Its presence here is the free tier
      // showing up in the product, not just in the database.
      const upgradeNav = sidebar.getByTestId('nav-upgrade');
      await expect(upgradeNav, 'the gold Upgrade row (free plans only)').toBeVisible();
      await expect(upgradeNav).toHaveAttribute('href', '/dashboard/upgrade');
    });
  });

  test('6. write floor: a free JWT cannot upgrade its own plan', async ({ browser }) => {
    await withFreeUser(browser, async (page) => {
      await ensureFreeSession(page);
      // The PATCH below is attempted for real and must be REFUSED. Declared
      // so the refusal comes from the server (the thing under test) rather
      // than from the fixture's deny layer, which would prove nothing.
      // Nothing to restore: a refused UPDATE changes no row.
      await allowWrites(page, ['rest/v1/profiles']);

      const before = await readFreeProfile(page);
      expect(before.plan, 'precondition: still on the free plan').toBe('free');

      const err = await sb<{ code: string; message: string } | null>(page, `
        const { error } = await sb.from('profiles')
          .update({ plan: 'pro' })
          .eq('id', arg.id);
        return error ? { code: error.code ?? 'no-code', message: error.message ?? '' } : null;`,
        { id: FREE_TEST_USER_ID });

      expect(err, 'self-service upgrade must be refused by the server').not.toBeNull();
      // guard_billing_columns fires BEFORE the policy's WITH CHECK, so P0001
      // is the expected code. 42501 is accepted too — dropping the trigger
      // alone must not turn this green for the wrong reason.
      expect(
        [RAISE_EXCEPTION, RLS_VIOLATION],
        `unexpected error: ${err?.code} ${err?.message}`,
      ).toContain(err?.code);

      const after = await readFreeProfile(page);
      expect(after.plan, 'the stored plan is untouched').toBe('free');
      expect(after.compedUntil, 'and no comp appeared either').toBeNull();
    });
  });
});

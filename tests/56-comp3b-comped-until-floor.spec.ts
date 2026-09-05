// TL.COMP.3b — the comped_until SERVER floor, proven against the battery's own
// profile row.
//
// Background: TL.COMP.1 added `profiles.comped_until`, the column that says an
// account holds a hand-granted Pro comp. The two client-write locks on
// `profiles` — the UPDATE policy's WITH CHECK (record #39, six pins) and the
// `guard_billing_columns` BEFORE UPDATE trigger (#29, four columns) — pinned
// only the Stripe columns, so a JWT bearer could PATCH its own comped_until
// through PostgREST and the reconciler (TL.COMP.3) would honour it
// (AUDIT_rev6 #11). Joey applied TL.COMP.3b on 2026-09-05 (mirrored as
// migration #44): comped_until is now the 7th policy pin and the 5th trigger
// column. Only postgres (admin_grant_comp / admin_revoke_comp) and the service
// role can change it.
//
// This spec is the regression alarm. The battery account is comped to
// 'infinity' (TL.COMP.4, migration #42), so:
//   1. precondition — comped_until is 'infinity' and plan is 'pro'. If the
//      battery ever loses its comp, this fails loudly here, not in test 2.
//   2. refused — a PATCH to a different comped_until errors. The trigger fires
//      BEFORE the policy check, so the expected code is P0001 (raise
//      exception) with 'comped_until' in the message; 42501 (the policy) is
//      accepted too, so dropping the trigger alone does not turn this green
//      for the wrong reason. The value is then re-read and is unchanged.
//   3. control — a same-value PATCH ('infinity' → 'infinity') succeeds. The
//      pin blocks CHANGES, not writes; a client PATCH that carries the column
//      unchanged (as a naive full-row save would) still lands.
//
// Nothing changes. No cleanup is needed, but the final state is asserted
// anyway. Every read and write is .eq-scoped to PINNED_TEST_USER_ID; no
// column other than comped_until is ever written.

import { test, expect, allowWrites, type Page } from './fixtures';
import { PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

/** What TL.COMP.4 granted the battery. PostgREST renders the timestamptz as this string. */
const COMP_INFINITY = 'infinity';
/** A different, still-valid comped_until. Never lands. */
const ATTEMPTED_UNTIL = '2099-01-01T00:00:00Z';
/** plpgsql `raise exception` — the guard_billing_columns trigger. */
const RAISE_EXCEPTION = 'P0001';
/** insufficient_privilege — the UPDATE policy's WITH CHECK, if the trigger were gone. */
const RLS_VIOLATION = '42501';

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

interface Profile {
  userId: string;
  plan: string | null;
  compedUntil: string | null;
}

/** The signed-in user id, or null when the session is gone. */
const signedInId = (page: Page) => sb<string | null>(page, `
  const { data } = await sb.auth.getUser();
  return data?.user?.id ?? null;`);

/**
 * Guarantee a live battery session before the first read.
 *
 * Spec 39 signs the shared session out FOR REAL — tests/fixtures.ts names
 * auth/v1/logout as a standing write-guard exception for exactly that reason.
 * Same recovery as specs 54/55: log in again rather than bet on file order.
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

/** Own profile: plan + comped_until, scoped to the pinned battery id. */
const readProfile = (page: Page) => sb<Profile>(page, `
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user?.id) throw new Error('no signed-in user — storageState did not carry a session');
  const { data, error } = await sb.from('profiles')
    .select('plan, comped_until')
    .eq('id', arg.id)
    .single();
  if (error) throw new Error('profile read failed: ' + error.code + ' ' + error.message);
  return { userId: auth.user.id, plan: data?.plan ?? null, compedUntil: data?.comped_until ?? null };`,
  { id: PINNED_TEST_USER_ID });

/** One PATCH of comped_until on the pinned row. Resolves to the PostgREST error, or null. */
const patchCompedUntil = (page: Page, value: string) =>
  sb<{ code: string; message: string } | null>(page, `
    const { error } = await sb.from('profiles')
      .update({ comped_until: arg.value })
      .eq('id', arg.id);
    return error ? { code: error.code ?? 'no-code', message: error.message ?? '' } : null;`,
    { id: PINNED_TEST_USER_ID, value });

/** Precondition shared by every test: we are the battery and it is comped forever. */
async function assertComped(page: Page, label: string): Promise<Profile> {
  const p = await readProfile(page);
  expect(p.userId, 'TL.ISO.1 — this spec only ever touches the battery account').toBe(
    PINNED_TEST_USER_ID,
  );
  expect(p.plan, `${label}: the battery is comped to pro (TL.COMP.4)`).toBe('pro');
  expect(p.compedUntil, `${label}: the battery comp is 'infinity' (TL.COMP.4)`).toBe(COMP_INFINITY);
  return p;
}

test.describe('TL.COMP.3b — comped_until server floor', () => {
  // Real PATCHes against the one shared battery row, and the assertions are
  // pure PostgREST/RLS with no DOM in them — the browser engine proves nothing
  // extra. Same reasoning as specs 54/55: run once, on desktop; mobile reports
  // skipped, by design.
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'real-row policy/trigger test — one project only, the battery profile row is shared',
    );
    // A real login (when spec 39 revoked the shared session) plus Postgres
    // round-trips does not fit the 30s default.
    test.setTimeout(120_000);
    await ensureSession(page);
  });

  test("precondition: the battery is 'pro' and comped to 'infinity'", async ({ page }) => {
    await assertComped(page, 'precondition');
  });

  test('a PATCH that changes comped_until is refused and the value is unchanged', async ({ page }) => {
    await allowWrites(page, ['rest/v1/profiles']);
    await assertComped(page, 'before');

    const err = await patchCompedUntil(page, ATTEMPTED_UNTIL);
    expect(err, 'the client PATCH of comped_until must error').not.toBeNull();
    expect(
      [RAISE_EXCEPTION, RLS_VIOLATION],
      `refused by the guard_billing_columns trigger (${RAISE_EXCEPTION}) or, failing that, ` +
        `the UPDATE policy WITH CHECK (${RLS_VIOLATION}); got ${err!.code}: ${err!.message}`,
    ).toContain(err!.code);
    if (err!.code === RAISE_EXCEPTION) {
      expect(err!.message, 'the trigger names the column it refused').toContain('comped_until');
    }

    const after = await assertComped(page, 'after the refused PATCH');
    expect(after.compedUntil, 'comped_until did not move').toBe(COMP_INFINITY);
  });

  test("control: a same-value PATCH ('infinity' → 'infinity') is allowed", async ({ page }) => {
    await allowWrites(page, ['rest/v1/profiles']);
    await assertComped(page, 'before');

    const err = await patchCompedUntil(page, COMP_INFINITY);
    expect(
      err,
      `a no-op write of the pinned column must succeed — the pin blocks changes, not writes` +
        (err ? ` (got ${err.code}: ${err.message})` : ''),
    ).toBeNull();

    const after = await assertComped(page, 'after the same-value PATCH');
    expect(after.compedUntil, "still 'infinity'").toBe(COMP_INFINITY);
  });
});

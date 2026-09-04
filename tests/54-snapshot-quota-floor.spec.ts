// TL.ENT.SNAP.1b — the maxSnapshots SERVER floor, proven against real rows.
//
// Background: prod carried TWO permissive INSERT policies on profile_snapshots.
// Permissive policies are OR'd, so the hand-made `snapshots_insert_own` (bare
// ownership) admitted rows the ENT.SRV quota policy rejected — the server-side
// ceiling was a no-op and only the client check in src/lib/snapshots.ts stood
// between a user and unlimited manual snapshots (AUDIT_rev6 #2, §1.3.9). Joey
// dropped the stray policy on 2026-09-03 (migration #41). This spec is the
// regression alarm: if it is ever re-created, the 6th insert below succeeds and
// this test goes red.
//
// NOT in spec 17: that file's header contract is "profile_snapshots is fully
// mocked ... non-destructive by construction", and every test there installs an
// in-memory store via installSnapshotMocks(). This test must let the POST reach
// Postgres — the whole point is the RLS verdict — so it would falsify that
// file's stated contract for anyone reading it. It lives here instead, beside
// the other opt-in write specs (45/53), with its own sweep contract.
//
// Writes REAL rows on the battery account and deletes them by id, pre-flight
// and in a finally. Every read and write is .eq-scoped to the battery's own
// user_id and page_id.

import { test, expect, allowWrites, type Page } from './fixtures';
import { TEST_HANDLE, PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

const MARK = 'SNAP1B-';
/** The battery account's plan ceiling (entitlements maxSnapshots for pro). */
const LIMIT = 5;

/** Run supabase-js inside the page using the app's own signed-in client. */
const sb = <T,>(page: Page, body: string, arg?: unknown): Promise<T> =>
  page.evaluate(
    async ({ body, a }) => {
      const m = await import('/src/integrations/supabase/client.ts');
      return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
    },
    { body, a: arg ?? null },
  );

interface Target {
  userId: string;
  pageId: string;
  plan: string;
}

/** The signed-in user id, or null when the session is gone. */
const signedInId = (page: Page) => sb<string | null>(page, `
  const { data } = await sb.auth.getUser();
  return data?.user?.id ?? null;`);

/**
 * Guarantee a live battery session before the first write.
 *
 * Spec 39 signs the shared session out FOR REAL — tests/fixtures.ts names
 * auth/v1/logout as a standing write-guard exception for exactly that reason.
 * The saved storageState survives on disk, but its refresh token does not, so
 * any spec scheduled after 39 in the same battery starts unauthenticated. Every
 * other spec either mocks its data or reads world-readable rows and never
 * notices; this one authenticates for real, so it is the only one that breaks.
 * Recover by logging in again rather than betting on file order — file order is
 * not something a spec gets to control.
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

/** Who we are and which page we are writing to — handle-scoped, no wildcards. */
const target = (page: Page) => sb<Target>(page, `
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user?.id) throw new Error('no signed-in user — storageState did not carry a session');
  const { data: pg } = await sb.from('pages').select('id').eq('handle', arg.handle).single();
  if (!pg?.id) throw new Error('battery account has no page for handle ' + arg.handle);
  const { data: prof } = await sb.from('profiles').select('plan').eq('id', auth.user.id).single();
  return { userId: auth.user.id, pageId: pg.id, plan: prof?.plan ?? 'unknown' };`,
  { handle: TEST_HANDLE });

/** Delete every SNAP1B-* row by id. Returns how many it removed. */
const sweep = (page: Page, t: Target) => sb<number>(page, `
  const { data } = await sb.from('profile_snapshots')
    .select('id')
    .eq('user_id', arg.userId)
    .eq('page_id', arg.pageId)
    .like('name', arg.mark + '%');
  for (const r of (data || [])) await sb.from('profile_snapshots').delete().eq('id', r.id);
  return (data || []).length;`, { ...t, mark: MARK });

/** Manual snapshots on the target page — the number the quota policy counts. */
const manualCount = (page: Page, t: Target) => sb<number>(page, `
  const { count } = await sb.from('profile_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', arg.userId)
    .eq('page_id', arg.pageId)
    .eq('kind', 'manual');
  return count ?? 0;`, t);

/** One insert. Resolves to the PostgREST error code, or null on success. */
const insert = (page: Page, t: Target, name: string, kind: 'manual' | 'auto') =>
  sb<string | null>(page, `
    const { error } = await sb.from('profile_snapshots').insert({
      user_id: arg.userId,
      page_id: arg.pageId,
      name: arg.name,
      kind: arg.kind,
      payload: { v: 1, marker: 'snap1b', theme_json: {}, modes: [] },
    });
    return error ? (error.code ?? 'no-code') : null;`,
    { ...t, name, kind });

test.describe('TL.ENT.SNAP.1b — maxSnapshots server floor', () => {
  // Real rows on a shared account, and the quota is counted per (user_id,
  // page_id) across the WHOLE table — so two projects running this file at once
  // would count each other's rows and the arithmetic below would be nonsense.
  // The assertions are pure PostgREST/RLS with no DOM in them, so the browser
  // engine proves nothing extra: run it once, on desktop. The spec still runs
  // on both projects; mobile reports this as skipped, by design.
  test('five manual snapshots fit, the sixth is refused by RLS, an auto one is exempt', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'real-row quota test — one project only, the row budget is global',
    );
    // A real login (when spec 39 revoked the shared session) plus ~10 Postgres
    // round-trips does not fit the 30s default.
    test.setTimeout(120_000);
    await allowWrites(page, ['rest/v1/profile_snapshots']);
    await ensureSession(page);

    const t = await target(page);

    // Preconditions, asserted rather than assumed — a plan change or leftover
    // manual snapshots would otherwise fail this test with a confusing count.
    expect(t.userId, 'TL.ISO.1 — real rows may only be written to the battery account').toBe(
      PINNED_TEST_USER_ID,
    );
    expect(t.plan, 'battery account plan (the quota is pro = 5)').toBe('pro');
    await sweep(page, t); // pre-flight: clear residue from an interrupted run
    expect(
      await manualCount(page, t),
      'the target page must start with zero manual snapshots for the count arithmetic to hold',
    ).toBe(0);

    try {
      // 1..LIMIT — every one of these is under the ceiling and must land.
      for (let i = 1; i <= LIMIT; i++) {
        expect(
          await insert(page, t, `${MARK}${i}`, 'manual'),
          `manual snapshot ${i} of ${LIMIT} is under the quota and must be accepted`,
        ).toBeNull();
      }
      expect(await manualCount(page, t), 'all five landed').toBe(LIMIT);

      // LIMIT + 1 — the row the quota policy rejects. Before the stray policy
      // was dropped this returned null (accepted) and the floor was a no-op.
      expect(
        await insert(page, t, `${MARK}${LIMIT + 1}`, 'manual'),
        'the sixth manual snapshot must be refused by RLS (42501), not accepted',
      ).toBe('42501');
      expect(await manualCount(page, t), 'the refused row was not written').toBe(LIMIT);

      // The exemption: the surviving policy admits kind <> 'manual' on
      // ownership alone, so the auto safety-net still fires at the ceiling.
      expect(
        await insert(page, t, `${MARK}auto`, 'auto'),
        'an auto snapshot is exempt from the quota and must be accepted even at the ceiling',
      ).toBeNull();
      expect(await manualCount(page, t), 'the auto row is not counted as manual').toBe(LIMIT);
    } finally {
      // Residue must never leak into another spec, on any exit path.
      await sweep(page, t);
    }

    expect(await manualCount(page, t), 'every SNAP1B- row was swept').toBe(0);
    expect(await sweep(page, t), 'nothing named SNAP1B- remains').toBe(0);
  });
});

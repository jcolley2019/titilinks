// TL.HANDLE.1 — the handle format + reserved-word SERVER floor, proven against
// real rows.
//
// Background: `pages.handle` carried a UNIQUE index but no CHECK (AUDIT_rev6
// #5), so the server accepted any string a client sent — including words that
// shadow real routes ('settings', 'templates') or read as official ('admin',
// 'support', 'titilinks'). Handle entry checked uniqueness only. The client
// half now calls validateHandle() before every write (src/lib/handle-rules.ts,
// unit-tested in scripts/handle-rules.test.mjs), but a client check is a
// courtesy — this spec proves the floor holds against a crafted request that
// never touches the UI.
//
// Joey applied `pages_handle_rules` / `profiles_username_rules` on 2026-09-04
// (handle1.sql; mirrored as migration #43). If either is ever dropped, the
// first insert below returns 201 instead of 23514 and this test goes red.
//
// Writes ONE real page row on the battery account and deletes it by id, both
// pre-flight and in a finally. The battery's own page is never written to, and
// its handle is asserted untouched at the end. Every read and write is scoped
// to the battery's own user_id, and the sweep matches on the marked handle
// only — never on user_id alone.
//
// maxPages headroom (checked 2026-09-04): the battery is `pro`, plan_limit
// maxPages = 2, and it owns 1 page. So the ENT.PAGES.1 quota policy admits the
// second page this spec creates, and the brief's UPDATE fallback is not needed
// — the INSERT path is the honest test of an INSERT-time CHECK. The spec still
// asserts that headroom rather than assuming it: if the battery ever grows a
// second page, the precondition fails loudly instead of the 23514 assertion
// passing for the wrong reason (42501 from the quota, not 23514 from the CHECK).

import { test, expect, allowWrites, type Page } from './fixtures';
import { TEST_HANDLE, PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

/** Every handle this spec creates starts here, so the sweep can never over-match. */
const MARK = 'zz-battery-';
/** The legal handle — 13 chars, no edge hyphen, not reserved. */
const OK_HANDLE = 'zz-battery-ok';
/** The reserved word. Also route-shadowing, which is why it is on the list. */
const RESERVED_HANDLE = 'admin';
/** Postgres check_violation. PostgREST surfaces it as HTTP 400 + this code. */
const CHECK_VIOLATION = '23514';

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

interface Target {
  userId: string;
  plan: string;
  ownPageId: string;
  ownHandle: string;
  pageCount: number;
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
 * any spec scheduled after 39 in the same battery starts unauthenticated. Same
 * recovery as spec 54: log in again rather than bet on file order.
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

/** Who we are, what we already own, and how much maxPages headroom is left. */
const target = (page: Page) => sb<Target>(page, `
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user?.id) throw new Error('no signed-in user — storageState did not carry a session');
  const { data: own } = await sb.from('pages').select('id, handle').eq('handle', arg.handle).single();
  if (!own?.id) throw new Error('battery account has no page for handle ' + arg.handle);
  const { data: prof } = await sb.from('profiles').select('plan').eq('id', auth.user.id).single();
  const { count } = await sb.from('pages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id);
  return {
    userId: auth.user.id,
    plan: prof?.plan ?? 'unknown',
    ownPageId: own.id,
    ownHandle: own.handle,
    pageCount: count ?? 0,
  };`, { handle: TEST_HANDLE });

/** Delete every zz-battery-* page by id. Returns how many it removed. */
const sweep = (page: Page, t: Target) => sb<number>(page, `
  const { data } = await sb.from('pages')
    .select('id')
    .eq('user_id', arg.userId)
    .like('handle', arg.mark + '%');
  for (const r of (data || [])) await sb.from('pages').delete().eq('id', r.id);
  return (data || []).length;`, { ...t, mark: MARK });

/**
 * One page insert. Resolves to { code, id } — the PostgREST error code, or the
 * new row's id on success. Only user_id and handle are NOT NULL on `pages`.
 */
const insertPage = (page: Page, t: Target, handle: string) =>
  sb<{ code: string | null; id: string | null }>(page, `
    const { data, error } = await sb.from('pages')
      .insert({ user_id: arg.userId, handle: arg.handle, display_name: 'HANDLE.1 fixture' })
      .select('id')
      .maybeSingle();
    return { code: error ? (error.code ?? 'no-code') : null, id: data?.id ?? null };`,
    { ...t, handle });

/** Does a page with this handle exist at all? Uses the public read policy. */
const handleExists = (page: Page, handle: string) => sb<boolean>(page, `
  const { data } = await sb.from('pages').select('id').eq('handle', arg.h).maybeSingle();
  return !!data?.id;`, { h: handle });

test.describe('TL.HANDLE.1 — handle format + reserved-word server floor', () => {
  // Real rows on a shared account, and `pages.handle` is globally UNIQUE — two
  // projects running this file at once would collide on 'zz-battery-ok' and the
  // second would fail with 23505 for reasons that have nothing to do with the
  // CHECK. The assertions are pure PostgREST/RLS with no DOM in them, so the
  // browser engine proves nothing extra: run it once, on desktop. Same
  // reasoning as spec 54. The spec still runs on both projects; mobile reports
  // this as skipped, by design.
  test('a reserved handle is refused by the CHECK (23514) and a legal one is accepted', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'real-row constraint test — one project only, pages.handle is globally unique',
    );
    // A real login (when spec 39 revoked the shared session) plus a handful of
    // Postgres round-trips does not fit the 30s default.
    test.setTimeout(120_000);
    await allowWrites(page, ['rest/v1/pages']);
    await ensureSession(page);

    const t = await target(page);

    // Preconditions, asserted rather than assumed.
    expect(t.userId, 'TL.ISO.1 — real rows may only be written to the battery account').toBe(
      PINNED_TEST_USER_ID,
    );
    expect(t.ownHandle, 'the battery page this spec must never touch').toBe(TEST_HANDLE);
    expect(t.plan, 'battery account plan (maxPages is pro = 2)').toBe('pro');
    await sweep(page, t); // pre-flight: clear residue from an interrupted run
    expect(
      t.pageCount,
      'the battery must own exactly ONE page, or the maxPages quota — not the CHECK — ' +
        'is what refuses the insert below and the 23514 assertion proves nothing',
    ).toBe(1);

    try {
      // 1. The reserved word. This is the AUDIT_rev6 #5 defect: before
      //    pages_handle_rules existed this returned 201 and titilinks.com/admin
      //    was a real user page shadowing nothing but reading as official.
      const reserved = await insertPage(page, t, RESERVED_HANDLE);
      expect(
        reserved.code,
        `handle '${RESERVED_HANDLE}' must be refused by the pages_handle_rules CHECK (23514)`,
      ).toBe(CHECK_VIOLATION);
      expect(reserved.id, 'the refused insert returned no row').toBeNull();
      expect(
        await handleExists(page, RESERVED_HANDLE),
        `no page named '${RESERVED_HANDLE}' was written`,
      ).toBe(false);

      // 2. A malformed handle takes the SAME constraint down its format arm —
      //    a trailing hyphen, which the pattern's edge anchors forbid. Proves
      //    the 23514 above is the CHECK and not some unrelated rejection.
      const malformed = await insertPage(page, t, `${MARK}bad-`);
      expect(
        malformed.code,
        'a trailing-hyphen handle must be refused by the same CHECK (23514)',
      ).toBe(CHECK_VIOLATION);
      expect(malformed.id, 'the malformed insert returned no row').toBeNull();

      // 3. The legal handle. The floor must not have become a wall — a normal
      //    handle still lands, which is what keeps the constraint deployable.
      const legal = await insertPage(page, t, OK_HANDLE);
      expect(
        legal.code,
        `handle '${OK_HANDLE}' is well-formed and unreserved, so it must be accepted`,
      ).toBeNull();
      expect(legal.id, 'the accepted insert returned the new row id').toBeTruthy();
      expect(legal.id, 'the new page is NOT the battery\'s own page').not.toBe(t.ownPageId);
      expect(await handleExists(page, OK_HANDLE), 'the legal page really exists').toBe(true);
    } finally {
      // Residue must never leak into another spec, on any exit path. A leftover
      // second page would break every `.eq('user_id', …).maybeSingle()` read of
      // `pages` in the app (OnboardingFlow, DashboardLayout) for this account.
      await sweep(page, t);
    }

    expect(await handleExists(page, OK_HANDLE), 'the fixture page was swept').toBe(false);
    expect(await sweep(page, t), 'nothing named zz-battery-* remains').toBe(0);

    // The battery's own page is exactly as it was found — handle intact, and
    // back to a single page so the next run's precondition still holds.
    const after = await target(page);
    expect(after.ownHandle, "the battery's real handle was never touched").toBe(TEST_HANDLE);
    expect(after.ownPageId, "the battery's real page id is unchanged").toBe(t.ownPageId);
    expect(after.pageCount, 'the battery owns one page again').toBe(1);
  });
});

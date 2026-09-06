// TL.RLS.BLOCKS.1 — disabled blocks are INVISIBLE to the anonymous public,
// proven against a real battery-owned block.
//
// Background: the January init (#1) created `blocks."Public can view enabled
// blocks"` as USING (true) and `block_items."Public can view block items"` as
// USING (true), so every disabled block — drafts, hidden links, seed
// placeholders — and every item inside one was one anon REST call away.
// PublicProfile.tsx filtered is_enabled client-side only (AUDIT_rev6 §2 #6).
// Joey applied TL.RLS.BLOCKS.1 on 2026-09-05 (mirrored as migration #46):
// the public SELECT on blocks is now USING (is_enabled), block_items follow
// their block, and two new owner SELECT policies keep the editor's full read.
//
// This spec is the regression alarm. It toggles ONE block the battery already
// owns — it creates no rows:
//   1. precondition — resolve the battery page → modes → one ENABLED block
//      with ≥1 item, every read scoped to the battery's user_id / page / mode.
//   2. disabled — the owner flips is_enabled=false, then
//        a. anon REST GET blocks?id=eq.<id>        → 200 []   (block invisible)
//        b. anon REST GET block_items?block_id=eq. → 200 []   (items invisible)
//        c. owner in-page select on the same id    → 1 row    (owner still sees it)
//      The finally re-enables the block and asserts it, so the battery's public
//      page never stays altered.
//   3. control — with the block enabled, anon sees the block (1 row) and every
//      item (the recorded count). Proves the public policy admits enabled
//      blocks, not that anon is blocked wholesale.
//
// The ANONYMOUS side is a Playwright APIRequestContext that carries ONLY the
// `apikey` header (the publishable key) and no Authorization header — there is
// no session at all, which is exactly what a stranger with the anon key has.
// The OWNER side runs supabase-js inside the page as the signed-in battery.

import fs from 'fs';
import path from 'path';
import { test, expect, allowWrites, type Page } from './fixtures';
import { TEST_HANDLE, PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

// The API-request types, derived from the fixture door rather than imported
// from the runner package directly (PW-ONE-DOOR).
type TestArgs = Parameters<Parameters<typeof test>[2]>[0];
type APIRequest = TestArgs['playwright']['request'];
type APIRequestContext = Awaited<ReturnType<APIRequest['newContext']>>;

/**
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — the names the app reads
 * in src/integrations/supabase/client.ts. playwright.config.ts loads only
 * .env.test into process.env; the Vite vars live in .env. Same dependency-free
 * parser as the config, .env.test first so a test-only override wins.
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

interface Target {
  userId: string;
  pageId: string;
  blockId: string;
  blockType: string;
  itemCount: number;
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
 * Same recovery as specs 54/55/56: log in again rather than bet on file order.
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

/**
 * Battery page → its modes → the first ENABLED block with ≥1 item. Every read
 * is .eq-scoped to the battery's own user_id, page_id, mode_id or block_id.
 */
const target = (page: Page) => sb<Target>(page, `
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user?.id) throw new Error('no signed-in user — storageState did not carry a session');
  const { data: pg, error: pe } = await sb.from('pages').select('id')
    .eq('user_id', arg.userId).eq('handle', arg.handle).maybeSingle();
  if (pe) throw new Error('pages read failed: ' + pe.code + ' ' + pe.message);
  if (!pg?.id) throw new Error('battery account has no page for handle ' + arg.handle);
  const { data: modes, error: me } = await sb.from('modes').select('id').eq('page_id', pg.id);
  if (me) throw new Error('modes read failed: ' + me.code + ' ' + me.message);
  for (const m of (modes || [])) {
    const { data: blocks, error: be } = await sb.from('blocks')
      .select('id, type')
      .eq('mode_id', m.id)
      .eq('is_enabled', true)
      .order('order_index', { ascending: true });
    if (be) throw new Error('blocks read failed: ' + be.code + ' ' + be.message);
    for (const b of (blocks || [])) {
      const { count, error: ie } = await sb.from('block_items')
        .select('id', { count: 'exact', head: true })
        .eq('block_id', b.id);
      if (ie) throw new Error('block_items read failed: ' + ie.code + ' ' + ie.message);
      if ((count ?? 0) >= 1) {
        return { userId: auth.user.id, pageId: pg.id, blockId: b.id, blockType: b.type, itemCount: count };
      }
    }
  }
  throw new Error('no ENABLED block with at least one item on the battery page — reseed (TL.ISO.4) before running this spec');`,
  { userId: PINNED_TEST_USER_ID, handle: TEST_HANDLE });

/** Owner-path flip of is_enabled on the one block id. Resolves to the error, or null. */
const setEnabled = (page: Page, blockId: string, enabled: boolean) =>
  sb<{ code: string; message: string } | null>(page, `
    const { error } = await sb.from('blocks')
      .update({ is_enabled: arg.enabled })
      .eq('id', arg.blockId);
    return error ? { code: error.code ?? 'no-code', message: error.message ?? '' } : null;`,
    { blockId, enabled });

/** Owner-path read of the one block id: what the signed-in battery sees. */
const ownerSees = (page: Page, blockId: string) =>
  sb<{ id: string; is_enabled: boolean }[]>(page, `
    const { data, error } = await sb.from('blocks')
      .select('id, is_enabled')
      .eq('id', arg.blockId);
    if (error) throw new Error('owner blocks read failed: ' + error.code + ' ' + error.message);
    return data || [];`, { blockId });

/** The anonymous public: publishable key only, no session, no Authorization. */
const anonContext = (pw: APIRequest): Promise<APIRequestContext> =>
  pw.newContext({
    baseURL: viteEnv('VITE_SUPABASE_URL'),
    extraHTTPHeaders: { apikey: viteEnv('VITE_SUPABASE_PUBLISHABLE_KEY') },
  });

/** One anon REST GET. Asserts 200 and returns the parsed row array. */
async function anonGet(
  anon: APIRequestContext,
  pathAndQuery: string,
  label: string,
): Promise<{ id: string }[]> {
  const res = await anon.get(pathAndQuery);
  expect(res.status(), `${label}: anon GET ${pathAndQuery} answers 200`).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(Array.isArray(rows), `${label}: PostgREST returned a row array`).toBe(true);
  return rows;
}

test.describe('TL.RLS.BLOCKS.1 — disabled blocks are invisible to anon', () => {
  // Real UPDATEs on one shared battery block, and the assertions are pure
  // PostgREST/RLS with no DOM in them — the browser engine proves nothing
  // extra. Same reasoning as specs 54/55/56: run once, on desktop; mobile
  // reports skipped, by design.
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'real-row policy test — one project only, the battery block row is shared',
    );
    // A real login (when spec 39 revoked the shared session) plus Postgres
    // round-trips does not fit the 30s default.
    test.setTimeout(120_000);
    await ensureSession(page);
  });

  test('precondition: the battery owns an ENABLED block with at least one item', async ({ page }) => {
    const t = await target(page);
    expect(t.userId, 'TL.ISO.1 — this spec only ever touches the battery account').toBe(
      PINNED_TEST_USER_ID,
    );
    expect(t.blockId, 'an enabled block was found').toBeTruthy();
    expect(t.itemCount, `block ${t.blockType} ${t.blockId} has items`).toBeGreaterThanOrEqual(1);
  });

  test('disabled: anon sees neither the block nor its items; the owner still does', async ({ page, playwright }) => {
    await allowWrites(page, ['rest/v1/blocks']);
    const t = await target(page);
    expect(t.userId, 'TL.ISO.1 — this spec only ever touches the battery account').toBe(
      PINNED_TEST_USER_ID,
    );
    const anon = await anonContext(playwright.request);

    try {
      const off = await setEnabled(page, t.blockId, false);
      expect(off, `owner UPDATE is_enabled=false${off ? ` (got ${off.code}: ${off.message})` : ''}`).toBeNull();

      // a. the block itself
      const blocks = await anonGet(anon, `/rest/v1/blocks?id=eq.${t.blockId}&select=id`, '2a');
      expect(blocks, '2a: a disabled block is invisible to anon (USING (is_enabled))').toEqual([]);

      // b. its items — the policy joins to the caller's view of blocks
      const items = await anonGet(anon, `/rest/v1/block_items?block_id=eq.${t.blockId}&select=id`, '2b');
      expect(items, '2b: items of a disabled block are invisible to anon').toEqual([]);

      // c. the owner keeps the full read (the editor depends on it)
      const mine = await ownerSees(page, t.blockId);
      expect(mine, '2c: the owner still reads its own disabled block').toHaveLength(1);
      expect(mine[0].is_enabled, '2c: and sees it as disabled').toBe(false);
    } finally {
      // The battery's public page must never stay altered, on any exit path.
      const on = await setEnabled(page, t.blockId, true);
      expect(on, `restore is_enabled=true${on ? ` (got ${on.code}: ${on.message})` : ''}`).toBeNull();
      const after = await ownerSees(page, t.blockId);
      expect(after, 'restore: the block is readable again').toHaveLength(1);
      expect(after[0].is_enabled, 'restore: the block is enabled again').toBe(true);
      await anon.dispose();
    }
  });

  test('control: with the block enabled, anon sees the block and every item', async ({ page, playwright }) => {
    const t = await target(page);
    expect(t.userId, 'TL.ISO.1 — this spec only ever touches the battery account').toBe(
      PINNED_TEST_USER_ID,
    );
    const anon = await anonContext(playwright.request);
    try {
      const blocks = await anonGet(anon, `/rest/v1/blocks?id=eq.${t.blockId}&select=id`, '3');
      expect(blocks, '3: an enabled block is visible to anon').toHaveLength(1);
      expect(blocks[0].id).toBe(t.blockId);

      const items = await anonGet(anon, `/rest/v1/block_items?block_id=eq.${t.blockId}&select=id`, '3');
      expect(items, '3: every item of an enabled block is visible to anon').toHaveLength(t.itemCount);
    } finally {
      await anon.dispose();
    }
  });
});

// TL.EDGE.1 — the three edge-function gates, probed against the LIVE deployed
// functions (not the dev server): unfurl requires a signed-in caller,
// youtube-feed serves anonymous visitors only for sources configured on an
// enabled video_feed block, and the qr function no longer exists.
//
// Background (AUDIT_rev6 §2.5 / #10): all three answered to the public anon
// key — which is itself a JWT, so the gateway's verify_jwt let it through —
// with CORS * and no per-caller cap. unfurl was an SSRF-guarded fetch proxy
// for anyone, youtube-feed spent the project's YouTube Data API quota on
// anyone's behalf, and qr had zero callers (src/pages/QRCode.tsx renders QR
// codes client-side). TL.EDGE.1 gates the first two in code and deletes the
// third. This spec runs only after Joey deploys — before that, tests 1/3/5/6
// are the AUDIT finding itself.
//
// Doors, as the tests exercise them:
//   1. unfurl, anon key only                       → 401
//   2. unfurl, battery session                     → 200 with a `title`
//   3. youtube-feed, anon, id configured NOWHERE   → 403
//   4. youtube-feed, anon, id configured on the battery's ENABLED video_feed
//      block (title temporarily set to a real config, restored in finally)
//                                                  → 200 (gate opened; video
//      contents are NOT asserted — YouTube availability / YOUTUBE_API_KEY is
//      not under test, and a `{videos:[], error}` body is still a 200)
//   5. youtube-feed, anon, free-form `input` only  → 403
//   6. qr                                          → 404 (function deleted)
//
// Test 4 uses a different `limit` than test 3 on purpose: the function's
// 15-minute cache is keyed on source:playlist:limit, so a successful test-4
// fetch can never turn a re-run of test 3 into a cache hit (200 instead of
// 403) within the TTL.
//
// The ANONYMOUS side is a Playwright APIRequestContext carrying exactly what
// supabase.functions.invoke sends when there is NO session: `apikey` plus
// `Authorization: Bearer <anon key>`. The anon key is itself a JWT, so the
// gateway's verify_jwt admits it — that is the whole AUDIT finding — and the
// in-code gates are the only thing left in the way. (A request with no
// Authorization header at all never reaches the function: the gateway answers
// 401 UNAUTHORIZED_NO_AUTH_HEADER, which would make tests 1/3/5 pass for the
// wrong reason.) The signed-in side overrides that header with the battery's
// access token, taken from the app's own client in-page.
//
// Test 4 is the only write: one UPDATE of blocks.title on the battery's own
// video_feed block, scoped by id, restored and asserted in a finally. Every
// read is .eq-scoped to the battery's user_id / page / mode.

import fs from 'fs';
import path from 'path';
import { test, expect, allowWrites, type Page } from './fixtures';
import { TEST_HANDLE, PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

// The API-request types, derived from the fixture door rather than imported
// from the runner package directly (PW-ONE-DOOR).
type TestArgs = Parameters<Parameters<typeof test>[2]>[0];
type APIRequest = TestArgs['playwright']['request'];
type APIRequestContext = Awaited<ReturnType<APIRequest['newContext']>>;

/** YouTube's own channel id — a real, regex-valid UC id that no TitiLinks page configures. */
const PROBE_CHANNEL_ID = 'UCBR8-60-B28hp2BmDPdntcQ';
/** limit for the "configured nowhere" probe (test 3). */
const UNCONFIGURED_LIMIT = 3;
/** limit for the "configured on the battery block" probe (test 4) — distinct cache key. */
const CONFIGURED_LIMIT = 4;

/**
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — the names the app reads
 * in src/integrations/supabase/client.ts. playwright.config.ts loads only
 * .env.test into process.env; the Vite vars live in .env. Same dependency-free
 * parser as spec 57 and the config, .env.test first so a test-only override wins.
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
 * Same recovery as specs 54–57: log in again rather than bet on file order.
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

interface VideoFeedBlock {
  userId: string;
  blockId: string;
  isEnabled: boolean;
  title: string | null;
}

/** Battery page → modes → its ONE video_feed block (TL.BLOCK.1 singleton). Every read .eq-scoped. */
const videoFeedBlock = (page: Page) => sb<VideoFeedBlock>(page, `
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
      .select('id, is_enabled, title')
      .eq('mode_id', m.id)
      .eq('type', 'video_feed');
    if (be) throw new Error('blocks read failed: ' + be.code + ' ' + be.message);
    const b = (blocks || [])[0];
    if (b) return { userId: auth.user.id, blockId: b.id, isEnabled: !!b.is_enabled, title: b.title ?? null };
  }
  throw new Error('the battery page has no video_feed block — reseed (TL.ISO.4) before running this spec');`,
  { userId: PINNED_TEST_USER_ID, handle: TEST_HANDLE });

/** Owner-path write of blocks.title on the one block id. Resolves to the error, or null. */
const setTitle = (page: Page, blockId: string, title: string | null) =>
  sb<{ code: string; message: string } | null>(page, `
    const { error } = await sb.from('blocks')
      .update({ title: arg.title })
      .eq('id', arg.blockId);
    return error ? { code: error.code ?? 'no-code', message: error.message ?? '' } : null;`,
    { blockId, title });

/** Owner-path read-back of blocks.title on the one block id. */
const readTitle = (page: Page, blockId: string) => sb<string | null>(page, `
  const { data, error } = await sb.from('blocks').select('title').eq('id', arg.blockId).maybeSingle();
  if (error) throw new Error('blocks read failed: ' + error.code + ' ' + error.message);
  return data?.title ?? null;`, { blockId });

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

test.describe('TL.EDGE.1 — edge-function gates (live functions)', () => {
  // Pure HTTP against the deployed functions plus one real UPDATE on a shared
  // battery block — the browser engine proves nothing extra. Same reasoning
  // as specs 54–57: run once, on desktop; mobile reports skipped, by design.
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'live edge-function probe — one project only, the battery block row is shared',
    );
    // A real login (when spec 39 revoked the shared session), a live edge
    // function cold start and an upstream fetch do not fit the 30s default.
    test.setTimeout(120_000);
    await ensureSession(page);
  });

  test('1. unfurl: the anon key alone is refused (401)', async ({ playwright }) => {
    const anon = await anonContext(playwright.request);
    try {
      const res = await anon.post('/functions/v1/unfurl', { data: { url: 'https://example.com' } });
      const body = await bodyOf(res);
      expect(res.status(), `anon unfurl must be 401 — got ${res.status()} ${JSON.stringify(body)}`).toBe(401);
      // The function's own refusal, not the gateway's UNAUTHORIZED_NO_AUTH_HEADER.
      expect(body, 'refused by getAuthedUser in unfurl itself').toEqual({ error: 'Sign in to fetch link previews.' });
    } finally {
      await anon.dispose();
    }
  });

  test('2. unfurl: a signed-in caller gets a preview (200 with a title)', async ({ page, playwright }) => {
    const { userId, token } = await accessToken(page);
    expect(userId, 'TL.ISO.1 — the session is the battery').toBe(PINNED_TEST_USER_ID);
    expect(token, 'the battery session carries an access token').toBeTruthy();

    const anon = await anonContext(playwright.request);
    try {
      const res = await anon.post('/functions/v1/unfurl', {
        headers: { Authorization: `Bearer ${token}` },
        data: { url: 'https://example.com' },
      });
      const body = await bodyOf(res);
      expect(res.status(), `signed-in unfurl must be 200 — got ${res.status()} ${JSON.stringify(body)}`).toBe(200);
      expect(body, 'the preview is a JSON object').toEqual(expect.any(Object));
      expect(body as object, 'the preview carries a title (oEmbed → og:title → <title> → hostname)').toHaveProperty('title');
      expect(typeof (body as { title: unknown }).title, 'title is a string').toBe('string');
    } finally {
      await anon.dispose();
    }
  });

  test('3. youtube-feed: anon with an id configured on no page is refused (403)', async ({ playwright }) => {
    const anon = await anonContext(playwright.request);
    try {
      const res = await anon.post('/functions/v1/youtube-feed', {
        data: { channel_id: PROBE_CHANNEL_ID, limit: UNCONFIGURED_LIMIT },
      });
      expect(res.status(), `unconfigured source must be 403 — got ${res.status()} ${JSON.stringify(await bodyOf(res))}`).toBe(403);
    } finally {
      await anon.dispose();
    }
  });

  test('4. youtube-feed: anon with an id configured on an enabled block is admitted (200)', async ({ page, playwright }) => {
    await allowWrites(page, ['rest/v1/blocks']);
    const b = await videoFeedBlock(page);
    expect(b.userId, 'TL.ISO.1 — this spec only ever touches the battery account').toBe(PINNED_TEST_USER_ID);
    expect(b.isEnabled, 'the battery video_feed block must be ENABLED for the gate to open').toBe(true);

    // Exactly what VideoFeedEditor.handleSave writes (the `feed` envelope).
    const config = JSON.stringify({
      feed: {
        platform: 'youtube',
        source: 'channel',
        channel_id: PROBE_CHANNEL_ID,
        playlist_id: null,
        channel_title: null,
        channel_avatar: null,
        channel_handle: null,
        input_url: '',
        limit: CONFIGURED_LIMIT,
      },
    });

    const anon = await anonContext(playwright.request);
    try {
      const set = await setTitle(page, b.blockId, config);
      expect(set, `owner UPDATE of blocks.title${set ? ` (got ${set.code}: ${set.message})` : ''}`).toBeNull();
      expect(await readTitle(page, b.blockId), 'the config landed').toBe(config);

      const res = await anon.post('/functions/v1/youtube-feed', {
        data: { channel_id: PROBE_CHANNEL_ID, limit: CONFIGURED_LIMIT },
      });
      expect(
        res.status(),
        `configured source must open the gate (200) — got ${res.status()} ${JSON.stringify(await bodyOf(res))}`,
      ).toBe(200);
    } finally {
      // The battery block must never stay reconfigured, on any exit path.
      const restore = await setTitle(page, b.blockId, b.title);
      expect(restore, `restore blocks.title${restore ? ` (got ${restore.code}: ${restore.message})` : ''}`).toBeNull();
      expect(await readTitle(page, b.blockId), 'the original title is back').toBe(b.title);
      await anon.dispose();
    }
  });

  test('5. youtube-feed: anon free-form input is refused (403)', async ({ playwright }) => {
    const anon = await anonContext(playwright.request);
    try {
      const res = await anon.post('/functions/v1/youtube-feed', {
        data: { input: 'https://www.youtube.com/@youtube' },
      });
      expect(res.status(), `anon input-only must be 403 — got ${res.status()} ${JSON.stringify(await bodyOf(res))}`).toBe(403);
    } finally {
      await anon.dispose();
    }
  });

  test('6. qr: the function is gone (404)', async ({ playwright }) => {
    const anon = await anonContext(playwright.request);
    try {
      const res = await anon.get('/functions/v1/qr?url=https://example.com');
      expect(res.status(), `deleted function must be 404 — got ${res.status()} ${JSON.stringify(await bodyOf(res))}`).toBe(404);
    } finally {
      await anon.dispose();
    }
  });
});

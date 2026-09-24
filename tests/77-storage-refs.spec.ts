// TL.STOR.8.3 — reference-aware storage cleanup: snapshots keep their images.
//
// removePublicObject() used to delete a products / page-assets object the
// moment its row was deleted or replaced. profile_snapshots.payload captures
// block_items.image_url and theme_json.background.image_url, so restoring an
// older snapshot brought back rows whose files were gone. The ruling
// (TL.SNAP.REF.1): an object is deleted only when NOTHING references it — no
// live row, no snapshot — and deleting a snapshot releases what only it held.
//
// Part A proves the pure halves (collectPublicUrls / publicObjectRef) through
// the dev server's module graph, the spec-74 way.
//
// Part B proves the behaviour on the battery account through the real
// dashboard: the snapshots panel captures / restores / deletes, and the
// GalleryEditor's trash + Save deletes the photo — the same doors a creator
// uses.
//
// THE TRAP THIS SPEC IS BUILT AROUND (TL.STOR.4, on the record — see spec 70):
// a deleted object's plain public URL keeps serving 200 from the CDN for about
// an hour. Absence is proved by list() (reads storage.objects), and every HTTP
// probe busts the cache key with `?cb=<now>` so it reaches the origin.
//
// FIXTURES — the gallery block is canonical and singleton, so the spec BORROWS
// it (the spec-70 pattern): one temporary item labelled SPEC77-PHOTO pointing
// at a freshly uploaded `spec77-<uuid>.png`. The editor's Save rewrites the
// block title and every kept item's order_index / image_url / style_json, so
// those are snapshotted first and handed back verbatim in the finally. Every
// snapshot the spec makes is named `SPEC77 …` and deleted in the finally (the
// manual quota is shared with spec 54, which needs zero manual rows to start).
// A killed run is healed by the next run's pre-flight sweep.
//
// Desktop only: the assertions are about storage and rows, not the engine.
import { test, expect, allowWrites, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

const T = translations.en;

const BUCKET = 'products';
const MARKER = 'SPEC77';
/** entitlements.maxSnapshots for the battery's pro plan. */
const LIMIT = 5;

// ─── Part A fixtures ────────────────────────────────────────────────────────

const PUB = 'https://ohmvlypcbrfkuudcuqub.supabase.co/storage/v1/object/public';
const ITEM_A = `${PUB}/products/${PINNED_TEST_USER_ID}/a.png`;
const ITEM_B = `${PUB}/products/${PINNED_TEST_USER_ID}/b%20c.png?t=1`;
const BG = `${PUB}/page-assets/${PINNED_TEST_USER_ID}/bg.jpg`;
const AVATAR = `${PUB}/avatars/${PINNED_TEST_USER_ID}/face.jpg`;
const EXTERNAL = 'https://images.example.com/photo.png';

/** A snapshot-shaped payload: two item images, one background, one external
 *  image and one avatar — plus ITEM_A again, wrapped in a CSS url(), which must
 *  dedupe to the bare URL. */
const PAYLOAD = {
  v: 1,
  theme_json: { background: { type: 'image', image_url: BG }, hero: { avatar_url: AVATAR } },
  modes: [
    {
      type: 'page1',
      blocks: [
        {
          type: 'gallery',
          items: [
            { label: 'one', image_url: ITEM_A, style_json: { bg: `url("${ITEM_A}")` } },
            { label: 'two', image_url: ITEM_B },
            { label: 'ext', image_url: EXTERNAL },
            { label: 'none', image_url: null },
          ],
        },
      ],
    },
  ],
};

test.describe('TL.STOR.8.3 — Part A: the pure reference helpers (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'pure functions — one project only');
    await page.goto('/');
  });

  test('1. collectPublicUrls returns exactly the bucket URLs; publicObjectRef parses them', async ({ page }) => {
    const out = await page.evaluate(
      async ({ payload, probes }) => {
        // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
        const m = await import('/src/lib/storage-refs.ts');
        return {
          urls: m.collectPublicUrls(payload) as string[],
          themeOnly: m.collectPublicUrls(payload.theme_json) as string[],
          refs: probes.map((u: string) => m.publicObjectRef(u)),
        };
      },
      { payload: PAYLOAD, probes: [ITEM_A, ITEM_B, BG, AVATAR, EXTERNAL] },
    );

    expect([...out.urls].sort(), 'the three bucket URLs, deduped — no avatar, no external')
      .toEqual([ITEM_A, ITEM_B, BG].sort());
    expect(out.themeOnly, 'a bare theme_json yields its background').toEqual([BG]);

    expect(out.refs).toEqual([
      { bucket: 'products', path: `${PINNED_TEST_USER_ID}/a.png` },
      { bucket: 'products', path: `${PINNED_TEST_USER_ID}/b c.png` },
      { bucket: 'page-assets', path: `${PINNED_TEST_USER_ID}/bg.jpg` },
      null,
      null,
    ]);
  });
});

// ─── Part B helpers ─────────────────────────────────────────────────────────

// TL.ISO.2 write opt-in. The dashboard REALLY writes here: the gallery Save
// (blocks title, block_items), the snapshot capture / delete, a full restore
// (blocks, block_items, modes.sticky_cta_enabled, pages.theme_json), and the
// storage upload / remove. list() is a POST, so the read is declared too.
const WRITE_PREFIXES = [
  'rest/v1/blocks',
  'rest/v1/block_items',
  'rest/v1/modes',
  'rest/v1/pages',
  'rest/v1/profile_snapshots',
  'storage/v1/object/products',
  'storage/v1/object/list/products',
];

/** Run a supabase query with the app's own client (RLS as the signed-in user).
 *  Re-imported per call: every navigation wipes anything cached on window. */
const sb = <R,>(page: Page, fn: string, arg?: unknown): Promise<R> => page.evaluate(
  async ({ body, a }) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
  },
  { body: fn, a: arg ?? null },
);

/** Spec 39 signs the shared session out for real; recover rather than bet on
 *  file order (the spec-54 precedent). */
async function ensureSession(page: Page): Promise<void> {
  await page.goto('/');
  const id = () => sb<string | null>(page, `const { data } = await sb.auth.getUser(); return data?.user?.id ?? null;`);
  if (await id()) return;
  await loginAsTestUser(page);
  await page.goto('/');
  if (!(await id())) throw new Error('could not establish a battery session — check .env.test credentials');
}

interface Target { pageId: string; modeId: string }

/** The battery's one page and the mode the dashboard edits (page1). */
const target = (page: Page) => sb<Target>(
  page,
  `const { data: pg, error } = await sb.from('pages').select('id').eq('user_id', arg).maybeSingle();
   if (error) throw error;
   if (!pg) throw new Error('no pages row for the pinned account');
   const { data: modes } = await sb.from('modes').select('id,type').eq('page_id', pg.id);
   const m = (modes || []).find((x) => x.type === 'page1') || (modes || [])[0];
   if (!m) throw new Error('no mode on the pinned account\\'s page');
   return { pageId: pg.id, modeId: m.id };`,
  PINNED_TEST_USER_ID,
);

type ItemSnap = { id: string; image_url: string | null; order_index: number; style_json: unknown };

/** The editing mode's gallery block, with what the editor's Save rewrites. */
const galleryBlock = (page: Page, modeId: string) => sb<{ id: string; title: string | null; items: ItemSnap[] }>(
  page,
  `const { data: blocks } = await sb.from('blocks')
     .select('id,title').eq('mode_id', arg).eq('type', 'gallery');
   const b = (blocks || [])[0];
   if (!b) throw new Error('no gallery block on the editing mode — reseed the account');
   const { data: items, error } = await sb.from('block_items')
     .select('id,image_url,order_index,style_json').eq('block_id', b.id);
   if (error) throw error;
   return { id: b.id, title: b.title, items: items || [] };`,
  modeId,
);

/** Every object under the account's own products folder, by bare file name. */
const listNames = (page: Page): Promise<string[]> => sb<string[]>(
  page,
  `const { data, error } = await sb.storage.from('${BUCKET}').list(arg, { limit: 1000 });
   if (error) throw error;
   return data.map((o) => o.name);`,
  PINNED_TEST_USER_ID,
);

/** HTTP status of the object at the ORIGIN — `?cb=` busts the CDN cache key. */
async function originStatus(page: Page, url: string): Promise<number> {
  const res = await page.request.head(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`);
  return res.status();
}

/** Upload a flat-fill PNG to products/<uid>/spec77-<uuid>.png with the app's
 *  own client; returns its public URL and object name. */
async function uploadSeed(page: Page, fill: string): Promise<{ url: string; name: string }> {
  const name = `spec77-${crypto.randomUUID()}.png`;
  const url = await sb<string>(
    page,
    `const c = document.createElement('canvas');
     c.width = 400; c.height = 400;
     const x = c.getContext('2d');
     x.fillStyle = arg.fill; x.fillRect(0, 0, 400, 400);
     const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
     const path = arg.uid + '/' + arg.name;
     const { error } = await sb.storage.from('${BUCKET}').upload(path, blob, { contentType: 'image/png' });
     if (error) throw new Error('seed upload: ' + error.message);
     return sb.storage.from('${BUCKET}').getPublicUrl(path).data.publicUrl;`,
    { fill, uid: PINNED_TEST_USER_ID, name },
  );
  return { url, name };
}

/** Remove objects by bare name; a no-op for names that are already gone. */
const removeObjects = (page: Page, names: string[]) => sb<void>(
  page,
  `if (!arg.names.length) return;
   const { error } = await sb.storage.from('${BUCKET}').remove(arg.names.map((n) => arg.uid + '/' + n));
   if (error) throw new Error('remove: ' + error.message);`,
  { names, uid: PINNED_TEST_USER_ID },
);

const insertItem = (page: Page, blockId: string, url: string) => sb<string>(
  page,
  `const { data, error } = await sb.from('block_items')
     .insert({ block_id: arg.blockId, label: arg.label, url: '', image_url: arg.url, order_index: 99 })
     .select('id').single();
   if (error) throw new Error('seed item: ' + error.message);
   return data.id;`,
  { blockId, url, label: `${MARKER}-PHOTO` },
);

/** Image URLs of the SPEC77 rows in the editing mode's blocks (ids change on restore). */
const markerItemUrls = (page: Page, modeId: string) => sb<string[]>(
  page,
  `const { data: blocks } = await sb.from('blocks').select('id').eq('mode_id', arg.modeId);
   const out = [];
   for (const b of (blocks || [])) {
     const { data } = await sb.from('block_items').select('label,image_url').eq('block_id', b.id);
     for (const i of (data || [])) if ((i.label || '').startsWith(arg.marker)) out.push(i.image_url);
   }
   return out;`,
  { modeId, marker: MARKER },
);

const manualCount = (page: Page, pageId: string) => sb<number>(
  page,
  `const { count } = await sb.from('profile_snapshots')
     .select('id', { count: 'exact', head: true }).eq('page_id', arg).eq('kind', 'manual');
   return count ?? 0;`,
  pageId,
);

const autoIds = (page: Page, pageId: string) => sb<string[]>(
  page,
  `const { data, error } = await sb.from('profile_snapshots').select('id').eq('page_id', arg).eq('kind', 'auto');
   if (error) throw error;
   return (data || []).map((r) => r.id);`,
  pageId,
);

/** Put the account back from any state a killed run can leave: SPEC77 items in
 *  the editing mode, SPEC77 snapshots on the page, spec77-* objects. Runs as the
 *  pre-flight and inside each finally. */
async function sweep(page: Page, t: Target): Promise<void> {
  await sb<void>(
    page,
    `const { data: blocks } = await sb.from('blocks').select('id').eq('mode_id', arg.modeId);
     for (const b of (blocks || [])) {
       const { data: items } = await sb.from('block_items').select('id,label').eq('block_id', b.id);
       const junk = (items || []).filter((i) => (i.label || '').startsWith(arg.marker)).map((i) => i.id);
       if (junk.length) {
         const { error } = await sb.from('block_items').delete().in('id', junk);
         if (error) throw new Error('sweep items: ' + error.message);
       }
     }
     const { error: sErr } = await sb.from('profile_snapshots').delete()
       .eq('page_id', arg.pageId).like('name', arg.marker + '%');
     if (sErr) throw new Error('sweep snapshots: ' + sErr.message);`,
    { ...t, marker: MARKER },
  );
  const leftovers = (await listNames(page)).filter((n) => n.startsWith('spec77-'));
  await removeObjects(page, leftovers);
}

/** Hand back what the gallery editor's Save rewrote (no-ops for ids a restore
 *  re-minted — the restore already put those back). */
const restoreGallery = (page: Page, g: { id: string; title: string | null; items: ItemSnap[] }) => sb<void>(
  page,
  `const { error } = await sb.from('blocks').update({ title: arg.title }).eq('id', arg.id);
   if (error) throw new Error('title restore: ' + error.message);
   for (const it of arg.items) {
     const { id, ...cols } = it;
     const { error: e } = await sb.from('block_items').update(cols).eq('id', id);
     if (e) throw new Error('item restore: ' + e.message);
   }`,
  g,
);

/** Every storage remove() the app sends to the products bucket, by body. */
function trackRemoves(page: Page): string[] {
  const bodies: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'DELETE' && r.url().includes(`/storage/v1/object/${BUCKET}`)) bodies.push(r.postData() || '');
  });
  return bodies;
}

/** The reference check's snapshot read (isReferenced selects `id,payload`). */
const refCheckDone = (page: Page) => page.waitForResponse(
  (r) => r.url().includes('/rest/v1/profile_snapshots') && r.url().includes('select=id%2Cpayload')
    && r.request().method() === 'GET',
  { timeout: 30_000 },
);

// ─── Part B UI doors ────────────────────────────────────────────────────────

async function openEditProfile(page: Page): Promise<void> {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).filter({ visible: true }).first().click();
}

async function openSnapshots(page: Page): Promise<void> {
  await openEditProfile(page);
  await page.getByRole('button', { name: /snapshots/i }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('snapshots-panel')).toBeVisible();
}

async function captureViaPanel(page: Page, name: string): Promise<void> {
  await openSnapshots(page);
  await page.getByTestId('snapshot-name').fill(name);
  await page.getByTestId('snapshot-save').click();
  await expect(page.getByTestId('snapshot-row').filter({ hasText: name })).toBeVisible({ timeout: 30_000 });
}

async function snapshotAction(page: Page, name: string, action: 'restore' | 'delete'): Promise<void> {
  await openSnapshots(page);
  const row = page.getByTestId('snapshot-row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByTestId(`snapshot-${action}`).click();
  await page.getByTestId('snapshot-confirm-go').click();
  if (action === 'restore') {
    await expect(page.getByText(T['snapshots.restored'], { exact: true })).toBeVisible({ timeout: 60_000 });
  } else {
    await expect(row).toHaveCount(0, { timeout: 30_000 });
  }
}

/** The slide-in panel (the editor's container — spec 70's locator). */
const panel = (page: Page) => page.locator('.fixed.top-16');

async function openGalleryPanel(page: Page): Promise<void> {
  await openEditProfile(page);
  await expect(page.getByTestId('sections-group-toggle')).toBeVisible();
  const row = page.locator('[data-testid="section-row"][data-section-type="gallery"]');
  await expect(row, 'no gallery row on the Sections rail').toHaveCount(1);
  await row.locator('button').first().click();
}

/** Trash the tile showing `url` in the GalleryEditor and Save. */
async function deletePhotoViaEditor(page: Page, url: string): Promise<void> {
  await openGalleryPanel(page);
  const img = panel(page).locator(`img[src="${url}"]`);
  await expect(img, 'the seeded photo is not in the gallery editor').toBeVisible({ timeout: 15_000 });
  const tile = img.locator('xpath=..');
  await tile.hover();
  await tile.locator('button').last().click();
  await expect(img).toHaveCount(0);
  await panel(page).getByRole('button', { name: T['blockEditor.save'], exact: true }).click();
  await expect(page.getByText(T['galleryEditor.saved'], { exact: true })).toBeVisible({ timeout: 30_000 });
}

// ─── Part B ─────────────────────────────────────────────────────────────────

test.describe('TL.STOR.8.3 — Part B: snapshots hold their images (battery, real dashboard)', () => {
  test.use({ deviceScaleFactor: 1, viewport: { width: 1440, height: 1000 } });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'shared-account storage + rows — one project only');
    test.setTimeout(240_000);
    await allowWrites(page, WRITE_PREFIXES);
    await ensureSession(page);
  });

  test('1. a snapshot keeps a deleted photo\'s file; deleting the snapshot releases it', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const t = await target(page);
    await sweep(page, t);
    expect(await manualCount(page, t.pageId), 'no room under the manual snapshot quota').toBeLessThan(LIMIT);

    const gallery = await galleryBlock(page, t.modeId);
    const seed = await uploadSeed(page, '#16a085');
    expect(await originStatus(page, seed.url), 'fresh upload must answer 200').toBe(200);
    const itemId = await insertItem(page, gallery.id, seed.url);
    const snapName = `${MARKER} hold ${Date.now()}`;
    const removes = trackRemoves(page);

    try {
      await captureViaPanel(page, snapName);

      // Delete the photo through the editor. The row goes; the reference check
      // must find the snapshot and keep the file.
      const checked = refCheckDone(page);
      await deletePhotoViaEditor(page, seed.url);
      await checked;
      await page.waitForTimeout(1_500); // room for a (wrong) remove() to fire
      expect(await markerItemUrls(page, t.modeId), 'the gallery row must be gone').toEqual([]);
      expect(removes.filter((b) => b.includes(seed.name)), 'no remove() may target a snapshot-held file')
        .toEqual([]);
      expect(await listNames(page), 'the snapshot-held object must stay in the bucket').toContain(seed.name);
      expect(await originStatus(page, seed.url), 'the snapshot-held object must still serve').toBe(200);

      // Delete the snapshot: nothing references the file any more, so it goes.
      await snapshotAction(page, snapName, 'delete');
      await expect.poll(
        async () => (await listNames(page)).includes(seed.name),
        { timeout: 10_000, message: 'the released object must leave list() once its last snapshot is deleted' },
      ).toBe(false);
      expect([400, 404], 'the released object must not serve from the origin')
        .toContain(await originStatus(page, seed.url));
    } finally {
      await sb<void>(page, `await sb.from('block_items').delete().eq('id', arg);`, itemId);
      await restoreGallery(page, gallery);
      await sweep(page, t);
      expect((await listNames(page)).filter((n) => n.startsWith('spec77-')), 'spec77 objects left behind').toEqual([]);
    }
  });

  test('2. restoring a snapshot brings a deleted photo back with its file', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const t = await target(page);
    await sweep(page, t);
    expect(await manualCount(page, t.pageId), 'no room under the manual snapshot quota').toBeLessThan(LIMIT);

    const gallery = await galleryBlock(page, t.modeId);
    const seed = await uploadSeed(page, '#d35400');
    await insertItem(page, gallery.id, seed.url);
    const snapName = `${MARKER} restore ${Date.now()}`;
    const autosBefore = await autoIds(page, t.pageId);

    try {
      await captureViaPanel(page, snapName);
      const checked = refCheckDone(page);
      await deletePhotoViaEditor(page, seed.url);
      await checked;
      await page.waitForTimeout(1_500);
      expect(await markerItemUrls(page, t.modeId), 'the gallery row must be gone').toEqual([]);
      expect(await listNames(page), 'the snapshot-held object must stay in the bucket').toContain(seed.name);

      await snapshotAction(page, snapName, 'restore');

      // The row is back (restore re-mints ids) and points at the same file…
      await expect.poll(() => markerItemUrls(page, t.modeId), { timeout: 15_000 }).toEqual([seed.url]);
      // …which the origin still serves…
      expect(await originStatus(page, seed.url), 'the restored photo\'s file must serve').toBe(200);
      // …and which the gallery actually renders (the editor tile loads eagerly).
      await openGalleryPanel(page);
      const img = panel(page).locator(`img[src="${seed.url}"]`);
      await expect(img).toBeVisible({ timeout: 15_000 });
      await expect.poll(
        () => img.evaluate((el) => { const i = el as HTMLImageElement; return i.complete ? i.naturalWidth : 0; }),
        { timeout: 15_000, message: 'the restored photo must decode — a broken image has naturalWidth 0' },
      ).toBeGreaterThan(0);
    } finally {
      // The restore's own "Before restore" safety net is this test's residue.
      const fresh = (await autoIds(page, t.pageId)).filter((id) => !autosBefore.includes(id));
      if (fresh.length) {
        await sb<void>(page, `await sb.from('profile_snapshots').delete().in('id', arg);`, fresh);
      }
      await restoreGallery(page, gallery);
      await sweep(page, t);
      expect((await listNames(page)).filter((n) => n.startsWith('spec77-')), 'spec77 objects left behind').toEqual([]);
    }
  });
});

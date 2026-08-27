// TL.GAL.6 — the gallery panel's live draft channel (L6).
//
// Everything the panel stages must reach the phone preview IMMEDIATELY, before
// Save, and nothing it stages may reach the database until Save. That pair of
// claims is the whole feature, and neither half is visible to a unit test:
//
//   1. config — layout / auto-scroll / speed. The speed chips are the sharpest
//      case, because a tier is not a number in the DOM: it only exists as the
//      rate the strip actually glides at, so this spec MEASURES the preview
//      re-rating under a chip tap while the DB still says something else;
//   2. staged ADDS — a photo with no row and no storage object yet, carried to
//      the preview as the data URL the panel is holding, crop included;
//   3. staged REMOVES — a photo that still exists in the DB, absent from the
//      preview;
//   4. ORDER — drag-to-reorder (TL.GAL.6 added it; the panel had none), with
//      the preview following and Save committing order_index from it;
//   5. Cancel discards the lot and the preview snaps back to DB truth, and the
//      re-do → Save round trip commits WITHOUT re-uploading (the TL.GAL.1b
//      landmine: a second Save must not mint a second storage object).
//
// Plus the conflict this channel creates: the preview keeps its own per-photo
// trash, so while the panel is drafting, that trash has to stage rather than
// delete. Test 3 pins those semantics.
//
// Every photo this spec uploads is swept in a finally — the shared test
// account's own photos are never mutated.
import { test, expect, allowWrites, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';

// TL.ISO.2 write opt-in — this spec REALLY writes: uploads POST to the
// products bucket, Save commits the staged draft (block_items insert/
// update/delete + blocks.title), and sweep() deletes rows + storage objects.
test.beforeEach(async ({ page }) => {
  await allowWrites(page, ['rest/v1/blocks', 'rest/v1/block_items', 'storage/v1/object/products']);
});

const T = translations.en;

// The glide formula, mirrored from GalleryBlock — see spec 43, which pins it
// from the other side. Here it is only ever used as a RATIO between two tiers,
// so a future re-scale of FILMSTRIP_GLIDE_SCALE cannot break this spec.
const TIER_MS = { slow: 7000, medium: 5000, fast: 3000 } as const;

// The glide is skipped outright under reduced motion.
test.use({ reducedMotion: 'no-preference' });

const panelOf = (page: Page) => page.locator('[class*="z-[120]"]');
const sheetOf = (page: Page) => page.locator('[class*="z-[150]"]');
/** Tiles inside the editor panel (the preview's tiles are alt="Photo"). */
const panelTiles = (page: Page) => panelOf(page).locator(`img[alt="${T['galleryEditor.photoAlt']}"]`);
const grips = (page: Page) => panelOf(page).getByRole('button', { name: T['galleryEditor.dragToReorder'] });

/** Run a supabase query with the app's own client (RLS as the signed-in user). */
const sb = <T,>(page: Page, fn: string, arg?: unknown): Promise<T> => page.evaluate(
  async ({ body, a }) => {
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as never)['supabase'], a);
  },
  { body: fn, a: arg ?? null },
);

interface Row { id: string; image_url: string; style_json: Record<string, unknown> | null; order_index: number }

const galleryItems = (page: Page) => sb<Row[]>(page, `
  const { data: blocks } = await sb.from('blocks').select('*');
  const gal = (blocks || []).filter(b => b.type === 'gallery').map(b => b.id);
  const { data } = await sb.from('block_items').select('id,image_url,style_json,order_index').in('block_id', gal);
  return (data || []).sort((a, b) => a.order_index - b.order_index);`);

/**
 * What the PREVIEW is rendering, read off the DOM.
 *
 * Scoped through the gallery block's own count label rather than a class, and
 * with everything inside the editor panel excluded — the panel holds tiles of
 * the very same photos, and a selector that caught both would happily "prove"
 * the mirror by reading the panel twice. The editor mounts TWO
 * EditableProfileViews (desktop + mobile, CSS-hidden rather than unmounted), so
 * the zero-width one is filtered out too.
 */
const previewState = (page: Page) => page.evaluate((word) => {
  const panel = document.querySelector('[class*="z-[120]"]');
  const label = [...document.querySelectorAll('p')].find(
    (p) => new RegExp(`^${word} \\(\\d+ `).test((p.textContent || '').trim())
      && p.getBoundingClientRect().width > 0
      && !panel?.contains(p),
  );
  const root = label?.parentElement ?? null;
  const imgs = root ? [...root.querySelectorAll('img')].filter((i) => !panel?.contains(i)) : [];
  return {
    labelCount: Number(label?.textContent?.match(/\((\d+) /)?.[1] ?? -1),
    srcs: imgs.map((i) => i.getAttribute('src') || ''),
    // A framed photo is painted by inline geometry; an unframed one is not.
    cropped: imgs.map((i) => !!i.style.width),
    grid: !!root?.querySelector('[class*="grid-cols-2"]'),
    strip: !!root?.querySelector('[class*="overflow-x-auto"]'),
  };
}, T['gallery.label']);

/** The preview gallery block, anchored on its own count label. */
const previewRoot = (page: Page) => page
  .locator('p:visible', { hasText: new RegExp(`^${T['gallery.label']} \\(\\d+ `) })
  .first().locator('xpath=..');

/**
 * TL.GAL.6b — the NEWEST tile, and whether it is actually on screen.
 *
 * "In the DOM" is not "visible": the whole 6b defect was a staged photo that
 * mirrored perfectly and then sat ~5.7 tiles right of the filmstrip's window.
 * So this measures the tile against its nearest SCROLLING ancestor — the strip
 * in filmstrip/full, the editor's device-frame-scroll (or the window) in grid —
 * which is the fold that actually decides whether a creator sees the photo.
 *
 * Indexed at count-1, exactly as GalleryBlock's own scroll-to-newest targets it,
 * so the test and the code agree on which tile "newest" means (in filmstrip loop
 * mode the strip renders two copies, and count-1 is the first copy's last tile).
 */
const newestTile = (page: Page) => page.evaluate((word) => {
  const panel = document.querySelector('[class*="z-[120]"]');
  const label = [...document.querySelectorAll('p')].find(
    (p) => new RegExp(`^${word} \\(\\d+ `).test((p.textContent || '').trim())
      && p.getBoundingClientRect().width > 0 && !panel?.contains(p),
  );
  const count = Number(label?.textContent?.match(/\((\d+) /)?.[1] ?? 0);
  const root = label?.parentElement ?? null;
  const imgs = root ? [...root.querySelectorAll('img')].filter((i) => !panel?.contains(i)) : [];
  const el = imgs[count - 1] as HTMLImageElement | undefined;
  if (!el) return null;

  let sc = el.parentElement;
  while (sc) {
    const cs = getComputedStyle(sc);
    if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) break;
    sc = sc.parentElement;
  }
  const r = el.getBoundingClientRect();
  const cr = sc ? sc.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight);
  return {
    isStaged: (el.getAttribute('src') || '').startsWith('data:'),
    decoded: el.naturalWidth > 0,
    visible: r.right > cr.left + 1 && r.left < cr.right - 1
      && r.bottom > cr.top + 1 && r.top < cr.bottom - 1,
    tile: { l: Math.round(r.left), r: Math.round(r.right) },
    clip: { l: Math.round(cr.left), r: Math.round(cr.right) },
  };
}, T['gallery.label']);

/**
 * Pixels per second, measured off the live preview glide.
 *
 * Never touches the strip with a pointer: onPointerDown parks the glide for 8
 * seconds, so a stray click would measure a dead strip and report a confident
 * zero. Mirrors spec 43's measure, but finds the strip inside the preview
 * rather than by a known photo URL — half the photos here are staged and have
 * no URL to find them by.
 */
const measurePreview = (page: Page, ms = 3000) => page.evaluate(async ({ window_ms, word }) => {
  const panel = document.querySelector('[class*="z-[120]"]');
  const label = [...document.querySelectorAll('p')].find(
    (p) => new RegExp(`^${word} \\(\\d+ `).test((p.textContent || '').trim())
      && p.getBoundingClientRect().width > 0
      && !panel?.contains(p),
  );
  const el = label?.parentElement?.querySelector('[class*="overflow-x-auto"]') as HTMLElement | null;
  if (!el) return { pxPerSec: -1, moved: -1, clientWidth: 0 };
  const t0 = performance.now(), s0 = el.scrollLeft, oneCopy = el.scrollWidth / 2;
  await new Promise((r) => setTimeout(r, window_ms));
  const t1 = performance.now(), s1 = el.scrollLeft;
  // The strip wraps by exactly one copy width; a window that straddles the wrap
  // reads as a big negative jump, so put the lap back.
  let dx = s1 - s0;
  if (dx < 0) dx += oneCopy;
  return { pxPerSec: dx / ((t1 - t0) / 1000), moved: dx, clientWidth: el.clientWidth };
}, { window_ms: ms, word: T['gallery.label'] });

/**
 * Pin the gallery to the 'full' layout, and hand back an undo.
 *
 * openPanel reaches the editor through the "+" tile, and that tile exists ONLY
 * in the 'full' layout. Pinning it also gives every test here a DB value that
 * is DIFFERENT from what the draft will show, which is what makes "the preview
 * moved and the database did not" an observation rather than a coincidence.
 */
const pinFullLayout = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  const blocks = await sb<Array<{ id: string; title: string | null; srcs: string[] }>>(page, `
    const { data: rows } = await sb.from('blocks').select('id,title,type');
    const out = [];
    for (const b of (rows || []).filter(x => x.type === 'gallery')) {
      const { data } = await sb.from('block_items').select('image_url,order_index').eq('block_id', b.id);
      out.push({ id: b.id, title: b.title, srcs: (data || []).sort((x, y) => x.order_index - y.order_index).map(r => r.image_url) });
    }
    return out;`);
  // The account owns gallery blocks on more than one page; the one this editor
  // is showing is the one whose photos are in the DOM.
  let target: { id: string; title: string | null } | null = null;
  for (const b of blocks) {
    if (b.srcs.length && await page.locator(`img[src="${b.srcs[0]}"]`).count()) { target = b; break; }
  }
  if (!target) throw new Error('no gallery block is rendered in the editor');
  const { id, title } = target;
  await sb(page, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`,
    { id, t: JSON.stringify({ layout: 'full', autoScroll: true, speed: 'slow' }) });
  return {
    blockId: id,
    restore: async (p: Page) => {
      await sb(p, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`, { id, t: title });
    },
  };
};

const blockTitle = (page: Page, id: string) => sb<string | null>(
  page,
  `const { data } = await sb.from('blocks').select('title').eq('id', arg).single(); return data.title;`,
  id,
);

const openPanel = async (page: Page) => {
  await page.goto('/dashboard/editor');
  const plus = page.locator('button:visible').filter({ hasText: /^\+$/ }).first();
  await plus.waitFor({ timeout: 25_000 });
  await plus.scrollIntoViewIfNeeded();
  await plus.click();
  await expect(panelTiles(page).first()).toBeVisible({ timeout: 15_000 });
};

/** TL.GAL.1b harness note: a sonner toast parks over the panel footer and
 *  swallows the next click. Park the pointer away and let it clear first. */
const doSave = async (page: Page) => {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await panelOf(page).getByRole('button', { name: T['blockEditor.save'], exact: true }).click();
  await expect(panelOf(page).getByRole('button', { name: T['blockEditor.saving'] })).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(1200); // the post-save fetchPhotos() re-sync
};

/** A distinct, solid-coloured fixture, so a mis-ordered preview is legible in a
 *  screenshot rather than a diff of hashes. */
const stageUpload = async (page: Page, colour: string, name: string) => {
  const dataUrl = await page.evaluate((c) => {
    const cv = document.createElement('canvas');
    cv.width = 450; cv.height = 800;            // 9:16, the phone-photo shape
    const x = cv.getContext('2d')!;
    x.fillStyle = c; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = '#ffffff'; x.fillRect(0, cv.height * 0.45, cv.width, cv.height * 0.1);
    return cv.toDataURL('image/png');
  }, colour);
  const before = await panelTiles(page).count();
  await panelOf(page).locator('input[type="file"]').setInputFiles({
    name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
  });
  // Web-first, not a bare count(): setInputFiles resolves before React has
  // appended the staged tile, and on a phone that read lands one render early.
  await expect(panelTiles(page)).toHaveCount(before + 1);
};

/** Sweep every gallery row this spec created, row AND storage object. */
const sweep = (page: Page, keep: string[]) => sb<number>(page, `
  const { data: blocks } = await sb.from('blocks').select('*');
  const gal = (blocks || []).filter(b => b.type === 'gallery').map(b => b.id);
  const { data } = await sb.from('block_items').select('id,image_url').in('block_id', gal);
  const extra = (data || []).filter(r => !arg.keep.includes(r.id));
  for (const row of extra) {
    await sb.from('block_items').delete().eq('id', row.id);
    const path = (row.image_url || '').split('/products/')[1];
    // A blocked storage remove() resolves with data:[] and NO error, so the
    // count is the only honest signal that the object really went.
    if (path) await sb.storage.from('products').remove([decodeURIComponent(path)]);
  }
  return extra.length;`, { keep });

/** Put the account back even when a timeout has closed the page. */
const cleanup = async (
  page: Page,
  browser: { newContext: (o: object) => Promise<{ newPage: () => Promise<Page>; close: () => Promise<void> }> },
  work: (p: Page) => Promise<void>,
) => {
  try {
    await work(page);
  } catch {
    const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
    const rescue = await ctx.newPage();
    try {
      await rescue.goto('/dashboard/editor');
      await rescue.waitForTimeout(2500);
      await work(rescue);
    } finally {
      await ctx.close();
    }
  }
};

test.describe('TL.GAL.6 — the gallery panel mirrors into the preview before Save', () => {
  test('layout, auto-scroll and speed re-lay-out and re-rate the preview live, with the DB untouched', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    const { blockId, restore } = await pinFullLayout(page);

    try {
      await openPanel(page);

      // The DB says 'full' for the whole test. Every preview state below is
      // therefore the draft's doing and nothing else's.
      const asFull = await previewState(page);
      expect(asFull.strip, 'the full carousel is the DB-truth starting point').toBe(true);
      expect(asFull.grid).toBe(false);

      // ── layout: Grid.
      await panelOf(page).getByRole('button', { name: T['galleryEditor.layoutGrid'], exact: true }).click();
      await expect.poll(async () => (await previewState(page)).grid, {
        message: 'the preview re-lays-out to a grid on the chip tap',
      }).toBe(true);
      expect(await blockTitle(page, blockId), 'a layout chip writes nothing').toContain('"layout":"full"');

      // ── layout: Filmstrip, auto-scrolling. The loop renders every photo
      // TWICE (the wrap copy), which is the count telling us the preview really
      // took the filmstrip branch rather than merely keeping a scroller.
      await panelOf(page).getByRole('button', { name: T['galleryEditor.layoutFilmstrip'], exact: true }).click();
      await expect.poll(async () => {
        const s = await previewState(page);
        return s.srcs.length === s.labelCount * 2;
      }, { message: 'the auto-scrolling filmstrip renders its wrap copy' }).toBe(true);

      // ── speed. A tier is not a number in the DOM — it is a rate. Measure it.
      await panelOf(page).getByRole('button', { name: T['galleryEditor.speedSlow'], exact: true }).click();
      await page.waitForTimeout(1200);   // photos still decoding change scrollWidth
      const slow = await measurePreview(page);

      await panelOf(page).getByRole('button', { name: T['galleryEditor.speedFast'], exact: true }).click();
      await page.waitForTimeout(600);
      const fast = await measurePreview(page);

      console.log(`[${tag}] preview pre-Save: slow ${slow.pxPerSec.toFixed(1)} px/s → fast `
        + `${fast.pxPerSec.toFixed(1)} px/s · ratio ${(fast.pxPerSec / slow.pxPerSec).toFixed(2)} `
        + `· formula ${(TIER_MS.slow / TIER_MS.fast).toFixed(2)} · strip ${slow.clientWidth}px`);

      expect(slow.moved, 'the preview strip is actually gliding').toBeGreaterThan(20);
      expect(fast.moved, 'it is still gliding after the chip tap').toBeGreaterThan(20);
      // The chip really re-rated the preview: fast/slow lands on the tier ratio
      // (7000/3000 = 2.33), not on 1.0 — which is what a dead channel would give.
      expect(fast.pxPerSec / slow.pxPerSec, 'tapping Fast re-rates the preview before Save')
        .toBeGreaterThan((TIER_MS.slow / TIER_MS.fast) * 0.8);
      expect(fast.pxPerSec / slow.pxPerSec).toBeLessThan((TIER_MS.slow / TIER_MS.fast) * 1.2);

      // ── auto-scroll off collapses the wrap copy, live.
      // The toggle carries no text of its own — its label is a sibling span —
      // so it is reached by the pill geometry that makes it a switch.
      await panelOf(page).locator('button.w-\\[33px\\]').first().click();
      await expect.poll(async () => {
        const s = await previewState(page);
        return s.srcs.length === s.labelCount;
      }, { message: 'auto-scroll off drops the wrap copy' }).toBe(true);

      // …and after ALL of that, the row is still exactly what pinFullLayout set.
      expect(await blockTitle(page, blockId), 'not one config chip reached the database')
        .toBe(JSON.stringify({ layout: 'full', autoScroll: true, speed: 'slow' }));

      await page.screenshot({ path: `tests/screenshots/${tag}-gal6-config-draft.png` });
    } finally {
      await cleanup(page, browser, restore);
    }
  });

  test('staged adds (with crops), removes and order all mirror; Cancel reverts; Save commits once', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    const { restore } = await pinFullLayout(page);
    await openPanel(page);
    const baseline = await galleryItems(page);
    const baselineIds = baseline.map((i) => i.id);
    const baselineSrcs = baseline.map((i) => i.image_url);

    try {
      // ── (b) staged ADDS reach the preview with no row and no upload behind them.
      await stageUpload(page, '#C9A55C', 'tl-gal-6-gold.png');
      await stageUpload(page, '#2E6F9E', 'tl-gal-6-blue.png');

      await expect.poll(async () => (await previewState(page)).labelCount, {
        message: 'both staged photos are in the preview',
      }).toBe(baseline.length + 2);
      let pv = await previewState(page);
      expect(pv.srcs.filter((s) => s.startsWith('data:')), 'they render from the panel\'s own preview data')
        .toHaveLength(2);
      expect(await galleryItems(page), 'and nothing was inserted').toHaveLength(baseline.length);

      // ── a crop applied to a STAGED photo — one with no DB row to hang it on —
      // must reach the preview too.
      await panelTiles(page).last().click();
      await expect(sheetOf(page)).toBeVisible();
      await sheetOf(page).locator('input[type=range]').evaluate((el: HTMLInputElement) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(el, '2');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(400);
      await sheetOf(page).getByRole('button', { name: T['galleryEditor.cropApply'], exact: true }).click();
      await expect(sheetOf(page)).toHaveCount(0);

      await expect.poll(async () => (await previewState(page)).cropped.filter(Boolean).length, {
        message: 'the staged crop paints in the preview',
      }).toBeGreaterThan(baseline.filter((r) => !!(r.style_json)?.crop).length);

      // ── (c) staged REMOVE: gone from the preview, still in the database.
      const doomed = baselineSrcs[0];
      await panelOf(page).locator(`img[src="${doomed}"]`).first().hover();
      await panelOf(page).locator(`img[src="${doomed}"]`).first()
        .locator('xpath=following-sibling::button[2]').click();
      await expect.poll(async () => (await previewState(page)).srcs.includes(doomed), {
        message: 'the removed photo leaves the preview',
      }).toBe(false);
      expect((await galleryItems(page)).map((i) => i.image_url), 'but its row is untouched').toContain(doomed);

      // ── (d) ORDER. Desktop drives the real pointer drag; the mobile project is
      // a genuine touch device where page.mouse leaves dnd-kit's PointerSensor
      // path untaken, so it drives the KeyboardSensor instead (GAL.TOUCH
      // precedent — branch on the project, never test.skip: both must prove it).
      const orderBefore = (await previewState(page)).srcs;
      if (tag === 'desktop') {
        const from = (await grips(page).nth(0).boundingBox())!;
        const to = (await panelTiles(page).nth(1).boundingBox())!;
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 5 });
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
        await page.mouse.up();
      } else {
        // ArrowDOWN, not right: the "+" tile takes slot 0 of the two-column
        // grid, so the first photo sits top-RIGHT and has no neighbour to its
        // right for sortableKeyboardCoordinates to find.
        await grips(page).nth(0).focus();
        await page.keyboard.press('Space');     // lift
        await page.waitForTimeout(300);
        await page.keyboard.press('ArrowDown'); // one row along
        await page.waitForTimeout(300);
        await page.keyboard.press('Space');     // drop
      }
      await expect.poll(async () => (await previewState(page)).srcs, {
        message: 'the preview order follows the panel reorder',
      }).not.toEqual(orderBefore);

      await page.screenshot({ path: `tests/screenshots/${tag}-gal6-staged-draft.png` });

      // ── Cancel throws the whole draft away.
      await page.mouse.move(5, 5);
      await panelOf(page).getByRole('button', { name: T['blockEditor.cancel'], exact: true }).click();
      await expect(panelOf(page)).toHaveCount(0);
      await expect.poll(async () => (await previewState(page)).srcs, {
        message: 'the preview snaps back to DB truth',
      }).toEqual(baselineSrcs);
      expect(await galleryItems(page), 'and the database never moved').toHaveLength(baseline.length);
      await page.screenshot({ path: `tests/screenshots/${tag}-gal6-after-cancel.png` });

      // ── re-do and Save: the draft commits, and commits ONCE.
      await openPanel(page);
      await stageUpload(page, '#7A2E8E', 'tl-gal-6-violet.png');
      await doSave(page);

      const afterFirst = await galleryItems(page);
      expect(afterFirst, 'Save inserted exactly the staged photo').toHaveLength(baseline.length + 1);
      const created = afterFirst.filter((r) => !baselineIds.includes(r.id));
      expect(created).toHaveLength(1);
      expect(created[0].image_url).toMatch(/^https?:\/\//);
      expect(afterFirst.map((r) => r.order_index), 'order_index is committed from the array order')
        .toEqual(afterFirst.map((_, i) => i));

      // TL.GAL.1b: the panel stays mounted after Save, so a second Save runs
      // against the re-synced list. A re-upload would mint a NEW uuid filename.
      await doSave(page);
      const afterSecond = await galleryItems(page);
      expect(afterSecond, 'the second Save inserted nothing').toHaveLength(baseline.length + 1);
      expect(afterSecond.filter((r) => !baselineIds.includes(r.id))[0].image_url,
        'and re-uploaded nothing — the URL is byte-identical').toBe(created[0].image_url);

      // …and it survives a reload.
      await page.goto('/dashboard/editor');
      await page.waitForLoadState('networkidle');
      await expect.poll(async () => (await previewState(page)).labelCount, {
        message: 'the committed photo is there after a reload',
      }).toBe(baseline.length + 1);
    } finally {
      await cleanup(page, browser, async (p) => { await sweep(p, baselineIds); await restore(p); });
    }
  });

  test('a drafting panel owns its list: the preview trash stages, and on a phone there is no preview to reach', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    const { restore } = await pinFullLayout(page);
    await openPanel(page);
    const baseline = await galleryItems(page);
    const baselineIds = baseline.map((i) => i.id);
    const victim = baseline[0].image_url;

    try {
      // A draft has to be live for the interception to apply at all.
      await stageUpload(page, '#3E8E5A', 'tl-gal-6-green.png');

      // The panel is `w-full sm:w-[420px]`: on a phone it covers the preview
      // outright, so the two surfaces can never be edited at once and this
      // conflict simply has no phone-side existence. Pin that rather than
      // faking a gesture the surface cannot receive — the day the panel stops
      // covering the preview, the conflict appears and this fails.
      if (tag !== 'desktop') {
        const reach = await page.evaluate((src) => {
          const panel = document.querySelector('[class*="z-[120]"]')!;
          // The zero-width one is the CSS-hidden sibling EditableProfileView;
          // hit-testing its collapsed rect at the origin would read the page
          // header and call the preview "reachable".
          const img = [...document.querySelectorAll('img')].find(
            (i) => i.getAttribute('src') === src && !panel.contains(i)
              && i.getBoundingClientRect().width > 0,
          );
          if (!img) return 'no preview tile';
          const r = img.getBoundingClientRect();
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          if (cy < 0 || cy > innerHeight || cx < 0 || cx > innerWidth) return 'offscreen';
          return panel.contains(document.elementFromPoint(cx, cy)) ? 'panel' : 'reachable';
        }, victim);
        expect(['panel', 'offscreen'], `the open panel leaves no reachable preview trash (got: ${reach})`)
          .toContain(reach);
        await page.screenshot({ path: `tests/screenshots/${tag}-gal6-panel-covers-preview.png` });
        return;
      }

      // The preview's own trash, on a photo that DOES have a row and a storage
      // object. Outside a draft this is an immediate, permanent delete.
      const tile = page.locator(`img[src="${victim}"]:visible`).first();
      await tile.scrollIntoViewIfNeeded();
      await tile.hover();
      await tile.locator('xpath=following-sibling::button').first().click();
      await page.getByRole('button', { name: T['editor.photo.confirmYes'], exact: true }).click();

      await expect.poll(async () => (await previewState(page)).srcs.includes(victim), {
        message: 'the tile leaves the preview',
      }).toBe(false);
      // The panel is the draft of record, so the removal has to have landed
      // THERE — otherwise its next publish would resurrect the photo.
      await expect(panelOf(page).locator(`img[src="${victim}"]`)).toHaveCount(0);
      // …and the row and its file are still there, because the panel's Save
      // owns that decision and its Cancel has to be able to undo it.
      expect((await galleryItems(page)).map((r) => r.image_url),
        'a drafted photo is STAGED for removal, not deleted').toContain(victim);
      await page.screenshot({ path: `tests/screenshots/${tag}-gal6-preview-trash-staged.png` });

      // Cancel proves it really was only staged.
      await page.mouse.move(5, 5);
      await panelOf(page).getByRole('button', { name: T['blockEditor.cancel'], exact: true }).click();
      await expect(panelOf(page)).toHaveCount(0);
      await expect.poll(async () => (await previewState(page)).srcs.includes(victim), {
        message: 'Cancel brings the staged-for-removal photo back',
      }).toBe(true);
      expect(await galleryItems(page)).toHaveLength(baseline.length);
    } finally {
      await cleanup(page, browser, async (p) => { await sweep(p, baselineIds); await restore(p); });
    }
  });

  // ── TL.GAL.6b ────────────────────────────────────────────────────────────
  // The design law: the preview is the truth of what Save will produce, so a
  // staged photo has to be visible and reachable — in every layout, through
  // every door. Both halves of that were broken and neither was caught above,
  // because the tests pinned the one layout and drove the one door that worked.

  test('a staged add lands ON SCREEN in every layout, and opens in the lightbox', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    const { restore } = await pinFullLayout(page);
    await openPanel(page);
    const baseline = await galleryItems(page);
    const baselineIds = baseline.map((i) => i.id);

    try {
      const layouts = [
        { key: 'full', chip: T['galleryEditor.layoutFull'], colour: '#C9A55C' },
        { key: 'filmstrip', chip: T['galleryEditor.layoutFilmstrip'], colour: '#2E6F9E' },
        { key: 'grid', chip: T['galleryEditor.layoutGrid'], colour: '#3E8E5A' },
      ] as const;

      for (const { key, chip, colour } of layouts) {
        await panelOf(page).getByRole('button', { name: chip, exact: true }).click();
        await page.waitForTimeout(700);
        await stageUpload(page, colour, `tl-gal-6b-${key}.png`);
        await page.waitForTimeout(1000);

        const t0 = await newestTile(page);
        console.log(`[${tag}] ${key}: ${JSON.stringify(t0)}`);
        expect(t0, `${key}: the staged add reached the preview`).not.toBeNull();
        expect(t0!.isStaged, `${key}: the newest tile IS the staged photo`).toBe(true);
        expect(t0!.decoded, `${key}: the staged photo decoded`).toBe(true);
        // The 6b defect in one assertion: mirrored is not the same as seen.
        expect(t0!.visible, `${key}: the staged add is on screen, not parked off it`).toBe(true);

        if (key === 'filmstrip') {
          // The tile lands flush against the window's left edge — proving the
          // jump targeted the right pixel, not merely somewhere overlapping.
          expect(Math.abs(t0!.tile.l - t0!.clip.l),
            'filmstrip: the new photo is parked AT the window edge').toBeLessThan(6);
          // And it STAYS. The glide owns scrollLeft and rewrites it every frame,
          // so this only holds because the fix parks the glide first; without
          // the pause the strip carries the new photo straight back off-screen.
          await page.waitForTimeout(2500);
          const t1 = await newestTile(page);
          expect(t1!.visible, 'the glide stays parked on the photo just added').toBe(true);
          expect(Math.abs(t1!.tile.l - t0!.tile.l),
            'the glide is paused, not merely slow — the tile has not drifted').toBeLessThan(6);
        }
      }

      await page.screenshot({ path: `tests/screenshots/${tag}-gal6b-grid-staged-visible.png` });

      // ── the lightbox is not a saved-photos-only surface either.
      //
      // Desktop only, and not for convenience: on a phone the panel is `w-full`
      // and covers the preview outright (pinned by the trash test above), so
      // there is no preview tile to tap while a draft is live — the gesture has
      // no phone-side existence. The geometry above is what mobile can prove,
      // and it is the half the layout fix actually changes.
      if (tag !== 'desktop') {
        expect(await galleryItems(page), 'three staged adds, zero rows').toHaveLength(baseline.length);
        return;
      }

      const count = (await previewState(page)).labelCount;
      await previewRoot(page).locator('img').nth(count - 1).click();
      const lb = page.locator('[class*="z-[130]"]');
      await expect(lb).toBeVisible();
      const shown = await lb.evaluate((el) => {
        const imgs = [...el.querySelectorAll('img')] as HTMLImageElement[];
        const strip = el.querySelector('[class*="overflow-x-auto"]') as HTMLElement;
        const i = Math.round(strip.scrollLeft / strip.clientWidth);
        const img = imgs[i];
        return {
          slides: imgs.length,
          index: i,
          staged: (img?.getAttribute('src') || '').startsWith('data:'),
          fit: img ? getComputedStyle(img).objectFit : null,
          decoded: !!img && img.naturalWidth > 0,
        };
      });
      console.log(`[${tag}] lightbox: ${JSON.stringify(shown)}`);
      expect(shown.slides, 'the viewer carries the staged photos too').toBe(count);
      expect(shown.staged, 'tapping a staged tile opens the viewer ON that photo').toBe(true);
      expect(shown.decoded, 'and it renders there').toBe(true);
      expect(shown.fit, 'contained, like any other photo — a crop frames the tile, not this').toBe('contain');
      await page.screenshot({ path: `tests/screenshots/${tag}-gal6b-lightbox-staged.png` });
      await page.keyboard.press('Escape');
      await expect(lb).toHaveCount(0);

      // Nothing above touched the database.
      expect(await galleryItems(page), 'three staged adds, zero rows').toHaveLength(baseline.length);
    } finally {
      await cleanup(page, browser, async (p) => { await sweep(p, baselineIds); await restore(p); });
    }
  });

  test('the section-list door mirrors too, not only the doors that route through onBlockEdit', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    const { restore } = await pinFullLayout(page);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    const baseline = await galleryItems(page);
    const baselineIds = baseline.map((i) => i.id);

    try {
      // "Edit Profile" → the Add Content section list → the Gallery row. This
      // door sets ProfileDashboard's activeBlockId directly and never calls
      // onBlockEdit, so Editor's editingBlock stays null. Before TL.GAL.6b the
      // draft was scoped by that null and discarded outright: the panel staged
      // the photo and the preview never moved. Measured — see TL.GAL.6.DIAG.
      //
      // NOT the preview's "+ Add Content" buttons: those are per-block
      // empty-state CTAs (Bio, Video Feeds, Email Capture all render one) and
      // each opens its OWN editor. Only the header button opens the list.
      await page.getByRole('button', { name: T['dashLayout.editProfile'], exact: true }).first().click();
      await page.waitForTimeout(1200);
      // Row text is title+description run together ("GalleryPhoto gallery").
      await panelOf(page).locator('button:visible')
        .filter({ hasText: new RegExp(`^${T['blocks.gallery.title']}`) }).first().click();
      await expect(panelTiles(page).first()).toBeVisible({ timeout: 15_000 });

      const before = await previewState(page);
      await stageUpload(page, '#7A2E8E', 'tl-gal-6b-doorC.png');

      await expect.poll(async () => (await previewState(page)).labelCount, {
        message: 'the section-list door mirrors its draft like every other door',
      }).toBe(before.labelCount + 1);
      const pv = await previewState(page);
      expect(pv.srcs.some((s) => s.startsWith('data:')), 'the staged photo is rendering').toBe(true);
      expect(await galleryItems(page), 'and still nothing is saved').toHaveLength(baseline.length);
      await page.screenshot({ path: `tests/screenshots/${tag}-gal6b-door-c-mirrors.png` });
    } finally {
      await cleanup(page, browser, async (p) => { await sweep(p, baselineIds); await restore(p); });
    }
  });
});

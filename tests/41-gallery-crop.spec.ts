// TL.GAL.3b — per-photo gallery framing (door B).
//
// The geometry itself is exhaustively unit-tested in scripts/gallery-framing.test.mjs.
// This spec covers the WIRING those unit tests cannot see:
//
//   1. the sheet's zoom floor is GALLERY_MIN_ZOOM in BOTH places it appears —
//      the Cropper's minZoom and the slider's min. Two independent floors drift,
//      and then the slider dials a zoom the cropper refuses. TL.GAL.3b.1 makes
//      that floor COVER-FIT: the photo can never be pulled small enough, or far
//      enough, to show tile background, which only the live UI can prove;
//   2. a crop survives the round trip staged → saved → RE-saved → reloaded. The
//      re-save is the TL.GAL.1b landmine: GalleryEditor re-syncs from the DB
//      after every save (the panel stays mounted, so the fetch effect never
//      re-runs), and anything that mapper drops is silently lost on Save #2;
//   3. Reset stores the suggested framing as ABSENCE, so an unframed photo goes
//      back to the plain object-cover render path byte-for-byte.
//
// The journey works on a photo this spec uploads itself and deletes in a
// finally — the shared test account's own photos are never mutated.
import { test, expect, allowWrites, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { GALLERY_MIN_ZOOM, resolveGalleryGeometry } from '../src/lib/gallery-framing';

// TL.ISO.2 write opt-in — this spec REALLY writes: the panel upload POSTs the
// photo to the products bucket, GalleryEditor's Save inserts/updates
// block_items and rewrites blocks.title (the layout config), and the
// finally-sweep deletes the row + storage object again.
test.beforeEach(async ({ page }) => {
  await allowWrites(page, ['rest/v1/blocks', 'rest/v1/block_items', 'storage/v1/object/products']);
});

const T = translations.en;
const BASELINE_CLASS = 'absolute inset-0 w-full h-full object-cover';
/** The uploaded fixture: 9:16 — the phone-photo shape, and the hardest case for
 *  TL.GAL.3b.1. At the cover-fit floor it WIDTH-fills the square frame and pans
 *  vertically only; 7/16 of its height is always outside the crop. */
const FIXTURE = { w: 450, h: 800 };

const panelOf = (page: Page) => page.locator('[class*="z-[120]"]');
const sheetOf = (page: Page) => page.locator('[class*="z-[150]"]');
/** Tiles inside the editor panel (the preview's tiles are alt="Photo"). */
const panelTiles = (page: Page) => panelOf(page).locator(`img[alt="${T['galleryEditor.photoAlt']}"]`);

/** Run a supabase query with the app's own client (RLS as the signed-in user).
 *  Re-imported per call: every navigation wipes anything cached on window. */
const sb = <T,>(page: Page, fn: string, arg?: unknown): Promise<T> => page.evaluate(
  async ({ body, a }) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
  },
  { body: fn, a: arg ?? null },
);

/**
 * The rows of ONE gallery block — the one this editor is showing.
 *
 * TL.ISO.4b: this used to read every gallery block it could see and treat the
 * total as "the account's photos". `blocks` and `block_items` both carry a
 * `FOR SELECT USING (true)` policy — public pages have to render for anonymous
 * visitors — so `.select('*')` with no filter returns every public page's rows
 * IN THE WHOLE DATABASE, not the signed-in account's. That was invisible while
 * the battery ran as the account that happened to own the only seeded gallery;
 * TL.ISO.1 moved the battery to its own account and the read started counting
 * somebody else's photos too (13 rows against a 5-photo gallery). Scoped to the
 * block under test it is right by construction, and stays right whatever the
 * canonical tree holds.
 */
const galleryItems = (page: Page, blockId: string) =>
  sb<Array<{ id: string; image_url: string; style_json: any; order_index: number }>>(
    page,
    `const { data } = await sb.from('block_items')
       .select('id,image_url,style_json,order_index').eq('block_id', arg);
     return (data || []).sort((a, b) => a.order_index - b.order_index);`,
    blockId,
  );

/**
 * Pin the gallery to the 'full' layout, and hand back an undo.
 *
 * This spec must NOT inherit whatever layout the account happens to be sitting
 * on. openPanel reaches the editor through the "+" tile, and that tile exists
 * ONLY in the 'full' layout — on filmstrip or grid every test here dies on a
 * 25s waitFor with nothing to say about why. (Observed: a live-testing session
 * left the page on filmstrip and took all four tests down at once.)
 *
 * The original title string goes back verbatim, so a creator's own layout,
 * auto-scroll and speed survive a test run untouched.
 */
const pinFullLayout = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  const blocks = await sb<Array<{ id: string; title: string | null; srcs: string[] }>>(page, `
    // PW-SCOPED-READS ok: discovery - the DOM discriminator below picks the block.
    const { data: rows } = await sb.from('blocks').select('id,title,type');
    const out = [];
    for (const b of (rows || []).filter(x => x.type === 'gallery')) {
      const { data } = await sb.from('block_items').select('image_url,order_index').eq('block_id', b.id);
      out.push({ id: b.id, title: b.title, srcs: (data || []).sort((x, y) => x.order_index - y.order_index).map(r => r.image_url) });
    }
    return out;`);
  // This read is deliberately unscoped — `blocks` is world-readable, so it can
  // see gallery blocks belonging to other accounts' public pages as well as
  // this one's several modes. It self-corrects: the block this editor is
  // showing is the one whose FIRST photo is actually in the DOM, and only that
  // block's id is carried forward. (TL.ISO.4b: the reads that did NOT have that
  // discriminator are the ones that broke when the battery moved accounts.)
  let target: { id: string; title: string | null } | null = null;
  for (const b of blocks) {
    if (b.srcs.length && await page.locator(`img[src="${b.srcs[0]}"]`).count()) { target = b; break; }
  }
  if (!target) throw new Error('no gallery block is rendered in the editor');
  const { id, title } = target;
  await sb(page, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`,
    { id, t: JSON.stringify({ layout: 'full', autoScroll: true, speed: 'slow' }) });
  return {
    /** Every DB read and the sweep scope to this block — never "all galleries". */
    blockId: id,
    restore: async (p: Page) => {
      await sb(p, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`, { id, t: title });
    },
  };
};

const openPanel = async (page: Page) => {
  await page.goto('/dashboard/editor');
  // Door A (TL.GAL.1): the "+" tile at the end of the 'full' carousel, which
  // pinFullLayout guarantees is the layout in play. Two EditableProfileViews
  // are mounted (desktop + mobile), only one laid out.
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

/** Geometry the tile is actually painting, parsed off its inline style. */
const tileGeometry = (tile: ReturnType<Page['locator']>) => tile.evaluate((el) => {
  const s = (el as HTMLElement).style;
  return s.width
    ? { widthPct: parseFloat(s.width), heightPct: parseFloat(s.height), leftPct: parseFloat(s.left), topPct: parseFloat(s.top) }
    : null;
});

/**
 * Drag the photo inside the frame.
 *
 * GAL.TOUCH precedent: the mobile project is a REAL touch device (WebKit,
 * hasTouch), and page.mouse leaves react-easy-crop's onMouseDown path untaken
 * there — the window comes back dead centre. So drive the interaction each
 * project actually supports: mouse on desktop, touch on mobile. Branch on the
 * project name, never test.skip — both surfaces must prove the pan.
 */
const panBy = async (page: Page, dx: number, dy: number, touch: boolean) => {
  const box = (await sheetOf(page).locator('.reactEasyCrop_CropArea').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (!touch) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 15 });
    await page.mouse.up();
  } else {
    await sheetOf(page).locator('.reactEasyCrop_Container').evaluate(
      async (el, { cx: x, cy: y, dx: mx, dy: my }) => {
        // WebKit has no `Touch`/`TouchEvent` constructor, so build a plain
        // Event and hang the touch lists off it. react-easy-crop only ever
        // reads touches.length and touches[0].clientX/Y, and React's synthetic
        // event proxies straight through to the native one.
        const fire = (type: string, px: number, py: number) => {
          const ev: any = new Event(type, { bubbles: true, cancelable: true });
          const list = type === 'touchend' ? [] : [{ clientX: px, clientY: py, identifier: 1, target: el }];
          for (const k of ['touches', 'targetTouches']) Object.defineProperty(ev, k, { value: list });
          Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: px, clientY: py, identifier: 1, target: el }] });
          el.dispatchEvent(ev);
        };
        fire('touchstart', x, y);
        for (let i = 1; i <= 15; i++) {
          fire('touchmove', x + (mx * i) / 15, y + (my * i) / 15);
          await new Promise((r) => setTimeout(r, 25));
        }
        fire('touchend', x + mx, y + my);
      },
      { cx, cy, dx, dy },
    );
  }
  await page.waitForTimeout(500);
};

/** Screenshot the PANEL with the photo in question scrolled into view — a bare
 *  page.screenshot() captures the same above-the-fold chrome every time and the
 *  four states come out byte-identical, proving nothing. */
const shotPanel = async (page: Page, path: string) => {
  await panelTiles(page).last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await panelOf(page).screenshot({ path });
};

/**
 * The photo's rectangle against the crop frame's, both in viewport pixels.
 *
 * TL.GAL.3b.1's whole ruling is a statement about these two boxes: the photo
 * must cover the frame, always. Reading them off the live DOM is the only way
 * to see the Cropper's own clamping (minZoom + restrictPosition) at work — the
 * stored percentages are downstream of it, and the resolver's clamp would mask
 * a cropper that had let the photo float.
 */
const frameFit = async (page: Page) => {
  const img = (await sheetOf(page).locator('.reactEasyCrop_Image').boundingBox())!;
  const area = (await sheetOf(page).locator('.reactEasyCrop_CropArea').boundingBox())!;
  return {
    /** Slack on each edge: >= 0 means the photo reaches past the frame there. */
    left: area.x - img.x,
    top: area.y - img.y,
    right: (img.x + img.width) - (area.x + area.width),
    bottom: (img.y + img.height) - (area.y + area.height),
    widthRatio: img.width / area.width,
    heightRatio: img.height / area.height,
  };
};

/** Every edge of the frame is inside the photo. One subpixel of tolerance —
 *  the frame is centred on fractional container sizes. */
const expectNoBackground = (fit: Awaited<ReturnType<typeof frameFit>>, when: string) => {
  for (const [edge, slack] of Object.entries(fit)) {
    if (edge.endsWith('Ratio')) continue;
    expect(slack, `${when}: the photo must reach past the frame's ${edge} edge`).toBeGreaterThan(-1);
  }
};

const setZoom = async (page: Page, value: number) => {
  const slider = sheetOf(page).locator('input[type=range]');
  await slider.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(400);
};

test.describe('TL.GAL.3b — gallery photo framing', () => {
  test('the sheet offers one zoom range, a 1:1 frame, and mutates nothing on Cancel', async ({ page }) => {
    const { blockId, restore: restoreLayout } = await pinFullLayout(page);
    try {
    await openPanel(page);
    const before = await galleryItems(page, blockId);

    await panelTiles(page).first().click();
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();

    // (1) ONE floor. The slider's min and the Cropper's minZoom are the same
    // constant — a saved crop seeds through getInitialCropFromCropped-
    // AreaPercentages, which CLAMPS to minZoom, so a higher floor here would
    // silently rewrite the user's framing on reopen.
    const slider = sheet.locator('input[type=range]');
    await expect(slider).toHaveAttribute('min', String(GALLERY_MIN_ZOOM));
    expect(GALLERY_MIN_ZOOM, 'TL.GAL.3b.1: the floor is cover-fit, never below it').toBe(1);

    // (2) The frame is square, because the tile it feeds is square.
    const frame = await sheet.locator('.reactEasyCrop_CropArea').boundingBox();
    expect(frame!.width / frame!.height).toBeCloseTo(1, 2);

    // (2b) And whatever this account's first photo is shaped like, it opens
    // already covering that frame — the floor IS the suggested framing.
    expectNoBackground(await frameFit(page), 'on open');

    // (3) The whole control set is present and reachable.
    for (const name of [T['galleryEditor.cropReset'], T['galleryEditor.cropApply'], T['blockEditor.cancel']]) {
      await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
    }

    await sheet.getByRole('button', { name: T['blockEditor.cancel'], exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(await galleryItems(page, blockId), 'opening and cancelling writes nothing').toEqual(before);
    } finally {
      await restoreLayout(page);
    }
  });

  test('a crop survives staged → saved → re-saved → reloaded, and Reset clears it', async ({ page, browser }, testInfo) => {
    // A real journey: upload, frame, save, re-save, reload, reopen, reset, save.
    // WebKit plus a stepped drag runs past the 30s default on its own.
    test.slow();
    const tag = testInfo.project.name;
    const { blockId, restore: restoreLayout } = await pinFullLayout(page);
    await openPanel(page);
    const baseline = await galleryItems(page, blockId);
    const baselineIds = new Set(baseline.map((i) => i.id));
    let createdId: string | null = null;

    try {
      // ── stage a photo of our own, so no real gallery item is ever touched.
      const dataUrl = await page.evaluate(({ w, h }) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d')!;
        // A gradient + a marker band: any stretch or mis-offset is visible.
        const g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#C9A55C'); g.addColorStop(1, '#0e0c09');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.fillStyle = '#ffffff'; x.fillRect(0, h * 0.45, w, h * 0.1);
        return c.toDataURL('image/png');
      }, FIXTURE);
      await panelOf(page).locator('input[type="file"]').setInputFiles({
        name: 'tl-gal-3b-fixture.png',
        mimeType: 'image/png',
        buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
      });

      const staged = panelTiles(page).last();
      // Web-first, not a bare count(): setInputFiles resolves before React has
      // appended the staged tile, and on a phone that read lands one render
      // early often enough to flake the whole journey.
      await expect(panelTiles(page)).toHaveCount(baseline.length + 1);
      await expect(staged).toBeVisible();
      expect(await staged.getAttribute('class'), 'an unframed photo starts on the plain object-cover path').toBe(BASELINE_CLASS);

      // ── frame it. First, TL.GAL.3b.1's floor, on the 9:16 shape that shows it
      // most plainly: the photo opens WIDTH-filled — exactly as wide as the
      // square frame, 16/9 as tall — so the only gesture available is a
      // vertical pan and no tile background is reachable.
      await staged.click();
      const sheet = sheetOf(page);
      await expect(sheet).toBeVisible();
      const floor = await frameFit(page);
      expect(floor.widthRatio, 'a 9:16 photo snaps to width-fill at the floor').toBeCloseTo(1, 1);
      expect(floor.heightRatio, 'and overflows the frame vertically').toBeCloseTo(FIXTURE.h / FIXTURE.w, 1);
      expectNoBackground(floor, 'at the floor');
      await sheet.screenshot({ path: `tests/screenshots/${tag}-gal3b1-0-fill-floor.png` });

      // The floor is a floor: the slider cannot dial below it, and dragging
      // hard at it pins the photo against an edge instead of pulling it clear.
      await setZoom(page, GALLERY_MIN_ZOOM - 0.6);
      expect(Number(await sheet.locator('input[type=range]').inputValue()),
        'the slider refuses to go below cover-fit').toBeCloseTo(GALLERY_MIN_ZOOM, 3);
      await panBy(page, 0, 400, tag === 'mobile');
      const shoved = await frameFit(page);
      expectNoBackground(shoved, 'after shoving the photo down at the floor');
      expect(shoved.top, 'the pan stops with the photo flush against the frame').toBeLessThan(1);

      // Back to the suggested framing, then frame for real: zoom in and drag
      // the image DOWN so the window rides up.
      await sheet.getByRole('button', { name: T['galleryEditor.cropReset'], exact: true }).click();
      await page.waitForTimeout(400);
      await setZoom(page, 2);

      await panBy(page, 0, 60, tag === 'mobile');
      expectNoBackground(await frameFit(page), 'after framing');
      await sheet.getByRole('button', { name: T['galleryEditor.cropApply'], exact: true }).click();
      await expect(sheet).toHaveCount(0);

      // Staged, not saved: the tile paints the crop through the same resolver
      // the live page uses, which is what makes "Cancel discards" observable.
      expect(await staged.getAttribute('class')).toBe('absolute object-cover');
      const stagedGeo = await tileGeometry(staged);
      expect(stagedGeo).not.toBeNull();
      expect(await galleryItems(page, blockId), 'Apply stages only — nothing is written yet').toEqual(baseline);

      // ── save #1
      await doSave(page);
      let items = await galleryItems(page, blockId);
      const created = items.filter((i) => !baselineIds.has(i.id));
      expect(created, 'exactly one row was inserted').toHaveLength(1);
      createdId = created[0].id;
      const crop = created[0].style_json?.crop;
      expect(crop, 'the insert path carries style_json.crop').toBeTruthy();

      // Zoom 2 halves the window; the drag moved it off-centre vertically.
      const cover = { w: 100, h: (FIXTURE.w / FIXTURE.h) * 100 };
      expect(crop.w).toBeCloseTo(cover.w / 2, 1);
      expect(crop.h).toBeCloseTo(cover.h / 2, 1);
      expect(crop.y, 'dragging the photo down rides the window up the image')
        .toBeLessThan((100 - cover.h / 2) / 2 - 1);

      // TL.GAL.3b.1's four inequalities, as actually written to the database.
      expect(crop.x, 'the stored window starts inside the photo').toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.w, 'and ends inside it').toBeLessThanOrEqual(100);
      expect(crop.y + crop.h).toBeLessThanOrEqual(100);

      // What the tile paints IS what the resolver computes from the stored crop.
      const want = resolveGalleryGeometry({ crop })!;
      const savedGeo = await tileGeometry(panelTiles(page).last());
      expect(savedGeo!.widthPct).toBeCloseTo(want.widthPct, 1);
      expect(savedGeo!.heightPct).toBeCloseTo(want.heightPct, 1);
      expect(savedGeo!.leftPct).toBeCloseTo(want.leftPct, 1);
      expect(savedGeo!.topPct).toBeCloseTo(want.topPct, 1);
      await shotPanel(page, `tests/screenshots/${tag}-gal3b-1-cropped.png`);

      // ── save #2: the TL.GAL.1b landmine. The panel stays mounted and re-syncs
      // from the DB after save #1; if that mapper drops style_json, this save
      // writes the crop straight back to null.
      await doSave(page);
      items = await galleryItems(page, blockId);
      expect(items.filter((i) => !baselineIds.has(i.id)), 'no duplicate insert').toHaveLength(1);
      expect(items.find((i) => i.id === createdId)!.style_json?.crop, 'the crop survives a second save').toEqual(crop);

      // ── reload: the live page paints it from the DB, not from editor state.
      await page.reload();
      const liveImg = page.locator(`img[src="${created[0].image_url}"]:visible`).first();
      await liveImg.waitFor({ timeout: 20_000 });
      const liveGeo = await tileGeometry(liveImg);
      expect(liveGeo!.widthPct, 'the live page reframes from the stored crop').toBeCloseTo(want.widthPct, 1);
      expect(liveGeo!.topPct).toBeCloseTo(want.topPct, 1);

      // ── reopen: the saved framing seeds the cropper back, not a fresh cover.
      await openPanel(page);
      await panelTiles(page).last().click();
      await expect(sheetOf(page)).toBeVisible();
      // Web-first, not a bare inputValue(): the sheet mounts with the slider at
      // the floor and only seeds the SAVED zoom once react-easy-crop has the
      // image's natural size (onMediaLoaded → getInitialCropFromCropped-
      // AreaPercentages). Everywhere else in this journey the photo is a staged
      // data URL that is decoded before the sheet opens; here it is a remote
      // storage object on a cold cache, and a single read lands on the 1 that
      // is about to become a 2.
      await expect.poll(
        async () => Number(await sheetOf(page).locator('input[type=range]').inputValue()),
        { message: 'the saved zoom seeds the reopened cropper' },
      ).toBeCloseTo(2, 1);
      expectNoBackground(await frameFit(page), 'on reopen');
      await sheetOf(page).screenshot({ path: `tests/screenshots/${tag}-gal3b-2-reopened.png` });

      // ── Reset returns to the suggested framing, and stores it as ABSENCE.
      await sheetOf(page).getByRole('button', { name: T['galleryEditor.cropReset'], exact: true }).click();
      await page.waitForTimeout(400);
      expect(Number(await sheetOf(page).locator('input[type=range]').inputValue())).toBeCloseTo(1, 3);
      await sheetOf(page).getByRole('button', { name: T['galleryEditor.cropApply'], exact: true }).click();
      await expect(sheetOf(page)).toHaveCount(0);
      expect(await panelTiles(page).last().getAttribute('class'),
        'back on the plain object-cover path, byte for byte').toBe(BASELINE_CLASS);

      await doSave(page);
      const cleared = (await galleryItems(page, blockId)).find((i) => i.id === createdId)!;
      expect(cleared.style_json?.crop, 'the suggested framing is stored as no crop at all').toBeUndefined();
      await shotPanel(page, `tests/screenshots/${tag}-gal3b-3-reset.png`);
    } finally {
      // Delete the photo this spec created — row AND storage object — so the
      // shared account is left exactly as it was found. A test TIMEOUT closes
      // the page out from under this block, so fall back to a fresh context:
      // otherwise a slow run silently leaves a stray photo on a real account.
      // Scoped to the block under test, for the same reason galleryItems() is:
      // an unfiltered read here would have this sweep iterating over OTHER
      // accounts' public gallery rows and calling delete() on them.
      const sweep = async (p: Page) => sb<number>(p, `
        const { data } = await sb.from('block_items').select('id,image_url').eq('block_id', arg.blockId);
        const extra = (data || []).filter(r => !arg.keep.includes(r.id));
        for (const row of extra) {
          await sb.from('block_items').delete().eq('id', row.id);
          const path = (row.image_url || '').split('/products/')[1];
          // A blocked storage remove() resolves with data:[] and NO error, so
          // the count is the only honest signal that the object really went.
          if (path) await sb.storage.from('products').remove([decodeURIComponent(path)]);
        }
        return extra.length;
      `, { keep: [...baselineIds], blockId });

      try {
        await sweep(page);
        await restoreLayout(page);
      } catch {
        const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
        const rescue = await ctx.newPage();
        try {
          await rescue.goto('/dashboard/editor');
          await rescue.waitForTimeout(2500);
          await sweep(rescue);
          await restoreLayout(rescue);
        } finally {
          await ctx.close();
        }
      }
    }
  });
});

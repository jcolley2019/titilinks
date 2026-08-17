// TL.GAL.3b.2 — lightbox navigation.
//
// The fullscreen viewer walks the whole gallery without closing. Four claims,
// none of which a unit test can see, because every one of them is about a real
// scroll container in a real browser:
//
//   1. it opens on the photo that was TAPPED, not on the first one, and it does
//      that from all three gallery layouts;
//   2. the chevrons step one photo at a time and WRAP (TL.GAL.3b.3): past the
//      last photo is the first, before the first is the last, so neither
//      chevron is ever at an end and neither is ever disabled. The inline
//      carousel deliberately keeps clamping — that difference is the ruling,
//      not an oversight, so this spec pins the viewer's half of it;
//   3. the keyboard drives it too (←/→, and Escape closes, since the backdrop
//      does not);
//   4. the photo shown is the UNCROPPED original: `style_json.crop` frames the
//      square tile only, and the lightbox is where the rest of the photo lives.
//
// Every test restores whatever it changed — this runs against a real account.
import { test, expect, type Page } from '@playwright/test';
import { translations } from '../src/hooks/useLanguage';

const T = translations.en;
const HANDLE = '/joeyc';

/** Run a supabase query with the app's own client (RLS as the signed-in user).
 *  Re-imported per call: every navigation wipes anything cached on window. */
const sb = <T,>(page: Page, fn: string, arg?: unknown): Promise<T> => page.evaluate(
  async ({ body, a }) => {
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
  },
  { body: fn, a: arg ?? null },
);

interface GalleryItem { id: string; image_url: string; style_json: any; order_index: number }
interface GalleryBlock { id: string; title: string | null; items: GalleryItem[] }

/**
 * The gallery block the PUBLIC page is actually rendering.
 *
 * The account can own blocks on more than one page, so picking "the first
 * gallery row" would happily hand back a block that is nowhere on screen and
 * every assertion below would then be about the wrong photos. Match by a src
 * the page is really showing instead.
 */
const liveGallery = async (page: Page): Promise<GalleryBlock> => {
  const all = await sb<GalleryBlock[]>(page, `
    const { data: blocks } = await sb.from('blocks').select('id,title,type');
    const gal = (blocks || []).filter(b => b.type === 'gallery');
    const out = [];
    for (const b of gal) {
      const { data } = await sb.from('block_items').select('id,image_url,style_json,order_index').eq('block_id', b.id);
      out.push({ id: b.id, title: b.title, items: (data || []).sort((x, y) => x.order_index - y.order_index) });
    }
    return out;`);
  for (const g of all) {
    if (g.items.length && await page.locator(`img[src="${g.items[0].image_url}"]`).count()) return g;
  }
  throw new Error('no gallery block is rendered on the public page');
};

const setLayout = (page: Page, blockId: string, title: string | null) =>
  sb(page, `await sb.from('blocks').update({ title: arg.title }).eq('id', arg.id);`, { id: blockId, title });

const viewer = (page: Page) => page.locator('[class*="z-[130]"]');
/** The horizontal strip inside the viewer — one full-width slide per photo. */
const strip = (page: Page) => viewer(page).locator('.overflow-x-auto').first();
const nextBtn = (page: Page) => viewer(page).getByRole('button', { name: T['gallery.nextPhoto'] });
const prevBtn = (page: Page) => viewer(page).getByRole('button', { name: T['gallery.prevPhoto'] });

/** Which photo the strip has landed on — the same arithmetic the component's
 *  onScroll uses, read back off the live DOM. */
const shown = (page: Page) => strip(page).evaluate(
  (el) => (el.clientWidth ? Math.round(el.scrollLeft / el.clientWidth) : -1),
);
/** Poll, because a chevron starts a SMOOTH scroll and lands a few frames on. */
const expectShown = (page: Page, i: number, why: string) =>
  expect.poll(() => shown(page), { message: why, timeout: 5000 }).toBe(i);

const openPublic = async (page: Page) => {
  await page.goto(HANDLE);
  await page.waitForLoadState('networkidle');
};

/** Tap a gallery tile by its stored src, so "whichever photo was tapped" is a
 *  statement about a specific photo and not about a DOM position. */
/**
 * Pin the gallery to the static 'grid' layout for a test, and hand back an undo.
 *
 * Tests that TAP a photo must not inherit the account's live layout. A gallery
 * left on an auto-gliding filmstrip slides the tile out from under the click,
 * and the failure surfaces as an unexplained scrollIntoView timeout rather than
 * as "the layout was wrong". Grid is motionless and shows every photo at once.
 * The creator's own title string is written back verbatim.
 */
const pinGrid = async (page: Page, gallery: GalleryBlock) => {
  await setLayout(page, gallery.id, JSON.stringify({ layout: 'grid' }));
  await openPublic(page);
  return (p: Page) => setLayout(p, gallery.id, gallery.title);
};

const tapPhoto = async (page: Page, item: GalleryItem) => {
  const tile = page.locator(`img[src="${item.image_url}"]:visible`).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect(viewer(page)).toBeVisible();
};

test.describe('TL.GAL.3b.2 — lightbox navigation', () => {
  test('opens on the tapped photo and the chevrons walk the gallery — all three layouts', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    await openPublic(page);
    const gallery = await liveGallery(page);
    const original = gallery.title;
    expect(gallery.items.length, 'this account needs 3+ gallery photos to navigate').toBeGreaterThanOrEqual(3);

    // autoScroll off for the filmstrip: the glide is a separate mechanism with
    // its own coverage, and a moving target only buys click flake here.
    const LAYOUTS: Array<[string, string]> = [
      ['full', JSON.stringify({ layout: 'full' })],
      ['filmstrip', JSON.stringify({ layout: 'filmstrip', autoScroll: false })],
      ['grid', JSON.stringify({ layout: 'grid' })],
    ];

    try {
      for (const [name, title] of LAYOUTS) {
        await setLayout(page, gallery.id, title);
        await openPublic(page);

        // (1) opens on the photo that was tapped — the THIRD one, so "it opened
        // at index 0" cannot pass by accident.
        await tapPhoto(page, gallery.items[2]);
        await expectShown(page, 2, `${name}: the viewer opens on the tapped photo`);

        // (2) the chevrons step, one photo per click, both directions.
        await nextBtn(page).click();
        await expectShown(page, 3, `${name}: the right chevron advances one`);
        await prevBtn(page).click();
        await expectShown(page, 2, `${name}: the left chevron goes back one`);
        await prevBtn(page).click();
        await expectShown(page, 1, `${name}: and again`);

        await viewer(page).screenshot({ path: `tests/screenshots/${tag}-gal3b2-${name}.png` });
        await viewer(page).getByRole('button', { name: '×' }).click();
        await expect(viewer(page)).toHaveCount(0);
      }
    } finally {
      // Put the account's own layout back. A timeout closes the page out from
      // under this block, so fall back to a fresh context rather than leaving
      // a real page rewritten.
      try {
        await setLayout(page, gallery.id, original);
      } catch {
        const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
        const rescue = await ctx.newPage();
        try {
          await rescue.goto(HANDLE);
          await rescue.waitForTimeout(2500);
          await setLayout(rescue, gallery.id, original);
        } finally {
          await ctx.close();
        }
      }
    }
  });

  test('the chevrons wrap around both ways and never disable', async ({ page }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    await openPublic(page);
    const gallery = await liveGallery(page);
    const last = gallery.items.length - 1;
    const restoreLayout = await pinGrid(page, gallery);

    try {
    // Open on the FIRST photo, which under the old ruling was a dead end.
    await tapPhoto(page, gallery.items[0]);
    await expectShown(page, 0, 'opened on the first photo');
    await expect(prevBtn(page), 'no end to disable at').toBeEnabled();
    await expect(nextBtn(page)).toBeEnabled();

    // Backwards off the first photo lands on the LAST.
    await prevBtn(page).click();
    await expectShown(page, last, 'the left chevron wraps first → last');
    await viewer(page).screenshot({ path: `tests/screenshots/${tag}-gal3b3-wrap-back.png` });

    // …and both chevrons are still live at the other "end".
    await expect(prevBtn(page), 'still live on the last photo').toBeEnabled();
    await expect(nextBtn(page)).toBeEnabled();

    // Forwards off the last photo lands back on the FIRST.
    await nextBtn(page).click();
    await expectShown(page, 0, 'the right chevron wraps last → first');
    await viewer(page).screenshot({ path: `tests/screenshots/${tag}-gal3b3-wrap-forward.png` });

    // Wrapping did not cost ordinary stepping: one photo per click, in order.
    await nextBtn(page).click();
    await expectShown(page, 1, 'and an ordinary step is still one photo');
    await prevBtn(page).click();
    await expectShown(page, 0, 'in both directions');
    } finally {
      await restoreLayout(page);
    }
  });

  test('the keyboard wraps the same way, and Escape closes', async ({ page }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    await openPublic(page);
    const gallery = await liveGallery(page);
    const last = gallery.items.length - 1;
    const restoreLayout = await pinGrid(page, gallery);

    try {
    await tapPhoto(page, gallery.items[0]);
    await expectShown(page, 0, 'opened on the first photo');

    // (3) keyboard: → advances, ← goes back, one photo at a time.
    await page.keyboard.press('ArrowRight');
    await expectShown(page, 1, 'ArrowRight advances');
    await page.keyboard.press('ArrowRight');
    await expectShown(page, 2, 'ArrowRight again');
    await page.keyboard.press('ArrowLeft');
    await expectShown(page, 1, 'ArrowLeft goes back');
    await page.keyboard.press('ArrowLeft');
    await expectShown(page, 0, 'back at the first photo');

    // ArrowLeft off the first photo wraps to the last — same ruling, other input.
    await page.keyboard.press('ArrowLeft');
    await expectShown(page, last, 'ArrowLeft wraps first → last');
    await viewer(page).screenshot({ path: `tests/screenshots/${tag}-gal3b3-key-wrap-back.png` });

    // And ArrowRight off the last photo wraps to the first.
    await page.keyboard.press('ArrowRight');
    await expectShown(page, 0, 'ArrowRight wraps last → first');

    // A full lap by keyboard comes home — the wrap is a cycle, not a bounce.
    for (let i = 0; i < gallery.items.length; i++) await page.keyboard.press('ArrowRight');
    await expectShown(page, 0, 'one photo per press, all the way round and back to the start');

    // Escape closes — the backdrop does not, so this is the only key that can.
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);
    } finally {
      await restoreLayout(page);
    }
  });

  test('a swipe carries the viewer with it, and the photo shown is the uncropped original', async ({ page }, testInfo) => {
    const tag = testInfo.project.name;
    await openPublic(page);
    const gallery = await liveGallery(page);
    const first = gallery.items[0];
    const originalStyle = first.style_json;
    const restoreLayout = await pinGrid(page, gallery);

    try {
      // Give the first photo a real crop, so "the lightbox ignores it" is a
      // difference this test can SEE rather than a claim about nothing.
      await sb(page, `await sb.from('block_items').update({ style_json: arg.s }).eq('id', arg.id);`, {
        id: first.id,
        s: { ...(originalStyle || {}), crop: { x: 10, y: 20, w: 40, h: 40 } },
      });
      await openPublic(page);

      // The TILE is framed by that crop: the resolver paints an absolutely
      // positioned rectangle, which shows up as inline width/left.
      const tile = page.locator(`img[src="${first.image_url}"]:visible`).first();
      const tileStyle = await tile.evaluate((el) => ({ w: (el as HTMLElement).style.width, fit: getComputedStyle(el).objectFit }));
      expect(tileStyle.w, 'the tile paints the stored crop').not.toBe('');

      await tapPhoto(page, first);

      // (4) the viewer does not. Same photo, no crop geometry, contained whole.
      const shot = viewer(page).locator('img').first();
      await expect(shot).toHaveAttribute('src', first.image_url);
      const shotStyle = await shot.evaluate((el) => ({
        w: (el as HTMLElement).style.width,
        left: (el as HTMLElement).style.left,
        fit: getComputedStyle(el).objectFit,
      }));
      expect(shotStyle.w, 'the lightbox carries no crop geometry').toBe('');
      expect(shotStyle.left).toBe('');
      expect(shotStyle.fit, 'the whole photo, letterboxed into the screen').toBe('contain');
      expect(tileStyle.fit, 'while the tile is still filling its square').not.toBe('contain');
      await viewer(page).screenshot({ path: `tests/screenshots/${tag}-gal3b2-uncropped.png` });

      // The strip really is swipeable: native horizontal snap-scrolling, one
      // full-width slide per photo. Playwright 1.59 has no touch-DRAG (its
      // Touchscreen exposes tap only) and synthetic touch events cannot drive
      // a native scroll, so the gesture itself is the browser's — what
      // TL.GAL.3b.2 owns, and what is asserted here, is that the viewer FOLLOWS
      // the strip wherever a swipe leaves it.
      const geom = await strip(page).evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        snap: getComputedStyle(el).scrollSnapType,
        slides: el.scrollWidth / el.clientWidth,
      }));
      expect(geom.overflowX, 'the strip scrolls horizontally').toBe('auto');
      expect(geom.snap, 'and snaps one photo at a time').toContain('mandatory');
      expect(Math.round(geom.slides), 'one full-width slide per photo').toBe(gallery.items.length);

      if (testInfo.project.name === 'desktop') {
        // Chromium can send a REAL trusted horizontal wheel — the trackpad
        // swipe, the desktop half of the same gesture.
        const box = (await strip(page).boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(box.width, 0);
      } else {
        // WebKit: drive the strip's own scroll to where a swipe would land.
        await strip(page).evaluate((el) => el.scrollBy({ left: el.clientWidth }));
      }
      await expectShown(page, 1, 'the swipe moved the strip');

      // …and the chevrons pick up from there rather than from where the viewer
      // was opened — the whole reason a step reads the strip instead of state.
      await nextBtn(page).click();
      await expectShown(page, 2, 'the chevron continues from where the swipe left off');
    } finally {
      await sb(page, `await sb.from('block_items').update({ style_json: arg.s }).eq('id', arg.id);`, {
        id: first.id,
        s: originalStyle,
      });
      await restoreLayout(page);
    }
  });
});

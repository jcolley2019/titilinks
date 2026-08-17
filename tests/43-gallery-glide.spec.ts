// TL.GAL.4 — filmstrip auto-scroll rates.
//
// The glide is a rAF loop writing `scrollLeft`, so its speed is not a number
// anyone can read off the DOM — it only exists as pixels per second in a live
// browser. This spec measures it, the way TL.GAL.1 measured it by hand:
//
//   1. each tier runs at one TILE (72% of the strip) per its speedMs, scaled by
//      FILMSTRIP_GLIDE_SCALE — 45% slower than the pre-TL.GAL.4 rate;
//   2. the three tiers keep their order and their spacing: fast > medium > slow;
//   3. auto-scroll off really freezes it, rather than gliding invisibly slowly.
//
// Rates are measured on the PUBLIC page and confirmed once inside the editor
// preview: both render the same GalleryBlock, and this is what proves it rather
// than assuming it.
import { test, expect, type Page, type Locator } from '@playwright/test';

const HANDLE = '/joeyc';

/** The rate formula, mirrored from GalleryBlock. Kept as separate factors so a
 *  drift in any one of them fails here with a readable number. */
const TILE_FRAC = 0.72;          // the `w-[72%]` filmstrip tile
const GLIDE_SCALE = 0.55;        // TL.GAL.4 (0.75) → 4b (0.65) → 4c — the 45% slowdown
const TIER_MS = { slow: 7000, medium: 5000, fast: 3000 } as const;
const rateNow = (clientWidth: number, ms: number) => (clientWidth * TILE_FRAC * GLIDE_SCALE * 1000) / ms;
const rateBefore = (clientWidth: number, ms: number) => (clientWidth * TILE_FRAC * 1000) / ms;

// The glide is skipped outright under reduced motion, so pin the preference
// rather than inheriting whatever the runner's OS says.
test.use({ reducedMotion: 'no-preference' });

const sb = <T,>(page: Page, fn: string, arg?: unknown): Promise<T> => page.evaluate(
  async ({ body, a }) => {
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
  },
  { body: fn, a: arg ?? null },
);

interface Gal { id: string; title: string | null; firstSrc: string }

/** The gallery block this page is really rendering — the account owns blocks on
 *  more than one page, and the wrong one would be measured happily and wrongly. */
const liveGallery = async (page: Page): Promise<Gal> => {
  const all = await sb<Array<{ id: string; title: string | null; srcs: string[] }>>(page, `
    const { data: blocks } = await sb.from('blocks').select('id,title,type');
    const out = [];
    for (const b of (blocks || []).filter(x => x.type === 'gallery')) {
      const { data } = await sb.from('block_items').select('image_url,order_index').eq('block_id', b.id);
      out.push({ id: b.id, title: b.title, srcs: (data || []).sort((x, y) => x.order_index - y.order_index).map(r => r.image_url) });
    }
    return out;`);
  for (const g of all) {
    if (g.srcs.length && await page.locator(`img[src="${g.srcs[0]}"]`).count()) {
      return { id: g.id, title: g.title, firstSrc: g.srcs[0] };
    }
  }
  throw new Error('no gallery block is rendered on this page');
};

const setConfig = (page: Page, id: string, title: string | null) =>
  sb(page, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`, { id, t: title });

/**
 * The filmstrip's scroll container, found through a photo rather than by class:
 * the strip's className changes with the loop/no-loop branch, and a selector
 * that tracked it would silently match nothing the day that branch moves.
 */
const stripOf = (page: Page, src: string): Locator =>
  page.locator(`img[src="${src}"]:visible`).first()
    .locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]');

/**
 * Pixels per second, measured off the live glide.
 *
 * Never touches the strip with a pointer: `onPointerDown` parks the glide for
 * 8 seconds, so a stray click or scrollIntoView would measure a dead strip and
 * report a confident zero.
 */
const measure = async (strip: Locator, ms = 2500) => strip.evaluate(async (el, window_ms) => {
  const settle = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  await settle();
  const t0 = performance.now();
  const s0 = el.scrollLeft;
  await new Promise((r) => setTimeout(r, window_ms));
  const t1 = performance.now();
  const s1 = el.scrollLeft;
  const oneCopy = el.scrollWidth / 2;
  // The strip wraps by exactly one copy width; a sample window that straddles
  // the wrap reads as a big negative jump, so put the lap back.
  let dx = s1 - s0;
  if (dx < 0) dx += oneCopy;
  return { pxPerSec: dx / ((t1 - t0) / 1000), moved: dx, clientWidth: el.clientWidth };
}, ms);

test.describe('TL.GAL.4 — filmstrip glide rates', () => {
  test('every tier runs 45% slower, keeps its order, and stops dead when auto-scroll is off', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    await page.goto(HANDLE);
    await page.waitForLoadState('networkidle');
    const gallery = await liveGallery(page);
    const original = gallery.title;
    const measured: Record<string, number> = {};

    try {
      for (const tier of ['slow', 'medium', 'fast'] as const) {
        await setConfig(page, gallery.id, JSON.stringify({ layout: 'filmstrip', autoScroll: true, speed: tier }));
        await page.goto(HANDLE);
        await page.waitForLoadState('networkidle');
        // Photos still decoding change scrollWidth under the loop; let it settle.
        await page.waitForTimeout(1200);

        const strip = stripOf(page, gallery.firstSrc);
        const m = await measure(strip);
        measured[tier] = m.pxPerSec;

        const want = rateNow(m.clientWidth, TIER_MS[tier]);
        const was = rateBefore(m.clientWidth, TIER_MS[tier]);
        console.log(
          `[${tag}] ${tier}: ${m.pxPerSec.toFixed(1)} px/s measured · ${want.toFixed(1)} expected · `
          + `${was.toFixed(1)} before · ratio ${(m.pxPerSec / was).toFixed(3)} · strip ${m.clientWidth}px`,
        );

        // (1) it really moved — a frozen strip must never pass as "slower".
        expect(m.moved, `${tier}: the strip is actually gliding`).toBeGreaterThan(20);
        // …at the new rate. Tolerance is for rAF sampling, not for drift: a
        // whole notch of miss would mean the scale never reached the formula.
        expect(m.pxPerSec, `${tier}: measured rate matches the TL.GAL.4c formula`)
          .toBeGreaterThan(want * 0.88);
        expect(m.pxPerSec).toBeLessThan(want * 1.12);
        // …and that rate is ~0.55x what this tier used to run at. The band is
        // deliberately narrow enough to exclude BOTH earlier gates — 0.65 and
        // 0.75 — so a revert to either fails here instead of passing quietly.
        expect(m.pxPerSec / was, `${tier}: ~45% slower than before TL.GAL.4`).toBeGreaterThan(0.48);
        expect(m.pxPerSec / was).toBeLessThan(0.60);

        if (tier === 'medium') {
          await strip.locator('xpath=..').screenshot({ path: `tests/screenshots/${tag}-gal4-filmstrip-medium.png` });
        }
      }

      // (2) the three-tier relationship survived the scaling.
      expect(measured.fast, 'fast still outruns medium').toBeGreaterThan(measured.medium * 1.15);
      expect(measured.medium, 'medium still outruns slow').toBeGreaterThan(measured.slow * 1.15);

      // (3) auto-scroll off is a full stop, not a very slow glide.
      await setConfig(page, gallery.id, JSON.stringify({ layout: 'filmstrip', autoScroll: false, speed: 'fast' }));
      await page.goto(HANDLE);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1200);
      const frozen = await measure(stripOf(page, gallery.firstSrc), 2000);
      console.log(`[${tag}] auto-scroll off: ${frozen.moved.toFixed(2)}px in 2s`);
      expect(frozen.moved, 'auto-scroll off freezes the strip completely').toBeLessThan(1);
    } finally {
      // The account's own config goes back. A timeout closes the page out from
      // under this block, so fall back to a fresh context.
      try {
        await setConfig(page, gallery.id, original);
      } catch {
        const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
        const rescue = await ctx.newPage();
        try {
          await rescue.goto(HANDLE);
          await rescue.waitForTimeout(2500);
          await setConfig(rescue, gallery.id, original);
        } finally {
          await ctx.close();
        }
      }
    }
  });

  test('the editor preview glides at the same rate as the public page', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;
    await page.goto(HANDLE);
    await page.waitForLoadState('networkidle');
    const gallery = await liveGallery(page);
    const original = gallery.title;

    try {
      await setConfig(page, gallery.id, JSON.stringify({ layout: 'filmstrip', autoScroll: true, speed: 'medium' }));

      // The editor mounts TWO EditableProfileViews (desktop + mobile branches,
      // CSS-hidden rather than unmounted), so :visible inside stripOf is what
      // keeps this measuring the strip the creator is actually watching.
      await page.goto('/dashboard/editor');
      await page.waitForLoadState('networkidle');
      await expect(page.locator(`img[src="${gallery.firstSrc}"]:visible`).first()).toBeVisible({ timeout: 25_000 });
      await page.waitForTimeout(1500);

      const strip = stripOf(page, gallery.firstSrc);
      const m = await measure(strip);
      const want = rateNow(m.clientWidth, TIER_MS.medium);
      console.log(`[${tag}] preview medium: ${m.pxPerSec.toFixed(1)} px/s measured · ${want.toFixed(1)} expected · strip ${m.clientWidth}px`);

      expect(m.moved, 'the preview strip glides too').toBeGreaterThan(20);
      expect(m.pxPerSec, 'the preview runs the same formula as the public page').toBeGreaterThan(want * 0.88);
      expect(m.pxPerSec).toBeLessThan(want * 1.12);
      await strip.locator('xpath=..').screenshot({ path: `tests/screenshots/${tag}-gal4-preview-medium.png` });
    } finally {
      try {
        await setConfig(page, gallery.id, original);
      } catch {
        const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
        const rescue = await ctx.newPage();
        try {
          await rescue.goto(HANDLE);
          await rescue.waitForTimeout(2500);
          await setConfig(rescue, gallery.id, original);
        } finally {
          await ctx.close();
        }
      }
    }
  });
});

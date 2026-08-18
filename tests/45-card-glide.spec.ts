// TL.MOTION.1 — carousel + product-cards glide rates.
//
// Spec 43 proved the Gallery filmstrip glides at three honest speeds. These two
// blocks copied that loop before it was fixed, so they carried its bug: the rAF
// tick re-read `el.scrollLeft`, which rounds to an integer on write, and every
// tier collapsed to a flat ~1px/frame. Three chips, one speed. This spec pins
// the fix from the other side, exactly as 43 does for the gallery:
//
//   1. each tier runs at one CARD per its speedMs, scaled by the shared
//      FILMSTRIP_GLIDE_SCALE (lib/glide) — 65% slower than the unscaled rate;
//   2. the tiers keep their order and their spacing: fast > medium > slow;
//   3. the carousel's card SIZE really reaches the rate — small cards (44% of
//      the strip) glide proportionally slower than big ones (78%). This is the
//      one place the two blocks diverge from the gallery's fixed 0.72, so it is
//      the one place a shared constant could be right while the formula is wrong;
//   4. auto-scroll off freezes the strip completely.
//
// WHY A NEW SPEC INSTEAD OF EXTENDING 43. Spec 43 measures the account's own
// gallery block, and every helper in it is gallery-shaped: it finds the block by
// type 'gallery' and anchors the strip through a photo's `img[src]`. Neither
// holds here — carousel and product cards are different block types, a carousel
// card with no photo renders no <img> at all, and the carousel's rate depends on
// a card fraction the gallery does not have. Folding six more tier measurements
// into 43 (already two `test.slow()` cases) would also double a spec whose
// subject is a different block. 43 stays the gallery's contract; this is the
// card blocks'.
//
// These blocks are FIXTURES: unlike the gallery, the test account owns no
// carousel or product filmstrip to borrow, so this spec creates both on the
// page's own mode, measures them, and deletes them again. Every fixture title
// carries a `tlm1` marker so a run killed mid-flight can be swept clean by the
// next one rather than leaving junk blocks on a real page.
import { test, expect, type Page, type Locator } from '@playwright/test';

const HANDLE = '/joeyc';

/** The rate formula, mirrored from lib/glide. Kept as separate factors so a
 *  drift in any one of them fails here with a readable number. */
const GLIDE_SCALE = 0.35;
const CARD_FRAC = { big: 0.78, small: 0.44 } as const; // CarouselBlock `w-[78%]` / `w-[44%]`
const PRODUCT_FRAC = 0.72;                             // ProductCardsBlock `w-[72%]`
const TIER_MS = { slow: 7000, medium: 5000, fast: 3000 } as const;
const rateNow = (clientWidth: number, frac: number, ms: number) => (clientWidth * frac * GLIDE_SCALE * 1000) / ms;
const rateBefore = (clientWidth: number, frac: number, ms: number) => (clientWidth * frac * 1000) / ms;

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

const CAR_LABEL = 'TLM1-CAR';
const PRD_LABEL = 'TLM1-PRD';

/**
 * The mode the public page is really rendering. The account owns blocks on more
 * than one page, and a fixture inserted on the wrong mode would be measured
 * happily and never appear — so the mode is taken from a block whose content is
 * on the screen, the same way spec 43 picks its gallery.
 */
const liveModeId = async (page: Page): Promise<string> => {
  const all = await sb<Array<{ mode_id: string; srcs: string[] }>>(page, `
    const { data: blocks } = await sb.from('blocks').select('id,mode_id,type');
    const out = [];
    for (const b of (blocks || []).filter(x => x.type === 'gallery')) {
      const { data } = await sb.from('block_items').select('image_url').eq('block_id', b.id);
      out.push({ mode_id: b.mode_id, srcs: (data || []).map(r => r.image_url).filter(Boolean) });
    }
    return out;`);
  for (const g of all) {
    if (g.srcs.length && await page.locator(`img[src="${g.srcs[0]}"]`).count()) return g.mode_id;
  }
  throw new Error('could not identify the mode this page renders');
};

/** Delete every fixture block this spec has ever created on this account. */
const sweep = (page: Page) => sb(page, `
  const { data: blocks } = await sb.from('blocks').select('id,title,type');
  const mine = (blocks || []).filter(b =>
    (b.type === 'carousel' || b.type === 'product_cards') && (b.title || '').includes('"tlm1":true'));
  for (const b of mine) {
    await sb.from('block_items').delete().eq('block_id', b.id);
    await sb.from('blocks').delete().eq('id', b.id);
  }
  return mine.length;`);

/**
 * One fixture block, four cards, no images.
 *
 * Deliberately photo-less: the tiles are sized by width class + aspectRatio, so
 * the strip's geometry is final at first paint. A decoding photo would keep
 * changing `scrollWidth` under the loop and make the rate flaky for no gain —
 * and the labels, not images, are what this spec anchors on.
 */
const makeBlock = (page: Page, modeId: string, type: 'carousel' | 'product_cards', label: string, order: number) =>
  sb<string>(page, `
    const { data, error } = await sb.from('blocks')
      .insert({ mode_id: arg.modeId, type: arg.type, order_index: arg.order, is_enabled: true,
                title: JSON.stringify({ tlm1: true }) })
      .select('id').single();
    if (error) throw new Error(arg.type + ' insert: ' + error.message);
    const items = [0, 1, 2, 3].map(i => ({
      block_id: data.id, label: arg.label + '-' + i, url: 'https://example.com/tlm1/' + i, order_index: i,
    }));
    const { error: e2 } = await sb.from('block_items').insert(items);
    if (e2) throw new Error(arg.type + ' items: ' + e2.message);
    return data.id;`, { modeId, type, label, order });

const setConfig = (page: Page, id: string, cfg: Record<string, unknown>) =>
  sb(page, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`,
    { id, t: JSON.stringify({ ...cfg, tlm1: true }) });

/**
 * The strip, found through a card's LABEL rather than by class: the strip's
 * className changes with the loop/no-loop branch, and a selector that tracked it
 * would silently match nothing the day that branch moves. `:visible` matters
 * because the page renders inside a device stage on desktop.
 */
const stripOf = (page: Page, label: string): Locator =>
  page.locator(`:text-is("${label}-0"):visible`).first()
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

const reload = async (page: Page, label: string) => {
  await page.goto(HANDLE);
  await page.waitForLoadState('networkidle');
  await expect(page.locator(`:text-is("${label}-0"):visible`).first()).toBeVisible({ timeout: 20_000 });
  // Let the strip's geometry settle before the loop's rate is sampled.
  await page.waitForTimeout(800);
};

/** The account's page must be left exactly as it was found. */
const withFixtures = async (
  page: Page,
  browser: import('@playwright/test').Browser,
  body: (ids: { carousel: string; products: string }) => Promise<void>,
) => {
  await page.goto(HANDLE);
  await page.waitForLoadState('networkidle');
  const modeId = await liveModeId(page);
  await sweep(page);
  const carousel = await makeBlock(page, modeId, 'carousel', CAR_LABEL, 9001);
  const products = await makeBlock(page, modeId, 'product_cards', PRD_LABEL, 9002);
  try {
    await body({ carousel, products });
  } finally {
    // A timeout closes the page out from under this block, so fall back to a
    // fresh context rather than leaving fixture blocks on a real page.
    try {
      await sweep(page);
    } catch {
      const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
      const rescue = await ctx.newPage();
      try {
        await rescue.goto(HANDLE);
        await rescue.waitForTimeout(2500);
        await sweep(rescue);
      } finally {
        await ctx.close();
      }
    }
  }
};

test.describe('TL.MOTION.1 — carousel + product-cards glide rates', () => {
  test('the carousel runs three real speeds, scaled, and its card size reaches the rate', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;

    await withFixtures(page, browser, async ({ carousel }) => {
      const measured: Record<string, number> = {};

      for (const tier of ['slow', 'medium', 'fast'] as const) {
        await setConfig(page, carousel, { cardSize: 'big', autoScroll: true, speed: tier });
        await reload(page, CAR_LABEL);

        const m = await measure(stripOf(page, CAR_LABEL));
        measured[tier] = m.pxPerSec;

        const want = rateNow(m.clientWidth, CARD_FRAC.big, TIER_MS[tier]);
        const was = rateBefore(m.clientWidth, CARD_FRAC.big, TIER_MS[tier]);
        console.log(
          `[${tag}] carousel ${tier}: ${m.pxPerSec.toFixed(1)} px/s measured · ${want.toFixed(1)} expected · `
          + `${was.toFixed(1)} unscaled · ratio ${(m.pxPerSec / was).toFixed(3)} · strip ${m.clientWidth}px`,
        );

        // (1) it really moved — a frozen strip must never pass as "slower".
        expect(m.moved, `carousel ${tier}: the strip is actually gliding`).toBeGreaterThan(20);
        // …at the shared rate. Tolerance is for rAF sampling, not for drift.
        expect(m.pxPerSec, `carousel ${tier}: matches the lib/glide formula`).toBeGreaterThan(want * 0.88);
        expect(m.pxPerSec).toBeLessThan(want * 1.12);
        // …and that rate is ~0.35x unscaled. The band excludes all three earlier
        // gates — 0.55, 0.65, 0.75 — so a revert to any of them fails here.
        expect(m.pxPerSec / was, `carousel ${tier}: 65% slower than unscaled`).toBeGreaterThan(0.29);
        expect(m.pxPerSec / was).toBeLessThan(0.42);
      }

      // (2) three chips, three speeds. Before TL.MOTION.1 every tier here
      // quantised to the same ~60px/s and these two lines were the failure.
      expect(measured.fast, 'fast outruns medium').toBeGreaterThan(measured.medium * 1.15);
      expect(measured.medium, 'medium outruns slow').toBeGreaterThan(measured.slow * 1.15);

      // (3) the card fraction reaches the rate: a small card is 44% of the strip
      // against a big card's 78%, so at one card per speedMs it must glide that
      // much slower. A shared scale with a hardcoded 0.72 would pass everything
      // above and fail exactly here.
      await setConfig(page, carousel, { cardSize: 'small', autoScroll: true, speed: 'fast' });
      await reload(page, CAR_LABEL);
      const small = await measure(stripOf(page, CAR_LABEL));
      const wantSmall = rateNow(small.clientWidth, CARD_FRAC.small, TIER_MS.fast);
      const ratio = small.pxPerSec / measured.fast;
      console.log(
        `[${tag}] carousel small/fast: ${small.pxPerSec.toFixed(1)} px/s measured · ${wantSmall.toFixed(1)} expected · `
        + `${ratio.toFixed(3)} of big/fast (want ${(CARD_FRAC.small / CARD_FRAC.big).toFixed(3)})`,
      );
      expect(small.moved, 'the small-card strip glides too').toBeGreaterThan(20);
      expect(small.pxPerSec, 'small cards use their own 0.44 fraction').toBeGreaterThan(wantSmall * 0.88);
      expect(small.pxPerSec).toBeLessThan(wantSmall * 1.12);
      expect(ratio, 'small glides ~0.56x big at the same tier').toBeGreaterThan(0.47);
      expect(ratio).toBeLessThan(0.67);

      await stripOf(page, CAR_LABEL).screenshot({ path: `tests/screenshots/${tag}-motion1-carousel-small.png` });

      // (4) auto-scroll off is a full stop, not a very slow glide.
      await setConfig(page, carousel, { cardSize: 'big', autoScroll: false, speed: 'fast' });
      await reload(page, CAR_LABEL);
      const frozen = await measure(stripOf(page, CAR_LABEL), 2000);
      console.log(`[${tag}] carousel auto-scroll off: ${frozen.moved.toFixed(2)}px in 2s`);
      expect(frozen.moved, 'auto-scroll off freezes the carousel completely').toBeLessThan(1);
    });
  });

  test('the product filmstrip runs three real speeds, scaled, and freezes on demand', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;

    await withFixtures(page, browser, async ({ products }) => {
      const measured: Record<string, number> = {};

      for (const tier of ['slow', 'medium', 'fast'] as const) {
        await setConfig(page, products, { layout: 'filmstrip', autoScroll: true, speed: tier });
        await reload(page, PRD_LABEL);

        const m = await measure(stripOf(page, PRD_LABEL));
        measured[tier] = m.pxPerSec;

        const want = rateNow(m.clientWidth, PRODUCT_FRAC, TIER_MS[tier]);
        const was = rateBefore(m.clientWidth, PRODUCT_FRAC, TIER_MS[tier]);
        console.log(
          `[${tag}] products ${tier}: ${m.pxPerSec.toFixed(1)} px/s measured · ${want.toFixed(1)} expected · `
          + `${was.toFixed(1)} unscaled · ratio ${(m.pxPerSec / was).toFixed(3)} · strip ${m.clientWidth}px`,
        );

        expect(m.moved, `products ${tier}: the strip is actually gliding`).toBeGreaterThan(20);
        expect(m.pxPerSec, `products ${tier}: matches the lib/glide formula`).toBeGreaterThan(want * 0.88);
        expect(m.pxPerSec).toBeLessThan(want * 1.12);
        expect(m.pxPerSec / was, `products ${tier}: 65% slower than unscaled`).toBeGreaterThan(0.29);
        expect(m.pxPerSec / was).toBeLessThan(0.42);

        if (tier === 'medium') {
          await stripOf(page, PRD_LABEL).screenshot({ path: `tests/screenshots/${tag}-motion1-products-medium.png` });
        }
      }

      expect(measured.fast, 'fast outruns medium').toBeGreaterThan(measured.medium * 1.15);
      expect(measured.medium, 'medium outruns slow').toBeGreaterThan(measured.slow * 1.15);

      // The product filmstrip and the gallery filmstrip are both `w-[72%]` at the
      // same scale, so at a given tier they are the same speed — the "one honest
      // speed system" claim. Nothing extra to assert for it: `want` above IS
      // spec 43's gallery formula with the same two factors, so the bands each
      // spec measures against are the same numbers.

      await setConfig(page, products, { layout: 'filmstrip', autoScroll: false, speed: 'fast' });
      await reload(page, PRD_LABEL);
      const frozen = await measure(stripOf(page, PRD_LABEL), 2000);
      console.log(`[${tag}] products auto-scroll off: ${frozen.moved.toFixed(2)}px in 2s`);
      expect(frozen.moved, 'auto-scroll off freezes the product strip completely').toBeLessThan(1);
    });
  });
});

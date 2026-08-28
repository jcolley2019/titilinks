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
// TWO FIXTURE STRATEGIES, because the two blocks are not in the same position
// on the canonical account (TL.ISO.4b):
//
//   • CAROUSEL — CREATED. `carousel` is not one of BLOCK_PRESETS' default
//     types, so the canonical tree seeds none and there is nothing to borrow.
//     The spec inserts one on the page's own mode and deletes it again. That
//     insert is SAFE under blocks_mode_type_singleton_uidx (TL.BLOCK.1)
//     precisely because no carousel row exists on that mode to collide with.
//
//   • PRODUCT CARDS — BORROWED. `product_cards` IS canonical, one row per mode,
//     so a second insert is exactly what the singleton index exists to refuse
//     (it did: `duplicate key value violates unique constraint
//     "blocks_mode_type_singleton_uidx"` took all four of this spec's tests
//     down on the first canonical battery). So the spec borrows the account's
//     own product block the way the gallery specs borrow the gallery: it
//     reconfigures `blocks.title` — the only column this measurement needs —
//     and puts the original string back verbatim in a finally. The block's
//     ITEMS are never touched at all, so the borrow's blast radius is one
//     column of one row.
//
// Every title this spec writes carries a `tlm1` marker so a run killed
// mid-flight is recoverable by the next one: a marked CAROUSEL is junk and gets
// deleted, a marked PRODUCT block is a borrow left un-returned and gets its
// original title (stashed alongside the marker) put back.
import { test, expect, allowWrites, type Page, type Locator, type Browser } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';
import { translations } from '../src/hooks/useLanguage';
import { CONTENT_MAP } from '../src/lib/content-i18n';

// TL.ISO.2 write opt-in — withFixtures() inserts its own carousel block and
// items, reconfigures that block and the borrowed product block, then sweeps
// the carousel away and hands the product block's title back.
test.beforeEach(async ({ page }) => {
  await allowWrites(page, ['rest/v1/blocks', 'rest/v1/block_items']);
});

const HANDLE = `/${TEST_HANDLE}`;

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

/**
 * What a stored label actually READS AS on screen.
 *
 * The borrowed product block's cards carry the canonical seed labels, and every
 * block renders item text through translateContent() — a default string like
 * 'Product One' is looked up in CONTENT_MAP and re-rendered from the dictionary.
 * In English that round trip is the identity, but resolving it here rather than
 * assuming it means the strip anchor keeps working if the EN wording is ever
 * edited, and fails with a readable locator instead of a mystery timeout if the
 * seed labels change shape.
 */
const shownLabel = (label: string): string => {
  const key = CONTENT_MAP[label];
  const en = translations.en as Record<string, string>;
  return (key && en[key]) || label;
};

/**
 * The mode the public page is really rendering.
 *
 * The read is deliberately unscoped — `blocks` is world-readable, so it returns
 * gallery blocks from other accounts' public pages as well as this account's
 * modes — and it self-corrects: the mode is taken from the gallery whose first
 * photo is actually IN THE DOM, the same way spec 43 picks its gallery. A
 * fixture inserted on any other mode would be measured happily and never
 * appear.
 */
const liveModeId = async (page: Page): Promise<string> => {
  const all = await sb<Array<{ mode_id: string; srcs: string[] }>>(page, `
    // PW-SCOPED-READS ok: discovery - the DOM discriminator below picks the mode.
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

/**
 * Put the account back, from any state this spec can leave it in.
 *
 * Two kinds of residue, and they need opposite treatment — deleting a borrowed
 * canonical block would be worse than the mess it was cleaning up:
 *   • a marked CAROUSEL was created here → delete it, items first;
 *   • a marked PRODUCT block was BORROWED here → restore the original title
 *     stashed next to the marker as `tlm1Prev` (null is a legitimate stash
 *     value, so read the key's presence, never its truthiness).
 * Runs both as the finally and as the pre-flight, so a run killed mid-flight is
 * healed by the next one rather than borrowing an already-borrowed block and
 * writing this spec's own config in as if it were the account's.
 *
 * Scoped to the mode under test. `blocks` is world-readable (`FOR SELECT USING
 * (true)`, so public pages render for anonymous visitors), and an unscoped read
 * here would have the sweep issuing writes against every account's blocks and
 * relying on RLS to refuse them — quietly, since a 0-row UPDATE is not an error.
 */
const sweep = (page: Page, modeId: string) => sb<number>(page, `
  const { data: blocks } = await sb.from('blocks')
    .select('id,title,type').eq('mode_id', arg.modeId);
  const mine = (blocks || []).filter(b =>
    (b.type === 'carousel' || b.type === 'product_cards') && (b.title || '').includes('"tlm1":true'));
  for (const b of mine) {
    if (b.type === 'carousel') {
      await sb.from('block_items').delete().eq('block_id', b.id);
      const { error } = await sb.from('blocks').delete().eq('id', b.id);
      if (error) throw new Error('sweep: carousel delete: ' + error.message);
    } else {
      let prev = null;
      try { const p = JSON.parse(b.title); if ('tlm1Prev' in p) prev = p.tlm1Prev; } catch {}
      const { error } = await sb.from('blocks').update({ title: prev }).eq('id', b.id);
      if (error) throw new Error('sweep: product title restore: ' + error.message);
    }
  }
  return mine.length;`, { modeId });

/**
 * The CAROUSEL fixture: one block, four cards, no images.
 *
 * Deliberately photo-less: the tiles are sized by width class + aspectRatio, so
 * the strip's geometry is final at first paint. A decoding photo would keep
 * changing `scrollWidth` under the loop and make the rate flaky for no gain —
 * and the labels, not images, are what this spec anchors on.
 *
 * Only ever called for 'carousel'. product_cards is borrowed, not created —
 * see borrowProducts() and the singleton note in the file header.
 */
const makeCarousel = (page: Page, modeId: string, label: string, order: number) =>
  sb<string>(page, `
    const { data, error } = await sb.from('blocks')
      .insert({ mode_id: arg.modeId, type: 'carousel', order_index: arg.order, is_enabled: true,
                title: JSON.stringify({ tlm1: true }) })
      .select('id').single();
    if (error) throw new Error('carousel insert: ' + error.message);
    const items = [0, 1, 2, 3].map(i => ({
      block_id: data.id, label: arg.label + '-' + i, url: 'https://example.com/tlm1/' + i, order_index: i,
    }));
    const { error: e2 } = await sb.from('block_items').insert(items);
    if (e2) throw new Error('carousel items: ' + e2.message);
    return data.id;`, { modeId, label, order });

/**
 * The PRODUCT CARDS borrow: the account's own block on the mode being measured.
 *
 * Returns its id, the title to hand back, and the label of its FIRST card —
 * derived from what the block actually holds, never assumed, so a future change
 * to the canonical tree's product names moves the anchor with it instead of
 * breaking the spec. Two preconditions are checked loudly, because both would
 * otherwise surface as a 20s wait on a card that never renders:
 *   • the block must exist (it is canonical; its absence means the account was
 *     not reseeded, and every measurement below would be meaningless);
 *   • it must hold >= 2 items, which is ProductCardsBlock's own `loop` gate —
 *     below it the filmstrip renders no wrap copy and never glides at all.
 */
const borrowProducts = async (page: Page, modeId: string) => {
  const found = await sb<{ id: string; title: string | null; labels: string[] } | null>(page, `
    const { data: blocks } = await sb.from('blocks')
      .select('id,title,type').eq('mode_id', arg.modeId).eq('type', 'product_cards');
    const b = (blocks || [])[0];
    if (!b) return null;
    const { data: items } = await sb.from('block_items')
      .select('label,order_index').eq('block_id', b.id).order('order_index', { ascending: true });
    return { id: b.id, title: b.title, labels: (items || []).map(r => r.label).filter(Boolean) };`,
    { modeId });

  if (!found) {
    throw new Error(
      `no product_cards block on mode ${modeId} — the canonical tree seeds one per mode; reseed the account`,
    );
  }
  if (found.labels.length < 2) {
    throw new Error(
      `the product_cards block holds ${found.labels.length} labelled item(s); the filmstrip loop needs >= 2`,
    );
  }
  return { id: found.id, title: found.title, card: shownLabel(found.labels[0]) };
};

/**
 * Write a block's config into its title.
 *
 * `prev` is the borrow's stash: pass the block's ORIGINAL title for a borrowed
 * block so sweep() can hand it back after a killed run, and leave it undefined
 * for a block this spec created, which sweep() deletes outright.
 */
const setConfig = (page: Page, id: string, cfg: Record<string, unknown>, prev?: string | null) =>
  sb(page, `await sb.from('blocks').update({ title: arg.t }).eq('id', arg.id);`,
    { id, t: JSON.stringify(prev === undefined ? { ...cfg, tlm1: true } : { ...cfg, tlm1: true, tlm1Prev: prev }) });

/**
 * The strip, found through a CARD'S OWN TEXT rather than by class: the strip's
 * className changes with the loop/no-loop branch, and a selector that tracked it
 * would silently match nothing the day that branch moves. `:visible` matters
 * because the page renders inside a device stage on desktop, and `.first()`
 * because the looping filmstrip renders every card twice.
 *
 * `card` is the exact rendered text — 'TLM1-CAR-0' for the created carousel,
 * the borrowed block's own first product name for the product strip.
 */
const stripOf = (page: Page, card: string): Locator =>
  page.locator(`:text-is("${card}"):visible`).first()
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

const reload = async (page: Page, card: string) => {
  await page.goto(HANDLE);
  await page.waitForLoadState('networkidle');
  await expect(page.locator(`:text-is("${card}"):visible`).first()).toBeVisible({ timeout: 20_000 });
  // Let the strip's geometry settle before the loop's rate is sampled.
  await page.waitForTimeout(800);
};

/**
 * The account's page must be left exactly as it was found.
 *
 * Pre-flight sweep, then create the carousel and borrow the product block; the
 * finally hands both back. The pre-flight matters more since the borrow exists:
 * without it a run killed mid-flight would leave the product block wearing this
 * spec's config, and the NEXT run would capture that as "the account's title"
 * and restore the wrong thing forever.
 *
 * `configureProducts` is bound rather than handed out as a raw id so the borrow
 * stash (`tlm1Prev`) rides along on every write — a call site cannot forget it.
 */
const withFixtures = async (
  page: Page,
  browser: Browser,
  body: (fx: {
    carousel: string;
    productCard: string;
    configureProducts: (cfg: Record<string, unknown>) => Promise<unknown>;
  }) => Promise<void>,
) => {
  await page.goto(HANDLE);
  await page.waitForLoadState('networkidle');
  const modeId = await liveModeId(page);
  await sweep(page, modeId);
  const carousel = await makeCarousel(page, modeId, CAR_LABEL, 9001);
  const products = await borrowProducts(page, modeId);

  let bodyErr: unknown;
  try {
    await body({
      carousel,
      productCard: products.card,
      configureProducts: (cfg) => setConfig(page, products.id, cfg, products.title),
    });
  } catch (e) {
    bodyErr = e;
    throw e;
  } finally {
    // A timeout closes the page out from under this block, so fall back to a
    // fresh context. If THAT fails too the run must go red loudly: a stranded
    // borrow silently rewrites the account's own product config for every spec
    // that follows, which is far worse than one red test. (TL.ISO.0 flagged
    // exactly this class — a restore that fails quietly and strands state.)
    let restored = false;
    let firstErr: unknown;
    try {
      await sweep(page, modeId);
      restored = true;
    } catch (e) {
      firstErr = e;
    }
    if (!restored) {
      const ctx = await browser.newContext({ storageState: 'tests/.auth/user.json' });
      try {
        const rescue = await ctx.newPage();
        await rescue.goto(HANDLE);
        await rescue.waitForTimeout(2500);
        await sweep(rescue, modeId);
      } catch (e) {
        throw new Error(
          'TL.MOTION.1 could not put the account back: the borrowed product_cards block may still be '
          + "wearing this spec's config and a fixture carousel may still be on the page. The next run's "
          + `pre-flight sweep heals both. in-page: ${String(firstErr)} · rescue: ${String(e)}`
          + (bodyErr ? ` · the test itself had already failed with: ${String(bodyErr)}` : ''),
        );
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
        await reload(page, `${CAR_LABEL}-0`);

        const m = await measure(stripOf(page, `${CAR_LABEL}-0`));
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
      await reload(page, `${CAR_LABEL}-0`);
      const small = await measure(stripOf(page, `${CAR_LABEL}-0`));
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

      await stripOf(page, `${CAR_LABEL}-0`).screenshot({ path: `tests/screenshots/${tag}-motion1-carousel-small.png` });

      // (4) auto-scroll off is a full stop, not a very slow glide.
      await setConfig(page, carousel, { cardSize: 'big', autoScroll: false, speed: 'fast' });
      await reload(page, `${CAR_LABEL}-0`);
      const frozen = await measure(stripOf(page, `${CAR_LABEL}-0`), 2000);
      console.log(`[${tag}] carousel auto-scroll off: ${frozen.moved.toFixed(2)}px in 2s`);
      expect(frozen.moved, 'auto-scroll off freezes the carousel completely').toBeLessThan(1);
    });
  });

  test('the product filmstrip runs three real speeds, scaled, and freezes on demand', async ({ page, browser }, testInfo) => {
    test.slow();
    const tag = testInfo.project.name;

    await withFixtures(page, browser, async ({ productCard, configureProducts }) => {
      const measured: Record<string, number> = {};

      for (const tier of ['slow', 'medium', 'fast'] as const) {
        await configureProducts({ layout: 'filmstrip', autoScroll: true, speed: tier });
        await reload(page, productCard);

        const m = await measure(stripOf(page, productCard));
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
          await stripOf(page, productCard).screenshot({ path: `tests/screenshots/${tag}-motion1-products-medium.png` });
        }
      }

      expect(measured.fast, 'fast outruns medium').toBeGreaterThan(measured.medium * 1.15);
      expect(measured.medium, 'medium outruns slow').toBeGreaterThan(measured.slow * 1.15);

      // The product filmstrip and the gallery filmstrip are both `w-[72%]` at the
      // same scale, so at a given tier they are the same speed — the "one honest
      // speed system" claim. Nothing extra to assert for it: `want` above IS
      // spec 43's gallery formula with the same two factors, so the bands each
      // spec measures against are the same numbers.

      await configureProducts({ layout: 'filmstrip', autoScroll: false, speed: 'fast' });
      await reload(page, productCard);
      const frozen = await measure(stripOf(page, productCard), 2000);
      console.log(`[${tag}] products auto-scroll off: ${frozen.moved.toFixed(2)}px in 2s`);
      expect(frozen.moved, 'auto-scroll off freezes the product strip completely').toBeLessThan(1);
    });
  });
});

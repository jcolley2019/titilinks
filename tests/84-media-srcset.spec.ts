import { test, expect, type Browser, type Page } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

/**
 * MEDIA.PHOTO.1 — every creator image is served at the size its screen needs.
 *
 * Creators upload one master; the page renders each image with a `srcset` of
 * Supabase Storage renditions (`/render/image/public/…?width=…`) and leaves
 * `src` as the master. The browser then picks by box width × pixel density.
 * What this spec defends, on the battery account's PUBLIC page, as an anonymous
 * visitor (a fresh context — no session):
 *
 *   1. every `<img>` that renders one of our uploads carries a srcset of >= 2
 *      renditions, each a `/render/image/public/` URL whose `width=` equals its
 *      `w` descriptor; GIF/SVG masters (which a transform would freeze/rasterise)
 *      are exempt;
 *   2. an image whose `src` is NOT ours (external) never gets a transformed
 *      srcset;
 *   3. the candidate the browser actually requests (`currentSrc`) tracks the
 *      screen: close to box width × DPR (never wildly more, never starved), on
 *      a 2x phone, a 3x phone, a 1x desktop, a 4K at 1x and a 4K at 200%;
 *   4. density responds: a 3x phone asks for more than a 2x phone, which asks
 *      for more than the 1x desktop — and a 4K monitor does NOT get a bigger
 *      hero than its phone-shaped stage column needs (the stage pins the column
 *      to the device preset's width, so a 1x 4K requests what a 1x desktop does);
 *   5. the visitor route's anonymous page read goes to the `pages_public` view
 *      (MEDIA.LEAK.1), whose payload carries neither `avatar_original_url` nor
 *      `theme_json.avatar_original_url_page2` — and replaying that exact
 *      request with no session returns rows without them.
 *
 * Writes: none. Reads only, in fresh anonymous contexts (the same thing a
 * visitor's browser sends), so no write guard is needed and none is bypassed.
 * Fixtures: whatever the battery account already holds (hero + gallery); no rows
 * are created. Runs on both projects: each launches its own engine for the
 * scenario matrix (desktop = Chromium, mobile = WebKit).
 */

const HANDLE = `/${TEST_HANDLE}`;
const OBJECT = '/storage/v1/object/public/';
const RENDER = '/storage/v1/render/image/public/';

/** One scenario = one visitor screen. `dpr` is the device pixel ratio. */
const SCREENS = {
  phone2x: { width: 390, height: 844, dpr: 2 },
  phone3x: { width: 430, height: 932, dpr: 3 },
  desktop1x: { width: 1280, height: 720, dpr: 1 },
  fourK1x: { width: 3840, height: 2160, dpr: 1 },
  // A 4K panel at 200% scaling reports 1920x1080 CSS px at DPR 2.
  fourK2x: { width: 1920, height: 1080, dpr: 2 },
} as const;
type ScreenName = keyof typeof SCREENS;

/** The ladder is anchored on the 402px reference phone; a 390px phone sits a few
 *  percent under it, so the next rung can overshoot box × DPR by that much. */
const OVERSHOOT = 1.15;
/** A rung is chosen to cover box × DPR; a ladder with no rung that large (the
 *  3x hero tops out at 3 × 402) can land a few percent under it. */
const UNDERSHOOT = 0.85;

interface ImgStat {
  src: string;
  srcset: string;
  sizes: string;
  currentSrc: string;
  boxW: number;
  complete: boolean;
  inHero: boolean;
  inBackdrop: boolean;
}

const isOurs = (src: string) => src.includes(OBJECT);
const isAnimatedOrVector = (src: string) => /\.(?:gif|svg)(?:$|[?#])/i.test(src);

const candidates = (srcset: string) =>
  srcset
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [url, desc] = c.split(/\s+/);
      return { url, w: Number(desc?.replace(/w$/, '')) };
    });

const widthParam = (url: string) => Number(new URL(url).searchParams.get('width'));

/** Open the public page as a visitor on `screen`, bring every image into play, and read them back. */
async function visit(
  browser: Browser,
  baseURL: string,
  screen: (typeof SCREENS)[ScreenName],
): Promise<{ page: Page; close: () => Promise<void>; pagesRequests: { url: string; headers: Record<string, string>; body: string }[] }> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: screen.width, height: screen.height },
    deviceScaleFactor: screen.dpr,
  });
  const page = await context.newPage();
  const pagesRequests: { url: string; headers: Record<string, string>; body: string }[] = [];
  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() === 'GET' && new URL(res.url()).pathname.endsWith('/rest/v1/pages_public')) {
      try {
        pagesRequests.push({ url: res.url(), headers: req.headers(), body: await res.text() });
      } catch {
        /* body gone with the navigation — a later request will carry it */
      }
    }
  });
  await page.goto(HANDLE);
  await expect(page.locator('[data-testid="hero-sticky"] img').first()).toBeVisible({ timeout: 30_000 });
  return { page, close: () => context.close(), pagesRequests };
}

/** Scroll the creator images into view so lazy ones select a source, then read all <img>s. */
async function readImages(page: Page): Promise<ImgStat[]> {
  const ours = page.locator(`img[src*="${OBJECT}"]`);
  const n = Math.min(await ours.count(), 14);
  for (let i = 0; i < n; i++) {
    await ours.nth(i).scrollIntoViewIfNeeded().catch(() => undefined);
    // A source is selected once the image has started loading; give each a beat.
    await expect
      .poll(() => ours.nth(i).evaluate((el) => (el as HTMLImageElement).currentSrc !== ''), { timeout: 8_000 })
      .toBe(true)
      .catch(() => undefined);
  }
  return page.evaluate(() =>
    Array.from(document.images).map((img) => ({
      src: img.getAttribute('src') ?? '',
      srcset: img.getAttribute('srcset') ?? '',
      sizes: img.getAttribute('sizes') ?? '',
      currentSrc: img.currentSrc,
      boxW: img.offsetWidth,
      complete: img.complete,
      inHero: !!img.closest('[data-testid="hero-sticky"]'),
      inBackdrop: !!img.closest('[data-testid="desk-stage-backdrop"]'),
    })),
  );
}

const creatorImages = (all: ImgStat[]) => all.filter((i) => isOurs(i.src) && !isAnimatedOrVector(i.src));

/** Layout width of the hero photo and the rendition the browser chose for it. */
const heroChoice = (all: ImgStat[]) => {
  const hero = all.find((i) => i.inHero && isOurs(i.src));
  expect(hero, 'the battery page has a hero photo of ours').toBeTruthy();
  expect(hero!.currentSrc, 'the hero selected a source').not.toBe('');
  return { boxW: hero!.boxW, chosen: widthParam(hero!.currentSrc), hero: hero! };
};

test.describe('MEDIA.PHOTO.1 — responsive creator images', () => {
  test.setTimeout(180_000);

  test('every creator <img> carries a srcset of renditions; external images never do', async ({ browser, baseURL }) => {
    const v = await visit(browser, baseURL!, SCREENS.phone2x);
    try {
      const all = await readImages(v.page);
      const mine = creatorImages(all);
      // Vacuous-pass guard: the account has a hero and a gallery of ours.
      expect(mine.length, 'creator images found on the battery page').toBeGreaterThanOrEqual(3);

      for (const img of mine) {
        const cands = candidates(img.srcset);
        expect(cands.length, `srcset of ${img.src}`).toBeGreaterThanOrEqual(2);
        for (const c of cands) {
          expect(c.url, 'a rendition URL').toContain(RENDER);
          expect(widthParam(c.url), 'width= matches its w descriptor').toBe(c.w);
        }
        // Ascending, distinct rungs.
        const ws = cands.map((c) => c.w);
        expect([...ws].sort((a, b) => a - b)).toEqual(ws);
        expect(new Set(ws).size).toBe(ws.length);
        // `src` is still the master — the one thing existing specs locate tiles by.
        expect(img.src).toContain(OBJECT);
        expect(img.src).not.toContain(RENDER);
        expect(img.sizes, 'a sizes attribute').not.toBe('');
      }

      // External (or data:) sources never get a transformed srcset.
      for (const img of all.filter((i) => !isOurs(i.src))) {
        expect(img.srcset, `external img ${img.src.slice(0, 60)}`).not.toContain(RENDER);
      }
    } finally {
      await v.close();
    }
  });

  for (const name of Object.keys(SCREENS) as ScreenName[]) {
    test(`${name}: the requested rendition tracks box width × density`, async ({ browser, baseURL }) => {
      const screen = SCREENS[name];
      const v = await visit(browser, baseURL!, screen);
      try {
        const all = await readImages(v.page);
        const loaded = creatorImages(all).filter((i) => i.currentSrc.includes(RENDER) && i.boxW > 0 && !i.inBackdrop);
        expect(loaded.length, 'creator images that selected a rendition').toBeGreaterThanOrEqual(3);

        for (const img of loaded) {
          const chosen = widthParam(img.currentSrc);
          const wanted = img.boxW * screen.dpr;
          expect(chosen, `${img.currentSrc} must not ask for far more than ${wanted}px`).toBeLessThanOrEqual(
            Math.ceil(wanted * OVERSHOOT),
          );
          // Unless the ladder simply ends before the need does, it covers it.
          const top = Math.max(...candidates(img.srcset).map((c) => c.w));
          if (chosen < top) {
            expect(chosen, `${img.currentSrc} must not starve a ${wanted}px box`).toBeGreaterThanOrEqual(
              Math.floor(wanted * UNDERSHOOT),
            );
          }
        }

        // The hero holds the headline claim: a phone is never handed a desktop-size file.
        const { boxW, chosen } = heroChoice(all);
        expect(chosen, `hero (box ${boxW}px @ ${screen.dpr}x)`).toBeLessThanOrEqual(Math.ceil(boxW * screen.dpr * OVERSHOOT));
        // The stage backdrop is a blur: it must not decode a hero-size file.
        const backdrop = all.find((i) => i.inBackdrop);
        if (backdrop) {
          expect(backdrop.currentSrc, 'blurred backdrop selected a rendition').toContain(RENDER);
          expect(widthParam(backdrop.currentSrc), 'a 56px blur needs a thumbnail').toBeLessThanOrEqual(256);
        }
      } finally {
        await v.close();
      }
    });
  }

  test('density responds: 3x phone > 2x phone > 1x desktop, and a 1x 4K gets no more than its stage needs', async ({ browser, baseURL }) => {
    const chosen: Record<string, number> = {};
    for (const name of Object.keys(SCREENS) as ScreenName[]) {
      const v = await visit(browser, baseURL!, SCREENS[name]);
      try {
        chosen[name] = heroChoice(await readImages(v.page)).chosen;
      } finally {
        await v.close();
      }
    }
    test.info().annotations.push({ type: 'hero rendition width by screen', description: JSON.stringify(chosen) });

    expect(chosen.phone3x, '3x phone asks for more than a 2x phone').toBeGreaterThan(chosen.phone2x);
    expect(chosen.phone2x, '2x phone asks for more than a 1x desktop').toBeGreaterThan(chosen.desktop1x);
    // The desktop page lives in a phone-shaped stage (DesktopStage): a 3840px window does
    // not make the hero's column any wider, so a 1x 4K needs what a 1x laptop needs...
    expect(chosen.fourK1x).toBe(chosen.desktop1x);
    // ...and a bigger monitor never gets a bigger file than a 3x phone.
    expect(chosen.fourK1x).toBeLessThan(chosen.phone3x);
    // Pixel density is what scales it: a 4K panel at 200% asks for more than the same panel at 100%.
    expect(chosen.fourK2x).toBeGreaterThan(chosen.fourK1x);
  });

  test('the visitor route reads pages_public, which has no avatar_original_url', async ({ browser, baseURL }) => {
    const v = await visit(browser, baseURL!, SCREENS.desktop1x);
    try {
      expect(v.pagesRequests.length, 'the page issued an anonymous pages_public read').toBeGreaterThanOrEqual(1);
      const mine = v.pagesRequests.find((r) => new URL(r.url).searchParams.get('handle')?.includes(TEST_HANDLE));
      expect(mine, 'the pages_public read for the battery handle').toBeTruthy();

      // MEDIA.LEAK.1: the view omits the column, so the client asks for `*`;
      // what matters is that the column is not named and not delivered.
      const select = new URL(mine!.url).searchParams.get('select') ?? '';
      expect(select.split(',')).not.toContain('avatar_original_url');

      const rows = JSON.parse(mine!.body);
      const row = Array.isArray(rows) ? rows[0] : rows;
      expect(row?.handle).toBe(TEST_HANDLE);
      expect(Object.keys(row), 'the payload the visitor received').not.toContain('avatar_original_url');
      expect(
        Object.keys(row.theme_json ?? {}),
        'the visitor theme_json carries no page-2 original',
      ).not.toContain('avatar_original_url_page2');
      // ...and the columns the page does need are all still there.
      for (const col of ['id', 'handle', 'display_name', 'avatar_url', 'theme_json', 'user_id']) {
        expect(Object.keys(row), `payload carries ${col}`).toContain(col);
      }
      expect(row.avatar_url, 'the display copy is still delivered').toBeTruthy();

      // No-JS replay: the same request, no cookies, no session, no browser.
      const replay = await v.page.request.get(mine!.url, {
        headers: { apikey: mine!.headers['apikey'], authorization: mine!.headers['authorization'] ?? `Bearer ${mine!.headers['apikey']}` },
      });
      expect(replay.status()).toBe(200);
      const replayed = await replay.json();
      const replayRow = Array.isArray(replayed) ? replayed[0] : replayed;
      expect(Object.keys(replayRow)).not.toContain('avatar_original_url');
      expect(Object.keys(replayRow.theme_json ?? {})).not.toContain('avatar_original_url_page2');
      expect(replayRow.handle).toBe(TEST_HANDLE);
    } finally {
      await v.close();
    }
  });
});

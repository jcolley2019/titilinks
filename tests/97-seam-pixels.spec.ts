/**
 * TP.F2 — the join under the hero photo, read off the screen (audit S1, S4, S5).
 *
 * The page colour used to be painted twice: a fade strip in a separately
 * computed colour, and the content panel beneath it. On a 135-degree gradient
 * the two could not match and a hard line showed where the strip ended. TP.F2
 * paints fade and panel as ONE surface; this spec is what keeps it that way.
 *
 * THE TEST. The hero photo is replaced by a flat grey through response
 * interception, so every pixel between the photo and the page is the fade and
 * nothing else. For one solid colour, one 135-degree gradient and one vertical
 * gradient, at device scale 1 and 3, a pixel column is read down the join at
 * the left edge and at the right edge, at rest and after scrolling 61 and 137
 * px:
 *
 *   a. Never away from the background — walking down, the distance to the page
 *      background never increases. The background is read from the same column
 *      just below the join and carried upward along its own slope, so a
 *      gradient is compared with what the gradient is at that row.
 *   b. No step across the panel's top edge — every row from 4 px above the edge
 *      to 8 px below it equals the row before it, and the row above the edge
 *      equals the row below it. (The old strip overlapped the panel by 4 px, so
 *      its mismatch showed 4 px BELOW the edge; the walk covers that row.)
 *
 * No colour, height or ramp length is pinned here: the checks hold for any
 * fade that is one surface, and fail for any second surface that mismatches.
 *
 * Handle (S4): with no saved handle colour the default is dark on a light page
 * and pure white on a dark one; a saved handle colour is used unchanged.
 *
 * FIXTURE MODEL — public cases: an anonymous visitor on the battery handle,
 * zero writes; the `pages_public` read is passed through with its theme pinned
 * and its photo pointed at a fixture URL answered here. Editor case: the
 * battery session, the editor's own `pages` read pinned the same way, every
 * write left to the deny fixture (nothing in the test writes).
 */
import { PNG } from 'pngjs';
import { test, expect, type Locator, type Page, type Route } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

// A passthrough read can still be in flight when a test ends; drop the routes.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const ANONYMOUS = { cookies: [], origins: [] };
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DESKTOP = { width: 1440, height: 1000 };

const HERO_RGB: [number, number, number] = [128, 128, 128];
const HERO_URL = 'https://fixture.titilinks.test/tp-f2/flat-hero.png';

type Rgb = [number, number, number];

interface Background {
  key: string;
  type: 'solid' | 'gradient';
  solid_color: string;
  gradient_css: string;
}

const BACKGROUNDS: Background[] = [
  { key: 'a solid colour', type: 'solid', solid_color: '#3b82f6', gradient_css: '' },
  // Two stops at 135 degrees, the shape every onboarding gradient has. (Two
  // stops on purpose: the page colour then changes in a straight line down the
  // column, which is what the background fit in readJoin assumes.)
  { key: 'a 135-degree gradient', type: 'gradient', solid_color: '#fef3c7', gradient_css: 'linear-gradient(135deg, #fef3c7 0%, #f97316 100%)' },
  { key: 'a vertical gradient', type: 'gradient', solid_color: '#0a0a0a', gradient_css: 'linear-gradient(180deg, #0a0a0a 0%, #1e1b4b 50%, #4c1d95 100%)' },
];
const DIAGONAL = BACKGROUNDS[1];
const SCROLLS = [0, 61, 137];

function flatPng(width: number, height: number, [r, g, b]: Rgb): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}
const HERO_PNG = flatPng(900, 1200, HERO_RGB);

/** EditableProfileView's default headerConfig (used when the row has none). */
const HEADER_DEFAULTS = {
  nameSize: 28, handleSize: 14, nameOffset: 0, iconsOffset: 0, namePadTop: 0, namePadBottom: 0,
  iconsPaddingY: 8, iconSize: 'medium', nameHandleGap: 2,
};

interface Pin {
  background: Background;
  /** The theme's text colour (what each theme sets to contrast its page). */
  text: string;
  /** A handle colour the creator picked; absent = never picked. */
  handleColor?: string;
}

/** The stored theme pinned for the join (never the account's own look). */
function pinTheme(raw: unknown, pin: Pin) {
  const t = JSON.parse(JSON.stringify(raw && typeof raw === 'object' ? raw : {}));
  const { type, solid_color, gradient_css } = pin.background;
  t.background = { ...(t.background || {}), type, solid_color, gradient_css, image_url: '' };
  t.header = { ...(t.header || {}), image_url: '' };
  t.typography = { ...(t.typography || {}), text_color: pin.text };
  delete t.typography.text_effect;
  t.auto_contrast = false;
  t.pageStyle = 'hero';
  if (t.pages && typeof t.pages === 'object') {
    for (const id of Object.keys(t.pages)) {
      if (t.pages[id] && typeof t.pages[id] === 'object') delete t.pages[id].style;
    }
  }
  t.heroConfig = { fit: 'fill', posY: 25 }; // no video, and an explicit fit (no logo auto-Fit)
  const header = { ...HEADER_DEFAULTS, ...(t.headerConfig || {}) };
  delete header.handleColor;
  if (pin.handleColor) header.handleColor = pin.handleColor;
  t.headerConfig = header;
  delete t.look;
  return t;
}

/** Rewrite a REST read's rows (object or array) through `fn`. */
async function rewriteRead(route: Route, fn: (row: any) => any) {
  const res = await route.fetch();
  const body = await res.json();
  const out = Array.isArray(body)
    ? body.map((r) => (r && 'theme_json' in r ? fn(r) : r))
    : body && typeof body === 'object' && 'theme_json' in body ? fn(body) : body;
  await route.fulfill({ response: res, body: JSON.stringify(out) });
}

async function serveFlatHero(page: Page) {
  await page.route((url) => url.hostname === 'fixture.titilinks.test', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: HERO_PNG }));
}

/** The flat photo is the one on screen, decoded and past its fade-in. */
async function heroSettled(page: Page, hero: Locator) {
  await expect.poll(() => hero.evaluate((el, url) => {
    const img = [...el.querySelectorAll('img')].find((i) => (i.currentSrc || i.src) === url);
    return !!img && img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1';
  }, HERO_URL), { message: 'the flat hero photo is painted', timeout: 20_000 }).toBe(true);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
}

async function openPublic(page: Page, pin: Pin): Promise<Locator> {
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    if (!MUTATING.has(req.method())) return route.fallback();
    if (req.url().includes('/rest/v1/rpc/get_public_')) return route.fallback();
    return route.abort('blockedbyclient');
  });
  await serveFlatHero(page);
  await page.route('**/rest/v1/pages_public*', async (route) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('handle=eq.')) return route.fallback();
    return rewriteRead(route, (row) => ({ ...row, avatar_url: HERO_URL, theme_json: pinTheme(row.theme_json, pin) }));
  });
  await page.goto(`/${TEST_HANDLE}`);
  const hero = page.getByTestId('hero-sticky').first();
  await expect(hero).toBeVisible({ timeout: 20_000 });
  await heroSettled(page, hero);
  return hero;
}

/** Scroll whatever scrolls the page under `hero` (the desktop stage, the editor frame, or the window). */
async function scrollJoin(hero: Locator, y: number) {
  await hero.evaluate(async (el, top) => {
    let sc: HTMLElement | null = el.parentElement;
    while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
    const scroller = (sc ?? document.scrollingElement) as HTMLElement;
    scroller.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, y);
}

const dist = (a: Rgb, b: Rgb) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/** Rounding slack, in 0-255 channel steps. A mismatched second surface is tens of steps. */
const SLACK = 2;

interface ColumnReading {
  /** How far the top of the column (bare photo) is from the page background. */
  photoDistance: number;
  /** Largest rise in distance-to-background on the way down (0 = never rises). */
  worstRise: number;
  /** Largest row-to-row change from 4 px above the panel's top edge to 8 px below it. */
  worstStep: number;
  /** The row just above the panel's top edge against the row just below it. */
  acrossEdge: number;
}

/**
 * Screenshot the join (full hero width, 112 px above the panel's top edge to
 * 64 px below it) and read one pixel column at each edge.
 */
async function readJoin(page: Page, hero: Locator): Promise<{ left: ColumnReading; right: ColumnReading; background: Rgb }> {
  const g = await hero.evaluate((el) => {
    let panel = el.nextElementSibling as HTMLElement | null;
    while (panel && panel.style.minHeight !== '60vh') panel = panel.nextElementSibling as HTMLElement | null;
    const h = el.getBoundingClientRect();
    return { x: h.left, w: h.width, panelY: panel ? panel.getBoundingClientRect().top : NaN };
  });
  expect(Number.isFinite(g.panelY), 'the content panel is on the page').toBe(true);

  const clip = { x: Math.floor(g.x), y: Math.floor(g.panelY) - 112, width: Math.ceil(g.x + g.w) - Math.floor(g.x), height: 176 };
  expect(clip.y, 'the join is on screen with room above it').toBeGreaterThanOrEqual(0);
  const png = PNG.sync.read(await page.screenshot({ clip }));
  const scale = png.width / clip.width;
  const px = (x: number, y: number): Rgb => {
    const i = (y * png.width + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  const row = (cssY: number) => Math.max(0, Math.min(png.height - 1, Math.round((cssY - clip.y) * scale)));

  // A column a few px in from each edge: clear of a scaled stage's
  // antialiased outer pixel, well short of the centred name and icons.
  const inset = Math.round(6 * scale);
  const xLeft = Math.ceil((g.x - clip.x) * scale) + inset;
  const xRight = Math.floor((g.x + g.w - clip.x) * scale) - 1 - inset;

  const read = (x: number): ColumnReading & { background: Rgb } => {
    // "The background" at each row. On a gradient the page colour itself
    // changes down the column, so one sampled row is not the background 100 px
    // higher up. Fit a straight line per channel to the bare page below the
    // join (8-56 px under the panel's top edge: nothing but the page at this
    // column) and carry it upward. A solid colour fits a flat line.
    const fitTop = row(g.panelY + 8);
    const fitBottom = row(g.panelY + 56);
    const n = fitBottom - fitTop + 1;
    const meanY = (fitTop + fitBottom) / 2;
    let varY = 0;
    for (let y = fitTop; y <= fitBottom; y++) varY += (y - meanY) ** 2;
    const fit = [0, 1, 2].map((c) => {
      let mean = 0;
      for (let y = fitTop; y <= fitBottom; y++) mean += px(x, y)[c];
      mean /= n;
      let cov = 0;
      for (let y = fitTop; y <= fitBottom; y++) cov += (y - meanY) * (px(x, y)[c] - mean);
      return { mean, slope: varY ? cov / varY : 0 };
    });
    const backgroundAt = (y: number): Rgb =>
      fit.map((f) => Math.max(0, Math.min(255, f.mean + f.slope * (y - meanY)))) as Rgb;

    const top = row(g.panelY - 100);
    let lowest = Infinity;
    let worstRise = 0;
    for (let y = top; y <= fitTop; y++) {
      const d = dist(px(x, y), backgroundAt(y));
      if (d - lowest > worstRise) worstRise = d - lowest;
      if (d < lowest) lowest = d;
    }
    let worstStep = 0;
    for (let y = row(g.panelY - 4) + 1; y <= row(g.panelY + 8); y++) {
      worstStep = Math.max(worstStep, dist(px(x, y), px(x, y - 1)));
    }
    return {
      background: px(x, fitTop),
      photoDistance: dist(px(x, top), backgroundAt(top)),
      worstRise: Math.round(worstRise * 10) / 10,
      worstStep,
      acrossEdge: dist(px(x, row(g.panelY - 1)), px(x, row(g.panelY + 1))),
    };
  };
  const left = read(xLeft);
  const right = read(xRight);
  return { left, right, background: left.background };
}

function expectSeamless(reading: { left: ColumnReading; right: ColumnReading }, where: string) {
  for (const edge of ['left', 'right'] as const) {
    const c = reading[edge];
    const at = `${where}, ${edge} edge`;
    expect.soft(c.photoDistance, `${at}: the column starts on the photo, not on the page colour`).toBeGreaterThan(20);
    expect.soft(c.worstRise, `${at}: walking down, the distance to the background never increases`).toBeLessThanOrEqual(SLACK);
    expect.soft(c.worstStep, `${at}: no row steps away from the row before it across the panel's top edge`).toBeLessThanOrEqual(SLACK);
    expect.soft(c.acrossEdge, `${at}: the row above the panel's top edge equals the row below it`).toBeLessThanOrEqual(SLACK);
  }
}

const hexRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

for (const scale of [1, 3]) {
  test.describe(`TP.F2 — the join is one surface (public route, device scale ${scale})`, () => {
    test.use({ storageState: ANONYMOUS, deviceScaleFactor: scale });

    for (const background of BACKGROUNDS) {
      test(`${background.key}: no line at the join, at rest and scrolled`, async ({ page }) => {
        const hero = await openPublic(page, { background, text: '#ffffff' });
        for (const y of SCROLLS) {
          await scrollJoin(hero, y);
          const reading = await readJoin(page, hero);
          expectSeamless(reading, y === 0 ? 'at rest' : `scrolled ${y} px`);
          if (background.type === 'solid') {
            expect(dist(reading.background, hexRgb(background.solid_color)), 'below the join the page is its own colour').toBeLessThanOrEqual(SLACK);
          }
        }
      });
    }
  });
}

// ── the @handle default (S4) ─────────────────────────────────────────────────

const solid = (hex: string): Background => ({ key: hex, type: 'solid', solid_color: hex, gradient_css: '' });

async function handleColour(page: Page, pin: Pin): Promise<string> {
  await openPublic(page, pin);
  const handle = page.locator('[data-name-scrim] p').first();
  await expect(handle).toHaveText(`@${TEST_HANDLE}`);
  const colour = await handle.evaluate((el) => getComputedStyle(el).color);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return colour;
}

/** WCAG relative luminance of a computed `rgb(r, g, b)`. */
function luminance(css: string): number {
  const m = css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(m[0]) + 0.7152 * lin(m[1]) + 0.0722 * lin(m[2]);
}

test.describe('TP.F2 — the @handle default follows the page (public route)', () => {
  test.use({ storageState: ANONYMOUS });

  test('dark on a white page, pure white on a black page, and a picked colour is left alone', async ({ page }) => {
    // A light theme as every light theme is stored: a dark text colour.
    const onWhite = await handleColour(page, { background: solid('#ffffff'), text: '#0e0c09' });
    expect(luminance(onWhite), `on a white page the handle is dark (got ${onWhite})`).toBeLessThan(0.1);

    // A white page whose text colour was never changed from white: still readable.
    const onWhiteWhiteText = await handleColour(page, { background: solid('#ffffff'), text: '#ffffff' });
    expect(luminance(onWhiteWhiteText), `on a white page with white theme text the handle is still dark (got ${onWhiteWhiteText})`).toBeLessThan(0.1);

    const onBlack = await handleColour(page, { background: solid('#000000'), text: '#ffffff' });
    expect(onBlack, 'on a black page the handle is pure white').toBe('rgb(255, 255, 255)');

    const pickedOnWhite = await handleColour(page, { background: solid('#ffffff'), text: '#0e0c09', handleColor: '#12ab34' });
    expect(pickedOnWhite, 'a picked handle colour is used unchanged on a light page').toBe('rgb(18, 171, 52)');
    const pickedOnBlack = await handleColour(page, { background: solid('#000000'), text: '#ffffff', handleColor: '#12ab34' });
    expect(pickedOnBlack, 'a picked handle colour is used unchanged on a dark page').toBe('rgb(18, 171, 52)');
  });
});

// ── the editor canvas ────────────────────────────────────────────────────────

test.describe('TP.F2 — the join is one surface (editor canvas)', () => {
  // Desktop viewport + DPR 1 (spec 52's reasoning); the canvas is scoped to the
  // device frame so the CSS-hidden mobile render stays out of reach.
  test.use({ deviceScaleFactor: 1 });

  test('a 135-degree gradient: no line at the join in the editor', async ({ page }) => {
    await serveFlatHero(page);
    // Reads pinned; writes fall through to the deny fixture (nothing here writes).
    await page.route((url) => url.pathname === '/rest/v1/pages', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return rewriteRead(route, (row) => ({
        ...row,
        avatar_url: HERO_URL,
        avatar_original_url: HERO_URL,
        theme_json: pinTheme(row.theme_json, { background: DIAGONAL, text: '#0e0c09' }),
      }));
    });
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard/editor');
    const frame = page.getByTestId('device-frame');
    await expect(frame).toBeVisible({ timeout: 20_000 });
    const hero = frame.getByTestId('hero-sticky').first();
    await expect(hero).toBeVisible({ timeout: 20_000 });
    await heroSettled(page, hero);

    for (const y of [0, 61]) {
      await scrollJoin(hero, y);
      expectSeamless(await readJoin(page, hero), y === 0 ? 'editor, at rest' : `editor, scrolled ${y} px`);
    }
  });
});

/**
 * TP.F1 — the layer contract (src/lib/page-layers.ts), proven on today's pages.
 *
 * THE TEST (THEME.PREMIUM.3 plan, section K). Public route, both projects, one
 * case per page style as it ships. The hero image is replaced by a flat colour
 * through response interception and the name is painted pure magenta, a colour
 * used nowhere else on the page, so the screen itself can be read:
 *
 *   1. On top at rest — document.elementFromPoint inside the name's box returns
 *      the name (or a child of it).
 *   2. Not dimmed at rest — a screenshot of the name's box holds pure magenta
 *      pixels. A shade or fade painted over the name ignores pointer events, so
 *      check 1 cannot see it; this one can.
 *   3. After scrolling by the name's distance from the top — a layer-4 name has
 *      moved up by exactly the scroll distance, while the photo (layer 1) has
 *      not moved and the content (layer 4) is what now covers it.
 *
 * TP.F1 lands the hero and full-screen cases (NAME_LAYER's rows). Each later
 * brick adds its own row and case; a layer-3 name (on the photo) gets its
 * pinned-and-covered check with the first brick that puts one there.
 *
 * FIXTURE MODEL — an anonymous visitor on the battery handle, zero writes. The
 * `pages_public` read is passed through with its theme pinned (the page style
 * under test, a solid page colour, a hero with no video and an explicit Fill,
 * the magenta name) and its photo pointed at a fixture URL answered here with a
 * flat-colour PNG. Every mutating request is aborted.
 *
 * Layer roots: no element carries data-layer yet — layers 1, 2 and 4 render in
 * EditableProfileView.tsx, which is protected, and the attribute lands with the
 * brick that owns each region. Until then each root is found by a selector
 * that already exists (TODAY below); once `[data-layer="n"]` is on the page it
 * is used instead, with no change here.
 */
import { PNG } from 'pngjs';
import { test, expect, type Page, type Route } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';
import { LAYERS, NAME_LAYER, layerSelector } from '../src/lib/page-layers';
import type { PageStyle } from '../src/lib/theme-defaults';

// A passthrough read can still be in flight when a test ends; drop the routes.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const ANONYMOUS = { cookies: [], origins: [] };
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const NAME_COLOUR = '#ff00ff';
const PAGE_COLOUR = '#14181f';
const HERO_RGB: [number, number, number] = [32, 64, 96]; // dark, so the name gets no scrim
const HERO_URL = 'https://fixture.titilinks.test/tp-f1/flat-hero.png';

/** The public name (EditableProfileView, non-edit render). */
const NAME = '[data-name-scrim] h1';

/** Today's layer roots, by selectors that already exist. */
const TODAY = {
  /** Layer 1 on a hero page: the pinned photo box. */
  heroBox: '[data-testid="hero-sticky"]',
  /** Layer 1 on a full-screen page: the fixed photo layer. */
  fullScreenPhoto: 'div.fixed.inset-0.z-0',
  /** Layer 5: the top header. */
  header: '[data-testid="public-header"]',
} as const;

const layerName = (id: number) => LAYERS.find((l) => l.id === id)?.key ?? String(id);

function flatPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}
const HERO_PNG = flatPng(900, 1200, HERO_RGB);

/** EditableProfileView's default headerConfig (used when the row has none). */
const HEADER_DEFAULTS = {
  nameSize: 28, handleSize: 14, nameColor: '#ffffff', handleColor: '#ffffff99', nameOffset: 0,
  iconsOffset: 0, namePadTop: 0, namePadBottom: 0, iconsPaddingY: 8, iconSize: 'medium', nameHandleGap: 2,
};

/** The stored theme pinned for the layer test (never the account's own look). */
function pinLayers(raw: unknown, style: PageStyle) {
  const t = JSON.parse(JSON.stringify(raw && typeof raw === 'object' ? raw : {}));
  t.background = { ...(t.background || {}), type: 'solid', solid_color: PAGE_COLOUR, gradient_css: '', image_url: '' };
  t.header = { ...(t.header || {}), image_url: '' };
  t.typography = { ...(t.typography || {}), text_color: '#ffffff' };
  delete t.typography.text_effect;
  t.auto_contrast = false;
  t.pageStyle = style;
  t.pages = { ...(t.pages || {}), page1: { ...(t.pages?.page1 || {}), style } };
  t.heroConfig = { fit: 'fill', posY: 25 }; // no video, and an explicit fit (no logo auto-Fit)
  t.headerConfig = { ...HEADER_DEFAULTS, ...(t.headerConfig || {}), nameColor: NAME_COLOUR };
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

async function openPublic(page: Page, style: PageStyle) {
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    if (!MUTATING.has(req.method())) return route.fallback();
    if (req.url().includes('/rest/v1/rpc/get_public_')) return route.fallback();
    return route.abort('blockedbyclient');
  });
  await page.route((url) => url.hostname === 'fixture.titilinks.test', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: HERO_PNG }));
  await page.route('**/rest/v1/pages_public*', async (route) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('handle=eq.')) return route.fallback();
    return rewriteRead(route, (row) => ({ ...row, avatar_url: HERO_URL, theme_json: pinLayers(row.theme_json, style) }));
  });

  await page.goto(`/${TEST_HANDLE}`);
  const name = page.locator(NAME).first();
  await expect(name).toBeVisible({ timeout: 20_000 });
  // The flat photo is the one on screen, decoded.
  await expect.poll(() => page.evaluate((url) => [...document.images].some(
    (i) => (i.currentSrc || i.src) === url && i.complete && i.naturalWidth > 0), HERO_URL), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  return name;
}

/** Pixels in a viewport clip within `tol` of pure magenta. */
async function magentaPixels(page: Page, clip: { x: number; y: number; width: number; height: number }, tol = 6) {
  const png = PNG.sync.read(await page.screenshot({ clip }));
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] >= 255 - tol && png.data[i + 1] <= tol && png.data[i + 2] >= 255 - tol) n++;
  }
  return n;
}

for (const style of Object.keys(NAME_LAYER) as PageStyle[]) {
  const nameLayer = NAME_LAYER[style];

  test.describe(`TP.F1 — layers on a ${style} page (public route)`, () => {
    test.use({ storageState: ANONYMOUS });

    test(`the name is on top and undimmed at rest, and travels with layer ${nameLayer} (${layerName(nameLayer)})`, async ({ page }) => {
      const name = await openPublic(page, style);
      const box = await name.boundingBox();
      expect(box, 'the name has a box').not.toBeNull();
      const rest = box!;

      // ── 1. On top at rest ────────────────────────────────────────────────
      const onTop = await name.evaluate((el, [x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return { ok: !!hit && (hit === el || el.contains(hit)), hit: hit ? `${hit.tagName}.${(hit as HTMLElement).className}` : 'nothing' };
      }, [rest.x + rest.width / 2, rest.y + rest.height / 2]);
      expect(onTop.ok, `the element at the centre of the name is the name (got ${onTop.hit})`).toBe(true);

      // ── 2. Not dimmed at rest ────────────────────────────────────────────
      await expect.poll(() => magentaPixels(page, rest), {
        message: 'the name box shows pure magenta - nothing shades or fades it',
        timeout: 5_000,
      }).toBeGreaterThan(25);
      const control = { x: rest.x, y: Math.max(0, rest.y - 48), width: rest.width, height: Math.min(40, rest.y) };
      if (control.height > 4) expect(await magentaPixels(page, control), 'magenta is the name alone').toBe(0);

      // ── 3. After scrolling by the name's distance from the top ───────────
      if (nameLayer !== 4) {
        throw new Error(`a layer-${nameLayer} name: its pinned-and-covered check lands with the brick that puts the name there`);
      }
      const after = await page.evaluate(async ({ nameSel, style, today, panelSel, photoSel }) => {
        const name = document.querySelector(nameSel) as HTMLElement;
        const heroBox = document.querySelector(today.heroBox) as HTMLElement;
        // Layer 4: [data-layer="4"] once it exists; today the hero box's next
        // sibling with the 60vh floor (spec 92's reading of the same panel).
        let panel = document.querySelector(panelSel) as HTMLElement | null;
        if (!panel) {
          panel = heroBox?.nextElementSibling as HTMLElement | null;
          while (panel && panel.style.minHeight !== '60vh') panel = panel.nextElementSibling as HTMLElement | null;
        }
        // Layer 1: [data-layer="1"] once it exists; today the hero box, or the
        // fixed photo layer that holds the full-screen image.
        const photo = (document.querySelector(photoSel) as HTMLElement | null)
          ?? (style === 'full_bleed'
            ? ([...document.querySelectorAll(today.fullScreenPhoto)].find((el) => el.querySelector('[data-hero-framing]')) as HTMLElement | undefined) ?? null
            : heroBox);
        if (!name || !panel || !photo) {
          return {
            error: `missing: ${!name ? 'name ' : ''}${!panel ? 'layer 4 ' : ''}${!photo ? 'layer 1' : ''}`,
            nameInLayer4: false, distance: 0, scrolled: 0, nameMoved: 0, photoMoved: 0, overlap: 0,
            coveredByContent: false, hit: '',
          };
        }

        // The scroller: the desktop stage's own scroll box, else the document.
        let sc: HTMLElement | null = name.parentElement;
        while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
        const scroller = (sc ?? document.scrollingElement) as HTMLElement;
        const isDoc = scroller === document.scrollingElement;
        // The stage is scaled; measure in the scroller's own CSS pixels.
        const scale = isDoc ? 1 : scroller.getBoundingClientRect().height / scroller.offsetHeight;
        const origin = () => (isDoc ? 0 : scroller.getBoundingClientRect().top);
        const top = (el: Element) => (el.getBoundingClientRect().top - origin()) / scale;
        const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

        const distance = top(name);
        const photo0 = top(photo);
        const s0 = scroller.scrollTop;
        scroller.scrollTo({ top: s0 + distance, behavior: 'instant' as ScrollBehavior });
        await frames();
        const scrolled = scroller.scrollTop - s0;

        // Layer 4 now covers layer 1: the element at a point where both are,
        // clear of the header, belongs to the content and not to the photo.
        const pr = panel.getBoundingClientRect();
        const hr = photo.getBoundingClientRect();
        const header = document.querySelector(today.header);
        const yTop = Math.max(pr.top, hr.top, header ? header.getBoundingClientRect().bottom : 0);
        const yBottom = Math.min(pr.bottom, hr.bottom);
        const x = (Math.max(pr.left, hr.left) + Math.min(pr.right, hr.right)) / 2;
        const hit = yBottom - yTop > 8 ? document.elementFromPoint(x, (yTop + yBottom) / 2) : null;

        return {
          error: null as string | null,
          nameInLayer4: panel.contains(name),
          distance,
          scrolled,
          nameMoved: distance - top(name),
          photoMoved: photo0 - top(photo),
          overlap: yBottom - yTop,
          coveredByContent: !!hit && panel.contains(hit) && !photo.contains(hit),
          hit: hit ? `${hit.tagName}.${(hit as HTMLElement).className}`.slice(0, 80) : 'nothing',
        };
      }, { nameSel: NAME, style, today: TODAY, panelSel: layerSelector(4), photoSel: layerSelector(1) });

      expect(after.error, 'every layer root is on the page').toBeNull();
      expect(after.nameInLayer4, 'the name lives in layer 4 (the scrolling content)').toBe(true);
      expect(after.distance, 'the name starts below the top').toBeGreaterThan(20);
      expect(Math.abs(after.scrolled - after.distance), `the page scrolled by the name's distance (${after.distance} px)`).toBeLessThanOrEqual(1);
      expect(Math.abs(after.nameMoved - after.scrolled), `the name moved up by exactly the scroll distance (moved ${after.nameMoved}, scrolled ${after.scrolled})`).toBeLessThanOrEqual(1);
      expect(Math.abs(after.photoMoved), 'the photo (layer 1) stayed pinned').toBeLessThanOrEqual(1);
      expect(after.overlap, 'the content now overlaps the photo').toBeGreaterThan(8);
      expect(after.coveredByContent, `layer 4 is above layer 1 where they overlap (got ${after.hit})`).toBe(true);
    });
  });
}

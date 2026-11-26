// TP.F3 — the name options in the Name & Handle hub. TP.F4 extends this file.
//
// TP.F3 adds three catalog fonts (src/lib/fonts.ts + src/lib/fonts.css): DM
// Sans, Barlow Condensed and Source Serif 4. Every picker maps FONT_OPTIONS,
// so the hub's Font tab is the surface under test. For each new font:
//   1. its button is listed in the hub Font tab;
//   2. clicking it puts that family first in the computed font-family of the
//      name on the canvas — the unsaved hub font draft (L4) previews there;
//   3. document.fonts holds a FontFace of that family whose status is
//      'loaded', paired with document.fonts.check (spec 76: check() alone is
//      also true for a family with no @font-face at all);
//   4. no request went to fonts.googleapis.com or fonts.gstatic.com.
// The panel then closes without saving and the canvas name goes back to the
// font it had before the hub opened.
//
// The battery account, signed in. Nothing is saved and nothing is opted in:
// the hub only moves a draft until Keep, and Keep is never pressed. Desktop
// and mobile — the canvas name is the visible EditableProfileView's (the
// desktop device frame or the mobile lg:hidden branch; the other is
// display:none, so filter({ visible: true }) picks the right one).

import { test, expect, type Page, type Route } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

const NEW_FONTS = [
  { label: 'DM Sans', family: 'DM Sans' },
  { label: 'Barlow Condensed', family: 'Barlow Condensed' },
  { label: 'Source Serif 4', family: 'Source Serif 4' },
] as const;

const isGoogle = (url: string) => /googleapis|gstatic/.test(new URL(url).host);
const firstFamily = (stack: string) => stack.split(',')[0].trim().replace(/["']/g, '');

/** The inline-editable name on the visible canvas (its placeholder is the @handle). */
const canvasName = (page: Page) => page.locator('input[placeholder^="@"]').filter({ visible: true }).first();

/** The slide-in panel (ProfileDashboard). */
const panel = (page: Page) => page.locator('.fixed.top-16');

const nameFont = (page: Page) =>
  canvasName(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { stack: cs.fontFamily, weight: cs.fontWeight };
  });

/** document.fonts.check for `spec`, and whether a FontFace of `family` has actually loaded. */
const fontState = (page: Page, family: string, spec: string) =>
  page.evaluate(
    ({ family, spec }) => ({
      check: document.fonts.check(spec),
      loaded: [...document.fonts].some(
        (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
      ),
    }),
    { family, spec },
  );

/** The spec 83 route: Edit Profile → Name & Handle → Font. */
async function openFontTab(page: Page) {
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /name & handle/i }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Font', exact: true }).click();
}

test.describe('TP.F3 — the three new catalog fonts in the hub Font tab', () => {
  for (const font of NEW_FONTS) {
    test(`${font.label}: listed, previews on the canvas name, loads self-hosted`, async ({ page }) => {
      const urls: string[] = [];
      page.on('request', (r) => urls.push(r.url()));

      await page.goto('/dashboard/editor');
      await page.waitForLoadState('networkidle');
      await expect(canvasName(page)).toBeVisible({ timeout: 20_000 });
      const before = await nameFont(page);

      await openFontTab(page);

      // 1. Listed.
      const button = panel(page).getByRole('button', { name: font.label, exact: true });
      await expect(button).toBeVisible();

      // 2. The draft previews on the canvas name.
      await button.click();
      await expect.poll(async () => firstFamily((await nameFont(page)).stack), {
        message: `the canvas name's font-family starts with '${font.family}'`,
      }).toBe(font.family);

      // 3. A real face of that family loaded (at the name's own weight).
      const { weight } = await nameFont(page);
      const spec = `${weight} 1em '${font.family}'`;
      await expect.poll(async () => (await fontState(page, font.family, spec)).loaded, {
        message: `a '${font.family}' FontFace reached status 'loaded'`,
      }).toBe(true);
      expect((await fontState(page, font.family, spec)).check, `document.fonts.check("${spec}")`).toBe(true);

      // 4. Never from Google.
      expect(urls.filter(isGoogle), 'no Google Fonts request').toEqual([]);

      // Close without saving: the draft dies and the saved font comes back.
      await panel(page).locator(':scope > div').first().getByRole('button').last().click();
      await expect(panel(page)).toHaveCount(0);
      await expect.poll(async () => (await nameFont(page)).stack, {
        message: 'the canvas name is back on its saved font',
      }).toBe(before.stack);
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// TP.F4 — the free header arrangement options (theme_json.look.options):
// namePlacement page|below, nameAlign center|left, showHandle on|off,
// handlePosition under|beside, iconsAlign center|left|right.
//
// FIXTURE MODEL — the battery account, read through patched rows: the public
// `pages_public` read and the editor's own `pages` read are passed through
// with their theme pinned (solid page colour, explicit Fill, no text effect,
// default header spacing, the page font pinned to Playfair Display — the
// public <h1> always renders in Playfair (index.css styles every h1), so with
// the canvas input on the same face the two name widths are equal and their
// left edges can be compared) and the look options under test written in.
// No real write: hub and Social Platforms saves are captured and answered 204
// (the spec 27 convention); every other write falls to the deny fixture.
//
// WHERE THINGS ARE MEASURED. Every position is in the page column's own CSS
// px (the desktop stage and the editor frame are scaled; the scale is read
// off the hero box). "The photo's bottom edge" is the content panel's top
// edge — where the page colour stops letting the photo through. (The hero box
// itself runs 32 px further down under the panel, and in the mobile editor its
// sticky top pushes it 8 px lower again, so its own bottom is not a stable
// reference.) The name's vertical position is its element's top: the public
// <h1> and the canvas <input> both start HEADER_NAME_TOP under the same edge.
// ═════════════════════════════════════════════════════════════════════════════

type LookOptions = Partial<Record<'namePlacement' | 'nameAlign' | 'showHandle' | 'handlePosition' | 'iconsAlign', string>>;
type Style = 'hero' | 'full_bleed';
interface Pin { style: Style; options?: LookOptions; displayName?: string }

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LONG_NAME = 'Alexandria Montgomery-Wilson'; // 28 characters

function pinLook(raw: unknown, pin: Pin) {
  const t = JSON.parse(JSON.stringify(raw && typeof raw === 'object' ? raw : {}));
  t.background = { ...(t.background || {}), type: 'solid', solid_color: '#14181f', gradient_css: '', image_url: '' };
  t.header = { ...(t.header || {}), image_url: '' };
  t.typography = { ...(t.typography || {}), text_color: '#ffffff', font: 'playfair' };
  delete t.typography.text_effect;
  t.auto_contrast = false;
  t.pageStyle = pin.style;
  t.pages = { ...(t.pages || {}), page1: { ...(t.pages?.page1 || {}), style: pin.style } };
  t.heroConfig = { fit: 'fill', posY: 25 };
  if (t.headerConfig && typeof t.headerConfig === 'object') delete t.headerConfig.spacing;
  delete t.look;
  if (pin.options && Object.keys(pin.options).length) t.look = { v: 1, options: { ...pin.options } };
  return t;
}

async function rewriteRows(route: Route, fn: (row: any) => any) {
  const res = await route.fetch();
  const body = await res.json();
  const out = Array.isArray(body)
    ? body.map((r) => (r && 'theme_json' in r ? fn(r) : r))
    : body && typeof body === 'object' && 'theme_json' in body ? fn(body) : body;
  await route.fulfill({ response: res, body: JSON.stringify(out) });
}

const patchRow = (pin: Pin) => (row: any) => ({
  ...row,
  ...(pin.displayName ? { display_name: pin.displayName } : {}),
  theme_json: pinLook(row.theme_json, pin),
});

async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await page.waitForTimeout(900); // the blocks' entrance motion
}

/** The public page, read pinned. Mutations are aborted (a visitor writes nothing). */
async function openPublic(page: Page, pin: Pin) {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    if (!MUTATING.has(req.method())) return route.fallback();
    if (req.url().includes('/rest/v1/rpc/get_public_')) return route.fallback();
    return route.abort('blockedbyclient');
  });
  await page.route('**/rest/v1/pages_public*', async (route) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('handle=eq.')) return route.fallback();
    return rewriteRows(route, patchRow(pin));
  });
  await page.goto(`/${TEST_HANDLE}`);
  await expect(page.locator('[data-name-scrim] h1').first()).toBeVisible({ timeout: 20_000 });
  await settled(page);
}

/** The editor canvas, its own `pages` read pinned. Writes: see `writes`. */
async function openCanvas(page: Page, pin: Pin, writes?: { pages: any[]; other: string[] }) {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  if (writes) {
    await page.route('**/*.supabase.co/**', async (route) => {
      const req = route.request();
      if (MUTATING.has(req.method()) && !/auth\/v1\/token|rpc\/(track_event|get_public_)/.test(req.url())) {
        writes.other.push(`${req.method()} ${new URL(req.url()).pathname}`);
      }
      return route.fallback();
    });
  }
  await page.route((url) => url.pathname === '/rest/v1/pages', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      if (!writes) return route.fallback();
      writes.pages.push({ method: req.method(), body: req.postDataJSON() });
      return route.fulfill({ status: 204, body: '' });
    }
    return rewriteRows(route, patchRow(pin));
  });
  await page.goto('/dashboard/editor');
  await expect(canvasName(page)).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  await settled(page);
}

interface HeaderReading {
  /** Column width, CSS px. */
  column: number;
  /** The name's text: left and right edges from the column's left, CSS px. */
  nameLeft: number;
  nameRight: number;
  /** The name element's top and bottom, measured from the photo's bottom edge (the panel top). */
  nameTop: number;
  nameBottom: number;
  handleShown: boolean;
  handleSameLine: boolean;
  /** 'left' | 'center' | 'right' — where the icon row's contents sit. */
  iconsSide: string;
  /** The icon row's bottom to the first block's top, CSS px. */
  iconsToFirstBlock: number;
  /** Anything in the header that sticks out of the column sideways, or text clipped in its own box. */
  overflow: string[];
  /** For the DOM checks of test 1. */
  scrimHasH1PlusP: boolean;
  rowClass: string;
  nameClass: string;
  handleIsNextSibling: boolean;
}

async function readHeader(page: Page, surface: 'public' | 'canvas'): Promise<HeaderReading> {
  return page.evaluate((surface) => {
    const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const name = (surface === 'public'
      ? document.querySelector('[data-name-scrim] h1')
      : [...document.querySelectorAll('input[placeholder^="@"]')].find(shown)) as HTMLElement;
    let root = name.parentElement as HTMLElement;
    while (root && !root.querySelector('[data-testid="hero-sticky"]')) root = root.parentElement as HTMLElement;
    const hero = root.querySelector('[data-testid="hero-sticky"]') as HTMLElement;
    let panel = hero.nextElementSibling as HTMLElement | null;
    while (panel && panel.style.minHeight !== '60vh') panel = panel.nextElementSibling as HTMLElement | null;
    const col = hero.getBoundingClientRect();
    const scale = col.width / hero.offsetWidth;
    const panelTop = panel!.getBoundingClientRect().top;
    const X = (x: number) => (x - col.left) / scale;
    const Y = (y: number) => (y - panelTop) / scale;

    // The name's text box.
    let text: { left: number; right: number; top: number; bottom: number };
    const el = name.getBoundingClientRect();
    if (surface === 'public') {
      const range = document.createRange();
      range.selectNodeContents(name);
      const r = range.getBoundingClientRect();
      text = { left: r.left, right: r.right, top: el.top, bottom: el.bottom };
    } else {
      const input = name as HTMLInputElement;
      const cs = getComputedStyle(input);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = cs.font;
      const w = Math.min(ctx.measureText(input.value || input.placeholder).width * scale, el.width);
      const pl = parseFloat(cs.paddingLeft) * scale;
      const left = cs.textAlign === 'center' ? el.left + (el.width - w) / 2
        : cs.textAlign === 'right' || cs.textAlign === 'end' ? el.right - w
        : el.left + pl;
      text = { left, right: left + w, top: el.top, bottom: el.bottom };
    }

    // The @handle: public `h1 + p`; canvas the card's `p` beside the input.
    let handle: HTMLElement | null = null;
    if (surface === 'public') {
      const next = name.nextElementSibling as HTMLElement | null;
      handle = next && next.tagName === 'P' ? next : null;
    } else {
      let up: HTMLElement | null = name.parentElement;
      for (let i = 0; i < 3 && up && !handle; i++, up = up.parentElement) {
        handle = ([...up.children].find((c) => c.tagName === 'P' && (c.textContent || '').startsWith('@')) as HTMLElement | undefined) ?? null;
      }
    }
    const hr = handle && shown(handle) ? handle.getBoundingClientRect() : null;
    const handleMid = hr ? (hr.top + hr.bottom) / 2 : 0;

    // The icon row and the first block after the header.
    const row = [...root.querySelectorAll('[data-icon-row]')].find(shown) as HTMLElement;
    const kids = [...row.children].filter(shown).map((c) => c.getBoundingClientRect());
    const minL = Math.min(...kids.map((r) => r.left));
    const maxR = Math.max(...kids.map((r) => r.right));
    const rr = row.getBoundingClientRect();
    const leftGap = X(minL);
    const rightGap = X(col.right) - X(maxR);
    const side = leftGap < rightGap - 4 ? 'left' : rightGap < leftGap - 4 ? 'right' : 'center';
    const blocks = surface === 'public'
      ? panel!.children[2] as HTMLElement
      : (panel!.children[2] as HTMLElement).children[1] as HTMLElement;
    const first = blocks.firstElementChild as HTMLElement;

    // Sideways overflow and clipped text, header only.
    const overflow: string[] = [];
    const header = surface === 'public' ? panel!.children[1] as HTMLElement : (panel!.children[2] as HTMLElement).children[0] as HTMLElement;
    for (const node of [header, ...header.querySelectorAll<HTMLElement>('*')]) {
      if (!shown(node) || node.closest('[data-icon-row]')) continue;
      const r = node.getBoundingClientRect();
      if (r.left < col.left - 0.5 || r.right > col.right + 0.5) overflow.push(`${node.tagName}.${node.className} sticks out (${Math.round(X(r.left))}..${Math.round(X(r.right))} of ${Math.round(col.width / scale)})`);
    }
    for (const t of [name, handle].filter(Boolean) as HTMLElement[]) {
      if (surface === 'public' && t.scrollWidth > t.clientWidth + 1) overflow.push(`${t.tagName} text clipped (${t.scrollWidth} > ${t.clientWidth})`);
    }
    if (surface === 'public') {
      const range = document.createRange();
      range.selectNodeContents(name);
      for (const r of range.getClientRects()) {
        if (r.left < col.left - 0.5 || r.right > col.right + 0.5) overflow.push('the name text runs past the column');
      }
    }
    const sc = document.scrollingElement!;
    if (sc.scrollWidth > sc.clientWidth + 1) overflow.push(`the page scrolls sideways (${sc.scrollWidth} > ${sc.clientWidth})`);

    return {
      column: col.width / scale,
      nameLeft: X(text.left),
      nameRight: X(text.right),
      nameTop: Y(text.top),
      nameBottom: Y(text.bottom),
      handleShown: !!hr,
      handleSameLine: !!hr && handleMid > text.top && handleMid < text.bottom,
      iconsSide: side,
      iconsToFirstBlock: (first.getBoundingClientRect().top - rr.bottom) / scale,
      overflow,
      scrimHasH1PlusP: surface === 'public' && !!document.querySelector('[data-name-scrim] > h1 + p'),
      rowClass: row.className,
      nameClass: name.className,
      handleIsNextSibling: !!handle && name.nextElementSibling === handle,
    };
  }, surface);
}

const round = (r: HeaderReading) => JSON.stringify({ ...r, overflow: r.overflow.length }, (_k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v));

// ── 1. No look options: today's header ──────────────────────────────────────

test.describe('TP.F4 — no look options: the header is today\'s', () => {
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  test('centred name, h1 + p, justify-center, name lifted above the panel top (public and canvas)', async ({ page }) => {
    const LIFTED = 95 - 10; // HEADER_OFFSET_Y - HEADER_NAME_TOP: the name's top above the panel's
    for (const surface of ['public', 'canvas'] as const) {
      if (surface === 'public') await openPublic(page, { style: 'hero' });
      else await openCanvas(page, { style: 'hero' });
      const r = await readHeader(page, surface);
      const where = `${surface}: ${round(r)}`;
      expect(Math.abs((r.nameLeft + r.nameRight) / 2 - r.column / 2), `${where}\nthe name is centred`).toBeLessThanOrEqual(1);
      expect(r.handleShown && !r.handleSameLine, `${where}\nthe handle shows, under the name`).toBe(true);
      expect(r.handleIsNextSibling, `${where}\nthe handle is the name's next sibling`).toBe(true);
      if (surface === 'public') expect(r.scrimHasH1PlusP, '[data-name-scrim] > h1 + p').toBe(true);
      if (surface === 'canvas') expect(r.nameClass, 'the canvas name input is centred').toContain('text-center');
      expect(r.rowClass, 'the fitted icon row is centred').toContain('justify-center');
      expect(r.iconsSide, where).toBe('center');
      expect(r.nameBottom, `${where}\nthe name is lifted above the panel's top edge`).toBeLessThan(0);
      expect(Math.abs(r.nameTop + LIFTED), `${where}\nthe name's top is today's ${LIFTED} px above the panel`).toBeLessThanOrEqual(1);
    }
  });
});

// ── 2. Each option value, and two pairs: public and canvas agree ────────────

const CASES: { key: string; options: LookOptions }[] = [
  { key: 'nameAlign left', options: { nameAlign: 'left' } },
  { key: 'namePlacement below', options: { namePlacement: 'below' } },
  { key: 'showHandle off', options: { showHandle: 'off' } },
  { key: 'handlePosition beside', options: { handlePosition: 'beside' } },
  { key: 'iconsAlign left', options: { iconsAlign: 'left' } },
  { key: 'iconsAlign right', options: { iconsAlign: 'right' } },
  { key: 'left + below', options: { nameAlign: 'left', namePlacement: 'below' } },
  { key: 'beside + left', options: { handlePosition: 'beside', nameAlign: 'left' } },
];

test.describe('TP.F4 — each option: the public page and the editor canvas agree', () => {
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  for (const c of CASES) {
    test(c.key, async ({ page }) => {
      const o = c.options;
      const pin: Pin = { style: 'hero', options: o };
      await openCanvas(page, pin);
      const canvas = await readHeader(page, 'canvas');
      await openPublic(page, pin);
      const pub = await readHeader(page, 'public');
      const both = `public ${round(pub)}\ncanvas ${round(canvas)}`;

      // The option itself shows.
      for (const r of [pub, canvas]) {
        const centre = (r.nameLeft + r.nameRight) / 2;
        if (o.nameAlign === 'left') expect(Math.abs(r.nameLeft - 24), `${both}\nleft: the name starts at the 1.5rem inset`).toBeLessThanOrEqual(1);
        else if (o.handlePosition !== 'beside') expect(Math.abs(centre - r.column / 2), `${both}\ncentre`).toBeLessThanOrEqual(1);
        if (o.namePlacement === 'below') expect(r.nameTop, `${both}\nbelow: the name starts under the photo's edge`).toBeGreaterThan(0);
        else expect(r.nameBottom, `${both}\nstandard: the name sits over the photo`).toBeLessThan(0);
        expect(r.handleShown, both).toBe(o.showHandle !== 'off');
        expect(r.handleSameLine, both).toBe(o.handlePosition === 'beside');
        expect(r.iconsSide, both).toBe(o.iconsAlign ?? 'center');
      }

      // The two surfaces agree.
      expect(Math.abs(pub.nameLeft - canvas.nameLeft), `${both}\nthe name's left edge`).toBeLessThanOrEqual(2);
      expect(Math.abs(pub.nameTop - canvas.nameTop), `${both}\nthe name's top from the photo's bottom edge`).toBeLessThanOrEqual(2);
      expect(canvas.handleShown, both).toBe(pub.handleShown);
      expect(canvas.handleSameLine, both).toBe(pub.handleSameLine);
      expect(canvas.iconsSide, both).toBe(pub.iconsSide);
      console.log(`[TP.F4] ${test.info().project.name} ${c.key}: name top from the photo's edge — public ${pub.nameTop.toFixed(1)}, canvas ${canvas.nameTop.toFixed(1)}; left — public ${pub.nameLeft.toFixed(1)}, canvas ${canvas.nameLeft.toFixed(1)}`);

      // Below keeps today's icons → first block distance on each surface.
      if (o.namePlacement === 'below') {
        const today: Pin = { style: 'hero', options: { ...o, namePlacement: 'page' } };
        await openCanvas(page, today);
        const canvasToday = await readHeader(page, 'canvas');
        await openPublic(page, today);
        const pubToday = await readHeader(page, 'public');
        expect(Math.abs(pub.iconsToFirstBlock - pubToday.iconsToFirstBlock), `public icons → first block: below ${pub.iconsToFirstBlock}, standard ${pubToday.iconsToFirstBlock}`).toBeLessThanOrEqual(1);
        expect(Math.abs(canvas.iconsToFirstBlock - canvasToday.iconsToFirstBlock), `canvas icons → first block: below ${canvas.iconsToFirstBlock}, standard ${canvasToday.iconsToFirstBlock}`).toBeLessThanOrEqual(1);
      }
    });
  }
});

// ── 3. Full-screen page: `below` renders as standard ────────────────────────

test.describe('TP.F4 — a full-screen page with below renders as standard', () => {
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  test('public and canvas: the name is where it is with no option at all', async ({ page }) => {
    for (const surface of ['public', 'canvas'] as const) {
      const open = surface === 'public' ? openPublic : openCanvas;
      await open(page, { style: 'full_bleed' });
      const standard = await readHeader(page, surface);
      await open(page, { style: 'full_bleed', options: { namePlacement: 'below' } });
      const below = await readHeader(page, surface);
      expect(Math.abs(below.nameTop - standard.nameTop), `${surface}: ${round(below)} vs ${round(standard)}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(below.iconsToFirstBlock - standard.iconsToFirstBlock), `${surface}: icons → first block`).toBeLessThanOrEqual(0.5);
      expect(below.nameBottom, `${surface}: the name still sits over the photo`).toBeLessThan(0);
    }
  });
});

// ── 4. 360 px wide, a 28-character name, every arrangement ──────────────────

const ARRANGEMENTS: { key: string; options: LookOptions }[] = [
  { key: 'standard', options: {} },
  { key: 'left', options: { nameAlign: 'left' } },
  { key: 'below', options: { namePlacement: 'below' } },
  { key: 'below + left', options: { namePlacement: 'below', nameAlign: 'left' } },
  { key: 'handle off', options: { showHandle: 'off' } },
  { key: 'beside', options: { handlePosition: 'beside' } },
  { key: 'left + beside', options: { nameAlign: 'left', handlePosition: 'beside' } },
  { key: 'below + left + beside', options: { namePlacement: 'below', nameAlign: 'left', handlePosition: 'beside' } },
  { key: 'below + left, no handle, icons left', options: { namePlacement: 'below', nameAlign: 'left', showHandle: 'off', iconsAlign: 'left' } },
  { key: 'icons right', options: { iconsAlign: 'right' } },
];

test.describe('TP.F4 — 360 px, a 28-character name: nothing overflows, no text is clipped', () => {
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  test('every arrangement, public page and canvas', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 360, height: 780 });
    for (const a of ARRANGEMENTS) {
      const pin: Pin = { style: 'hero', options: a.options, displayName: LONG_NAME };
      await openPublic(page, pin);
      const pub = await readHeader(page, 'public');
      expect.soft(pub.overflow, `public, ${a.key}: ${round(pub)}`).toEqual([]);
      if (a.options.handlePosition === 'beside') {
        // Too long to share a line: the handle wraps underneath, inside the column.
        expect.soft(pub.handleSameLine, `public, ${a.key}: the handle wrapped underneath`).toBe(false);
      }
      // The canvas name is a one-line <input>: it scrolls its own text, as it
      // always has. What it must not do is push past the column.
      await openCanvas(page, pin);
      const canvas = await readHeader(page, 'canvas');
      expect.soft(canvas.overflow, `canvas, ${a.key}: ${round(canvas)}`).toEqual([]);
    }
  });
});

// ── 5. The controls: live preview, one write, Cancel sends nothing ──────────

/** Edit Profile → Name & Handle (the spec 83 route). */
async function openHub(page: Page) {
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /name & handle/i }).filter({ visible: true }).first().click();
  await expect(panel(page).getByRole('button', { name: 'Layout', exact: true })).toBeVisible();
}

test.describe('TP.F4 — the hub and Social Platforms controls', () => {
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  test('each control previews before Save; Save sends one update with only the non-default choices; Cancel sends nothing; icon chips send one update per tap', async ({ page }) => {
    test.setTimeout(120_000);
    const writes = { pages: [] as any[], other: [] as string[] };
    // Saved: the name aligned left — so setting Center has a stored key to remove.
    await openCanvas(page, { style: 'hero', options: { nameAlign: 'left' } }, writes);
    const canvas = () => readHeader(page, 'canvas');
    expect(Math.abs((await canvas()).nameLeft - 24), 'saved: left').toBeLessThanOrEqual(1);

    await openHub(page);
    const p = panel(page);
    const handleSwitch = p.getByRole('switch', { name: 'Show @handle' });
    const handleRow = p.getByText('Handle position', { exact: true });

    // Name tab: Show @handle, then Handle position under it.
    await expect(handleSwitch).toBeChecked();
    await expect(handleRow).toBeVisible();
    await handleSwitch.click();
    await expect.poll(async () => (await canvas()).handleShown, { message: 'handle off previews' }).toBe(false);
    await expect(handleRow).toHaveCount(0);
    await handleSwitch.click();
    await expect.poll(async () => (await canvas()).handleShown, { message: 'handle on again' }).toBe(true);
    await p.getByRole('button', { name: 'Beside the name', exact: true }).click();
    await expect.poll(async () => (await canvas()).handleSameLine, { message: 'beside previews' }).toBe(true);

    // Layout tab: Alignment only. The name, handle and icons always stay on the
    // fade, so there is no "Where the name sits" row and no "Below the photo".
    await p.getByRole('button', { name: 'Layout', exact: true }).click();
    await expect(p.getByText('Alignment', { exact: true })).toBeVisible();
    await expect(p.getByText('Where the name sits', { exact: true }), 'the placement row is gone').toHaveCount(0);
    await expect(p.getByRole('button', { name: 'Below the photo', exact: true }), 'and so is its button').toHaveCount(0);
    await p.getByRole('button', { name: 'Center', exact: true }).click();
    await expect.poll(async () => (await canvas()).nameLeft, { message: 'center previews: no longer at the left inset' }).toBeGreaterThan(30);

    // Cancel: nothing is sent, the canvas is back on what is saved.
    await p.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(async () => { const r = await canvas(); return [Math.round(r.nameLeft), r.nameTop < 0, r.handleShown, r.handleSameLine]; }, { message: 'Cancel restores the saved look' })
      .toEqual([24, true, true, false]);
    expect(writes.pages, 'Cancel sends nothing').toEqual([]);
    expect(writes.other, 'no other write either').toEqual([]);

    // Again, then Save: ONE pages update, only the non-default choices.
    await p.getByRole('button', { name: 'Left', exact: true }).click();
    await p.getByRole('button', { name: 'Name', exact: true }).click();
    await p.getByRole('button', { name: 'Beside the name', exact: true }).click();
    await p.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => writes.pages.length, { message: 'Save sends one pages update' }).toBe(1);
    await page.waitForTimeout(500);
    expect(writes.pages.length, 'exactly one').toBe(1);
    expect(writes.other, 'and nothing else').toEqual([]);
    const saved = writes.pages[0].body.theme_json;
    expect(saved.look, 'the look record holds exactly the non-default choices').toEqual({ v: 1, options: { nameAlign: 'left', handlePosition: 'beside' } });
    expect(saved.headerConfig, 'the rest of the hub save is still there').toBeTruthy();

    // Social Platforms: Alignment chips save on tap, one update each.
    await panel(page).locator(':scope > div').first().getByRole('button').last().click();
    await expect(panel(page)).toHaveCount(0);
    await page.getByTestId('icon-row-add').filter({ visible: true }).first().click();
    const align = panel(page).getByText('Alignment', { exact: true }).locator('..');
    await expect(align).toBeVisible();
    const expected: [string, Record<string, string>][] = [
      ['Left', { nameAlign: 'left', iconsAlign: 'left' }],
      ['Right', { nameAlign: 'left', iconsAlign: 'right' }],
      ['Center', { nameAlign: 'left' }],
    ];
    for (const [i, [chip, options]] of expected.entries()) {
      await align.getByRole('button', { name: chip, exact: true }).click();
      await expect.poll(() => writes.pages.length, { message: `${chip}: one update` }).toBe(2 + i);
      expect(writes.pages[1 + i].body.theme_json.look, `${chip}: the stored look`).toEqual({ v: 1, options });
    }
    await page.waitForTimeout(500);
    expect(writes.pages.length, 'one update per tap').toBe(4);
    expect(writes.other).toEqual([]);
  });
});

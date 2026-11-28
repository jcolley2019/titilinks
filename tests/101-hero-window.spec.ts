// HERO.FIT.2 — the hero stores its framed window.
//
// "Apply Crop" used to bake exactly the framed rectangle into the display file.
// It could not be reopened, and a screen whose hero box is another shape cut it
// again (20-27% of the height on short phones, HERO.FIT.0). Now the display
// file is the framed area plus only the margin other box shapes can show
// (heroDisplayRegion), and the page paints a stored WINDOW over it through the
// unchanged hero resolver:
//
//   1. Apply Crop writes `window` + `windowSource`, fit 'fill', posX/posY 50 and
//      no `scale`, even over a config that held scale 1.2 / posX 30;
//   2. the uploaded display file is the region heroDisplayRegion gives — not the
//      framed rectangle alone, and not the whole picture;
//   3. framed == shown in the editor (default preset) and on public 402×874;
//   4. on public 393×659 and 375×553 the framed window is still whole;
//   5. the pencil reopens the photo editor on the kept original, on the framed
//      window; OK or X with nothing touched sends no request that writes;
//   6. OK straight after a new pick stores the zoom-1 centred window (and no
//      windowSource when the original did not upload), over a stale window;
//   7. a full-screen page: 1 and 3 with the full-screen frame;
//   8. identity: a hero stored with Fit, one with Fill + posY and no window, one
//      with a window, and a full-screen page paint exactly what they painted
//      before PHOTO.EDITOR.1 (the inline style and data-hero-framing recorded
//      on the unchanged source);
//   9. a pick opens the photo editor directly, in English and in Spanish: no
//      Fill, Fit, position slider, Crop Image, Back or Apply Crop.
//
// PHOTO.EDITOR.1: the two-step dialog (Edit Photo, then Crop Image) is ONE
// screen, src/components/HeroPhotoEditor.tsx — "Apply Crop" above is its OK.
//
// Built the way HERO.FIT.0 measured. Battery account; the `pages` /
// `pages_public` reads are the real row with the hero stamped on; EVERY write is
// captured and fulfilled HERE — the `avatars` uploads (their bytes read in the
// page before the request leaves), the `pages` PATCH, the superseded-object
// DELETEs. Nothing reaches a real table or bucket: a real hero save would delete
// the seeded hero asset the reseed SQL points at. `ai-enhance` is never called.
//
// The ruler: a 2000×3000 picture whose red encodes x and green encodes y, with
// a blue grid line every 100 px. Any file cut from it decodes back to the exact
// source window it holds (the grid lines pin file pixels to source pixels, so a
// lossy encode's colour drift cannot bias it).
import { PNG } from 'pngjs';
import { test, expect, type Page, type Route } from './fixtures';
import { TEST_HANDLE, PINNED_TEST_USER_ID } from './helpers/auth';
import { translations } from '../src/hooks/useLanguage';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '../src/lib/device-presets';
import { HERO_BOX_ASPECTS, heroDisplayRegion } from '../src/lib/hero-window';
import { pictureFitSeed, writePictureFit } from '../src/lib/picture-fit';
import { heroDialog, editorZoom, editorOk, editorNewPhoto, photoEditorReady } from './helpers/hero-window-harness';

const EN = translations.en as Record<string, string>;
const SUPA = 'https://ohmvlypcbrfkuudcuqub.supabase.co';
const AVATARS = `${SUPA}/storage/v1/object/public/avatars/`;
const FIX_DIR = `${PINNED_TEST_USER_ID}/herofit2`;
const DESKTOP = { width: 1440, height: 1000 };
const BLOCK_ID = 'herofit2-links-block';
const SRC = { width: 2000, height: 3000 };
const FRAME = '[data-testid="device-frame"]';
/** Percent of the source: the brief's 0.5%. */
const TOL = 0.5;

type Style = 'hero' | 'full_bleed';
type Win = { x: number; y: number; w: number; h: number };
type Region = { x0: number; x1: number; y0: number; y1: number };
type Harness = {
  style: Style;
  heroConfig: Record<string, unknown>;
  avatarUrl: string | null;
  originalUrl: string | null;
  files: Map<string, { body: Buffer; type: string }>;
  patches: Record<string, unknown>[];
  uploads: { path: string; type: string; size: number }[];
  deletes: unknown[];
  /** Refuse the kept ORIGINAL's upload (the display copy still lands). */
  failOriginal?: boolean;
};

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');
const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const newHarness = (style: Style, heroConfig: Record<string, unknown>): Harness => ({
  style, heroConfig, avatarUrl: null, originalUrl: null,
  files: new Map(), patches: [], uploads: [], deletes: [],
});
/** The same stored state on a fresh page: files and row kept, the logs empty. */
const cloneHarness = (h: Harness): Harness => ({
  ...h, heroConfig: { ...h.heroConfig }, files: new Map(h.files), patches: [], uploads: [], deletes: [],
});
const objectPath = (url: string) => decodeURIComponent(url.split('/public/avatars/')[1].split('?')[0]);

/** Reads patched, every write captured and answered. */
async function install(page: Page, h: Harness) {
  // The upload body is a FormData holding a File — read its bytes in the page,
  // before the request leaves, so the route below can hand them to the spec.
  await page.addInitScript(() => {
    const w = window as unknown as { __heroUploads: Record<string, { b64: string; type: string }> };
    w.__heroUploads = {};
    const orig = window.fetch;
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const marker = '/storage/v1/object/avatars/';
        if ((init?.method || 'GET').toUpperCase() === 'POST' && url.includes(marker) && init?.body) {
          let blob: Blob | null = null;
          if (init.body instanceof FormData) {
            init.body.forEach((v) => { if (v instanceof Blob) blob = v; });
          } else if (init.body instanceof Blob) blob = init.body;
          if (blob) {
            const b = blob as Blob;
            const buf = new Uint8Array(await b.arrayBuffer());
            let s = '';
            for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            w.__heroUploads[decodeURIComponent(new URL(url).pathname.split(marker)[1])] = { b64: btoa(s), type: b.type };
          }
        }
      } catch { /* the spec fails on the missing capture */ }
      return orig.call(this, input, init);
    };
  });

  // One static links block, so the page under the hero is the same every run
  // (spec 99's mocks). Block writes are swallowed: the editor seeds defaults.
  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    try {
      const res = await route.fetch();
      const body = await res.json();
      const arr = Array.isArray(body) ? body : [];
      modeId = (arr.find((m: { type?: string }) => m?.type === 'page1') ?? arr[0])?.id ?? '';
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    } catch {
      try { await route.continue(); } catch { /* page already closing */ }
    }
  });
  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') return asJson(route, []);
    const block = { id: BLOCK_ID, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 0 };
    return asJson(route, wantsObject(route) ? block : [block]);
  });
  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') return asJson(route, []);
    const item = {
      id: 'herofit2-item', block_id: BLOCK_ID, label: 'HERO.FIT.2', url: 'https://fixture.titilinks.test/herofit2',
      is_adult: false, order_index: 0, subtitle: null, badge: null, image_url: null, size: 'default',
      bg_color: null, title_color: null, style_json: null,
    };
    return asJson(route, wantsObject(route) ? item : [item]);
  });

  // The real row, with this harness's hero stamped on (spec 23's method). A
  // visitor's row never carries the original (pages_public has no such column).
  const stamp = (row: unknown, isPublic: boolean) => {
    const r = row as Record<string, unknown>;
    if (!r || typeof r !== 'object' || !('theme_json' in r)) return row;
    const theme = { ...(r.theme_json as Record<string, unknown>) };
    delete theme.pages;
    delete theme.heroConfig_page2;
    delete theme.avatar_url_page2;
    delete theme.avatar_original_url_page2;
    if (theme.header && typeof theme.header === 'object') {
      const header = { ...(theme.header as Record<string, unknown>) };
      delete header.image_url;
      theme.header = header;
    }
    const out: Record<string, unknown> = {
      ...r, avatar_url: h.avatarUrl,
      theme_json: { ...theme, pageStyle: h.style, heroConfig: h.heroConfig },
    };
    if (!isPublic) out.avatar_original_url = h.originalUrl;
    return out;
  };
  const pagesRoute = (isPublic: boolean) => async (route: Route) => {
    const req = route.request();
    if (req.method() === 'PATCH' && !isPublic) {
      // The hero save: captured, applied to the stamped row, answered here.
      const body = req.postDataJSON() as Record<string, unknown>;
      h.patches.push(body);
      if (typeof body.avatar_url === 'string') h.avatarUrl = body.avatar_url;
      if (typeof body.avatar_original_url === 'string') h.originalUrl = body.avatar_original_url;
      const tj = body.theme_json as Record<string, unknown> | undefined;
      if (tj && tj.heroConfig && typeof tj.heroConfig === 'object') h.heroConfig = tj.heroConfig as Record<string, unknown>;
      return route.fulfill({ status: 204, body: '' });
    }
    if (req.method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    let body: unknown;
    try { body = await res.json(); } catch { return route.fulfill({ response: res }); }
    return asJson(route, Array.isArray(body) ? body.map((r) => stamp(r, isPublic)) : stamp(body, isPublic));
  };
  await page.route(/\/rest\/v1\/pages(\?|$)/, pagesRoute(false));
  await page.route(/\/rest\/v1\/pages_public/, pagesRoute(true));

  // The avatars bucket: uploads captured with their bytes, deletes recorded.
  await page.route(/\/storage\/v1\/object\/avatars(\/|\?|$)/, async (route) => {
    const req = route.request();
    if (req.method() === 'DELETE') {
      h.deletes.push(req.postDataJSON());
      return asJson(route, []);
    }
    if (req.method() !== 'POST') return route.fallback();
    const path = decodeURIComponent(new URL(req.url()).pathname.split('/storage/v1/object/avatars/')[1]);
    if (h.failOriginal && path.includes('-original.')) return asJson(route, { error: 'refused by the spec' }, 500);
    const got = await page.evaluate(
      (p) => (window as unknown as { __heroUploads: Record<string, { b64: string; type: string }> }).__heroUploads?.[p] ?? null,
      path,
    );
    if (!got) return route.fulfill({ status: 500, body: 'spec 101: the upload bytes were not captured' });
    const body = Buffer.from(got.b64, 'base64');
    h.files.set(path, { body, type: got.type });
    h.uploads.push({ path, type: got.type, size: body.length });
    return asJson(route, { Key: `avatars/${path}`, Id: 'herofit2' });
  });
  // …and served back, master and renditions alike (a rendition request gets the
  // same bytes: everything measured here is a rectangle, not a pixel).
  await page.route(/\/storage\/v1\/(object|render\/image)\/public\/avatars\//, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const f = h.files.get(objectPath(route.request().url()));
    if (!f) return route.fallback();
    return route.fulfill({
      status: 200, body: f.body, contentType: f.type,
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    });
  });
}

/** The ruler: red = x, green = y (256 levels each), a blue grid line every 100 px. */
let rulerCache: Buffer | null = null;
function rulerPng(): Buffer {
  if (rulerCache) return rulerCache;
  const { width: W, height: H } = SRC;
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const line = x % 100 < 2 || y % 100 < 2;
    const bold = x % 500 < 2 || y % 500 < 2;
    png.data[i] = Math.floor((x * 256) / W);
    png.data[i + 1] = Math.floor((y * 256) / H);
    png.data[i + 2] = bold ? 150 : line ? 90 : 40;
    png.data[i + 3] = 255;
  }
  rulerCache = PNG.sync.write(png);
  return rulerCache;
}

/**
 * Decode a file cut from the ruler back to the source window it holds (source
 * px). Coarse: a line fitted through the red / green levels. Fine: each blue
 * grid line found in the file pins a file position to an exact source position
 * (2 px wide, centred on 100k + 1), and a second fit runs through those.
 */
const decodeRuler = (page: Page, file: { body: Buffer; type: string }) => page.evaluate(async ({ b64, mime, W, H }) => {
  const img = new Image();
  img.src = `data:${mime};base64,${b64}`;
  await img.decode();
  const fw = img.naturalWidth, fh = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = fw; c.height = fh;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, fw, fh).data;
  const line = (pts: [number, number][]) => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [u, v] of pts) { sx += u; sy += v; sxx += u * u; sxy += u * v; }
    const m = pts.length;
    const a = (m * sxy - sx * sy) / (m * sxx - sx * sx);
    return { a, b: (sy - a * sx) / m };
  };
  const axis = (n: number, other: number, at: (k: number, j: number) => number, channel: number, span: number) => {
    const SAMPLES = 64;
    const mean = (k: number, ch: number) => {
      let sum = 0;
      for (let j = 0; j < SAMPLES; j++) sum += d[at(k, Math.floor(((j + 0.5) * other) / SAMPLES)) + ch];
      return sum / SAMPLES;
    };
    const coarsePts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const level = mean(k, channel);
      if (level >= 12 && level <= 243) coarsePts.push([k + 0.5, ((level + 0.5) * span) / 256]);
    }
    const coarse = line(coarsePts);
    const blue: number[] = [];
    for (let k = 0; k < n; k++) blue.push(mean(k, 2));
    const base = [...blue].sort((p, q) => p - q)[Math.floor(n / 2)];
    const pins: [number, number][] = [];
    for (let k = 6; k < n - 6; k++) {
      const v = blue[k] - base;
      if (v < 12) continue;
      let peak = true;
      for (let j = -4; j <= 4; j++) if (blue[k + j] - base > v) peak = false;
      if (!peak) continue;
      let num = 0, den = 0;
      for (let j = -4; j <= 4; j++) { const e = Math.max(0, blue[k + j] - base); num += e * (k + j + 0.5); den += e; }
      const u = num / den;
      const guess = coarse.a * u + coarse.b;
      const grid = 100 * Math.round((guess - 1) / 100) + 1;
      if (Math.abs(guess - grid) < 35) pins.push([u, grid]);
      k += 4;
    }
    const fine = pins.length >= 3 ? line(pins) : coarse;
    return { from: fine.b, to: fine.b + fine.a * n };
  };
  const xs = axis(fw, fh, (x, y) => (y * fw + x) * 4, 0, W);
  const ys = axis(fh, fw, (y, x) => (y * fw + x) * 4, 1, H);
  return { x0: xs.from, x1: xs.to, y0: ys.from, y1: ys.to, fileW: fw, fileH: fh };
}, { b64: file.body.toString('base64'), mime: file.type, W: SRC.width, H: SRC.height });

const pct = (r: Region): Win => ({
  x: (100 * r.x0) / SRC.width, y: (100 * r.y0) / SRC.height,
  w: (100 * (r.x1 - r.x0)) / SRC.width, h: (100 * (r.y1 - r.y0)) / SRC.height,
});
const expectWin = (got: Win, want: Win, what: string, tol = TOL) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    expect(Math.abs(got[k] - want[k]), `${what}: ${k} ${got[k].toFixed(2)} vs ${want[k].toFixed(2)} (percent of the source)`).toBeLessThan(tol);
  }
};
const expectInside = (inner: Win, outer: Win, what: string) => {
  const msg = `${what}: framed ${JSON.stringify(inner)} inside shown ${JSON.stringify(outer)}`;
  expect(outer.x, msg).toBeLessThan(inner.x + TOL);
  expect(outer.y, msg).toBeLessThan(inner.y + TOL);
  expect(outer.x + outer.w, msg).toBeGreaterThan(inner.x + inner.w - TOL);
  expect(outer.y + outer.h, msg).toBeGreaterThan(inner.y + inner.h - TOL);
};

async function openEditor(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  const frame = page.getByTestId('device-frame');
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('device-selector').selectOption('iphone-17-pro');
  return frame;
}
async function openPublic(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize(vp);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/${TEST_HANDLE}`);
  await page.waitForLoadState('networkidle');
}

const overlay = heroDialog;

/** The framed window in the open cropper, in percent of its picture. ONE read. */
const framedInCropper = (page: Page): Promise<Win> => page.evaluate(() => {
  const a = document.querySelector('.reactEasyCrop_CropArea')!.getBoundingClientRect();
  const i = document.querySelector('.reactEasyCrop_Image')!.getBoundingClientRect();
  return {
    x: (100 * (a.left - i.left)) / i.width, y: (100 * (a.top - i.top)) / i.height,
    w: (100 * a.width) / i.width, h: (100 * a.height) / i.height,
  };
});

async function cropperReady(page: Page) {
  const area = page.locator('.reactEasyCrop_CropArea');
  await expect(area).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    const b = await area.boundingBox();
    return b && b.width > 0 && b.height > 0 ? 1 : 0;
  }, { timeout: 15_000 }).toBe(1);
  await expect.poll(
    () => page.locator('.reactEasyCrop_Image').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0),
    { timeout: 30_000, message: 'the cropper picture decoded' },
  ).toBe(true);
  // react-easy-crop lays the picture out (and applies a seed) a frame later.
  await page.waitForTimeout(600);
}

const pickRuler = (page: Page) => page
  .locator('input[type="file"][accept*="image/jpeg"][accept*="video/mp4"]')
  .first()
  .setInputFiles({ name: 'ruler.png', mimeType: 'image/png', buffer: rulerPng() });

/** Pick the ruler → the photo editor → zoom 1.5 → drag (+40, −60) → OK. */
async function cropAndApply(page: Page, h: Harness): Promise<Win> {
  await pickRuler(page);
  await photoEditorReady(page);
  // Spec 41's slider driver: React listens for `input`, so set the value natively.
  await editorZoom(page).evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '1.5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const box = (await page.locator('.reactEasyCrop_CropArea').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const atRest = JSON.stringify(await framedInCropper(page));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy - 30, { steps: 6 });
  await page.mouse.move(cx + 40, cy - 60, { steps: 6 });
  // react-easy-crop reports the framed area on mouse-up from the crop it was
  // last RENDERED with. On the mobile project a frame takes ~0.7 s, so the whole
  // drag fits inside one: release only once the picture has painted where the
  // drag left it, or the app is handed the pre-drag area.
  await expect.poll(async () => {
    const a = JSON.stringify(await framedInCropper(page));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
    const b = JSON.stringify(await framedInCropper(page));
    return a === b && a !== atRest;
  }, { timeout: 20_000, message: 'the cropper painted the dragged position' }).toBe(true);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const framed = await framedInCropper(page);
  const before = h.patches.length;
  await editorOk(page).click();
  await expect.poll(() => h.patches.length, { timeout: 60_000, message: 'the pages PATCH was captured' }).toBeGreaterThan(before);
  await expect(overlay(page)).toHaveCount(0, { timeout: 15_000 });
  return framed;
}

type Shown = {
  box: { x: number; y: number; w: number; h: number };
  img: { x: number; y: number; w: number; h: number };
  attr: string | null; style: string | null; srcset: string | null; sizes: string | null; src: string | null;
  ready: boolean;
};
/**
 * The hero picture and the box it paints into, read in ONE evaluate (public
 * blocks spring in; two reads a frame apart would disagree). `scope` is a
 * selector to look inside, or '' for the document.
 */
const readHero = (page: Page, style: Style, scope: string): Promise<Shown | null> => page.evaluate(({ full, sel }) => {
  const root: ParentNode | null = sel ? document.querySelector(sel) : document;
  if (!root) return null;
  let img: HTMLImageElement | null; let boxEl: Element | null; let holder: Element | null;
  if (full) {
    img = root.querySelector('img[data-hero-framing]');
    boxEl = img?.parentElement ?? null; holder = img;
  } else {
    boxEl = root.querySelector('[data-testid="hero-sticky"]');
    holder = boxEl?.querySelector('[data-hero-framing]') ?? null;
    img = holder?.querySelector('img') ?? null;
  }
  if (!img || !boxEl || !holder) return null;
  const b = boxEl.getBoundingClientRect(), i = img.getBoundingClientRect();
  const attr = holder.getAttribute('data-hero-framing');
  return {
    box: { x: b.left, y: b.top, w: b.width, h: b.height },
    img: { x: i.left, y: i.top, w: i.width, h: i.height },
    attr, style: img.getAttribute('style'), srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes'),
    src: img.getAttribute('src'),
    ready: img.complete && img.naturalWidth > 0 && !!attr && !attr.includes('pending'),
  };
}, { full: style === 'full_bleed', sel: scope });

/** The hero decoded, framed (not `pending`) and — when asked — showing `urlPart`. */
async function heroSettled(page: Page, style: Style, scope: string, urlPart?: string): Promise<Shown> {
  await expect.poll(async () => {
    const s = await readHero(page, style, scope);
    return !!s && s.ready && (!urlPart || `${s.src} ${s.srcset}`.includes(urlPart));
  }, { timeout: 45_000, message: 'the hero picture is decoded and framed' }).toBe(true);
  await page.waitForTimeout(600);
  return (await readHero(page, style, scope))!;
}

/** What the box shows of the display FILE, mapped through the file's region of the source. */
const shownInSource = (s: Shown, file: Region): Win => {
  const c = (n: number) => Math.min(1, Math.max(0, n));
  const fx0 = c((s.box.x - s.img.x) / s.img.w), fx1 = c((s.box.x + s.box.w - s.img.x) / s.img.w);
  const fy0 = c((s.box.y - s.img.y) / s.img.h), fy1 = c((s.box.y + s.box.h - s.img.y) / s.img.h);
  const W = file.x1 - file.x0, H = file.y1 - file.y0;
  return pct({ x0: file.x0 + fx0 * W, x1: file.x0 + fx1 * W, y0: file.y0 + fy0 * H, y1: file.y0 + fy1 * H });
};

/**
 * One real crop per page style, shared by the cases below (each case then opens
 * a fresh page over the state it left). A failed flow caches nothing, so every
 * case that needs it fails on its own.
 */
type Flow = {
  h: Harness;
  framed: Win;
  patch: Record<string, unknown>;
  region: Region & { fileW: number; fileH: number };
  uploads: Harness['uploads'];
  deletes: unknown[];
  shownAfterApply: Win;
};
const flows: Partial<Record<Style, Flow>> = {};
const START_CONFIG = { fit: 'fill', posY: 40, scale: 1.2, posX: 30 };
const PLACARD = `${FIX_DIR}/before.png`;

async function cropFlow(page: Page, style: Style): Promise<Flow> {
  const cached = flows[style];
  if (cached) return cached;
  // A hero that already exists, with the stale numbers HERO.FIT.0 found riding along.
  const h = newHarness(style, { ...START_CONFIG });
  h.files.set(PLACARD, { body: rulerPng(), type: 'image/png' });
  h.avatarUrl = `${AVATARS}${PLACARD}`;
  await install(page, h);
  await openEditor(page);
  const framed = await cropAndApply(page, h);
  const patch = h.patches[h.patches.length - 1];
  const display = h.files.get(objectPath(h.avatarUrl!));
  expect(display, 'the display file upload was captured').toBeTruthy();
  const region = await decodeRuler(page, display!);
  // The canvas right after the save — the local file and the window kept beside it.
  const shown = await heroSettled(page, style, FRAME, h.avatarUrl!.split('/').pop());
  const flow: Flow = {
    h, framed, patch, region, uploads: [...h.uploads], deletes: [...h.deletes],
    shownAfterApply: shownInSource(shown, region),
  };
  flows[style] = flow;
  return flow;
}

/** A fresh page over the state a flow left behind. */
async function resume(page: Page, style: Style): Promise<{ flow: Flow; h: Harness }> {
  const flow = await cropFlow(page, style);
  const h = cloneHarness(flow.h);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await install(page, h);
  return { flow, h };
}

const frameAspect = (style: Style) => (style === 'hero' ? canonicalHeroAspect() : canonicalFullBleedAspect());
const heroConfigOf = (patch: Record<string, unknown>) =>
  ((patch.theme_json as Record<string, unknown>).heroConfig ?? {}) as Record<string, unknown>;

/** Case 1's assertions, for either page style. */
function expectWindowPatch(flow: Flow, style: Style) {
  const cfg = heroConfigOf(flow.patch);
  expect(cfg.fit).toBe('fill');
  expect(cfg.posX).toBe(50);
  expect(cfg.posY).toBe(50);
  expect(Object.keys(cfg), 'a stale scale does not ride onto a window').not.toContain('scale');
  expect(cfg.window, 'window is stored').toBeTruthy();
  expect(cfg.windowSource, 'windowSource is stored').toBeTruthy();
  // windowSource: the framed window over the kept original, in the frame it was made in.
  const overOriginal = pictureFitSeed(cfg.windowSource, frameAspect(style)).crop;
  expect(overOriginal, 'windowSource reads back as a window').toBeTruthy();
  expectWin(overOriginal!, flow.framed, 'windowSource == framed');
  // window: the same framed window, over the display FILE.
  const overFile = pictureFitSeed(cfg.window, frameAspect(style)).crop;
  expect(overFile, 'window reads back as a window').toBeTruthy();
  const W = flow.region.x1 - flow.region.x0, H = flow.region.y1 - flow.region.y0;
  expectWin(pct({
    x0: flow.region.x0 + (overFile!.x / 100) * W, x1: flow.region.x0 + ((overFile!.x + overFile!.w) / 100) * W,
    y0: flow.region.y0 + (overFile!.y / 100) * H, y1: flow.region.y0 + ((overFile!.y + overFile!.h) / 100) * H,
  }), flow.framed, 'window, through the display file, == framed');
  // A fresh pick uploads the display file and the kept original; the hero it
  // replaced is deleted — all three captured here, none of them real.
  expect(flow.uploads.map((u) => (u.path.includes('-original.') ? 'original' : 'display')).sort()).toEqual(['display', 'original']);
  expect(JSON.stringify(flow.deletes), 'the superseded hero object was deleted').toContain(PLACARD);
  // …and the canvas shows the framed window straight away.
  expectWin(flow.shownAfterApply, flow.framed, 'the editor right after Apply');
}

// Stage 0 (d4801ba, before any source change): the hero <img>'s inline style
// and data-hero-framing for a 2000×3000 picture under a plain
// { fit: 'fill', posY: 25 } config — public 402×874 and the editor's default
// preset gave the same strings. Chromium and WebKit serialise the same
// percentages to different lengths, hence one set per project.
const STAGE0 = {
  desktop: {
    hero: 'position: absolute; width: 100%; height: 121.328%; object-fit: fill; left: 0%; top: -5.33199%; max-width: none;',
    full_bleed: 'position: absolute; width: 144.942%; height: 100%; object-fit: fill; left: -22.471%; top: 0%; max-width: none;',
  },
  mobile: {
    hero: 'position: absolute; width: 100%; height: 121.327968%; object-fit: fill; left: 0%; top: -5.331992%; max-width: none;',
    full_bleed: 'position: absolute; width: 144.941957%; height: 100%; object-fit: fill; left: -22.470978%; top: 0%; max-width: none;',
  },
  attr: { hero: '1.00;50;25;fill;100.0,121.3,0.0,-5.3', full_bleed: '1.00;50;25;fill;144.9,100.0,-22.5,0.0' },
  sizes: { hero: '(min-width: 768px) 402px, min(100vw, 640px)', full_bleed: '(min-width: 768px) 583px, calc(100vw * 1.449)' },
  widths: { hero: '402w,804w,1206w', full_bleed: '480w,960w,1440w' },
} as const;

// PHOTO.EDITOR.1: the same recording for two more heroes, made on the unchanged
// source (7f018df) — a hero stored with Fit, and one stored with a window.
const PE1_WINDOW = writePictureFit(null, {
  mode: 'crop',
  crop: { x: 12, y: 8, w: 60, h: (60 * SRC.width) / (canonicalHeroAspect() * SRC.height) },
  aspect: canonicalHeroAspect(),
});
const PE1_IDENTITY = {
  desktop: {
    fit: { style: 'position: absolute; width: 82.4212%; height: 100%; object-fit: fill; left: 8.78939%; top: 0%; max-width: none;', attr: '1.00;50;25;fit;82.4,100.0,8.8,0.0', sizes: '(min-width: 768px) 402px, min(100vw, 640px)', widths: '402w,804w,1206w' },
    window: { style: 'position: absolute; width: 166.667%; height: 202.213%; object-fit: fill; left: -20%; top: -16.1771%; max-width: none;', attr: '1.67;30;16;fill;166.7,202.2,-20.0,-16.2', sizes: '(min-width: 768px) 670px, calc(min(100vw, 640px) * 1.667)', widths: '670w,1340w,2010w' },
  },
  mobile: {
    fit: { style: 'position: absolute; width: 82.421227%; height: 100%; object-fit: fill; left: 8.789386%; top: 0%; max-width: none;', attr: '1.00;50;25;fit;82.4,100.0,8.8,0.0', sizes: '(min-width: 768px) 402px, min(100vw, 640px)', widths: '402w,804w,1206w' },
    window: { style: 'position: absolute; width: 166.666667%; height: 202.21328%; object-fit: fill; left: -20%; top: -16.177062%; max-width: none;', attr: '1.67;30;16;fill;166.7,202.2,-20.0,-16.2', sizes: '(min-width: 768px) 670px, calc(min(100vw, 640px) * 1.667)', widths: '670w,1340w,2010w' },
  },
} as const;

test.describe('HERO.FIT.2 — the hero stores its framed window', () => {
  // An editor crop on the mobile project (WebKit at 3×) is slow, not flaky.
  test.setTimeout(240_000);

  test('1. OK after a drag and a zoom writes the window, Fill, centred, and drops a stale scale and posX', async ({ page }) => {
    const flow = await cropFlow(page, 'hero');
    expect(heroConfigOf({ theme_json: { heroConfig: START_CONFIG } }).scale, 'control: the config started with a scale').toBe(1.2);
    expectWindowPatch(flow, 'hero');
  });

  test('2. the display file is the region heroDisplayRegion gives, not the whole picture', async ({ page }) => {
    const flow = await cropFlow(page, 'hero');
    const framedPx = {
      x: (flow.framed.x / 100) * SRC.width, y: (flow.framed.y / 100) * SRC.height,
      width: (flow.framed.w / 100) * SRC.width, height: (flow.framed.h / 100) * SRC.height,
    };
    const want = heroDisplayRegion(framedPx, SRC, HERO_BOX_ASPECTS.hero)!;
    expect(want, 'the framed rectangle resolves').toBeTruthy();
    const { region } = want;
    expectWin(pct(flow.region), pct({ x0: region.x, x1: region.x + region.width, y0: region.y, y1: region.y + region.height }), 'the display file');
    // Whole pixels of the source, under the 2500 px cap: the file IS the region.
    expect(Math.abs(flow.region.fileW - region.width), 'file width in px').toBeLessThanOrEqual(2);
    expect(Math.abs(flow.region.fileH - region.height), 'file height in px').toBeLessThanOrEqual(2);
    // More than what was framed (the margin other box shapes show)…
    const held = pct(flow.region);
    expect(held.w * held.h, 'the file holds more than the framed rectangle').toBeGreaterThan(flow.framed.w * flow.framed.h * 1.1);
    // …and far less than the whole original.
    expect(held.h, 'the file is not the whole picture').toBeLessThan(70);
  });

  test('3. framed == shown: the editor at the default preset and public 402×874', async ({ page }) => {
    const { flow, h } = await resume(page, 'hero');
    const name = h.avatarUrl!.split('/').pop();
    await openEditor(page);
    const editor = await heroSettled(page, 'hero', FRAME, name);
    expect(editor.box.w / editor.box.h, 'the default preset is the crop frame\'s shape').toBeCloseTo(canonicalHeroAspect(), 2);
    expectWin(shownInSource(editor, flow.region), flow.framed, 'editor, default preset');

    await openPublic(page, { width: 402, height: 874 });
    const pub = await heroSettled(page, 'hero', '', name);
    expectWin(shownInSource(pub, flow.region), flow.framed, 'public 402×874');
    expect(h.patches, 'looking at the page writes nothing').toHaveLength(0);
  });

  test('4. short phones: the framed window is still whole on public 393×659 and 375×553', async ({ page }) => {
    const { flow, h } = await resume(page, 'hero');
    const name = h.avatarUrl!.split('/').pop();
    for (const vp of [{ width: 393, height: 659 }, { width: 375, height: 553 }]) {
      await openPublic(page, vp);
      const s = await heroSettled(page, 'hero', '', name);
      // The box is wider than the crop frame here — the shape that used to cut it.
      expect(s.box.w / s.box.h, `${vp.width}×${vp.height}: a wider box than the frame`).toBeGreaterThan(canonicalHeroAspect() * 1.15);
      const shown = shownInSource(s, flow.region);
      expectInside(flow.framed, shown, `public ${vp.width}×${vp.height}`);
      // The height is exactly what was framed: only the sides gained picture.
      expect(Math.abs(shown.h - flow.framed.h), `${vp.width}×${vp.height}: framed height shown whole`).toBeLessThan(TOL);
    }
  });

  test('5. the pencil reopens on the kept original and the framed window; OK or X with nothing touched writes nothing', async ({ page }) => {
    const { flow, h } = await resume(page, 'hero');
    const displayName = h.avatarUrl!.split('/').pop()!;
    const originalName = h.originalUrl!.split('/').pop()!;
    // Every request that could write, whatever it is aimed at.
    const writes: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && /\/(rest|storage)\/v1\//.test(u) && !u.includes('/rpc/')) {
        writes.push(`${req.method()} ${new URL(u).pathname}`);
      }
    });
    const frame = await openEditor(page);
    const onPage = shownInSource(await heroSettled(page, 'hero', FRAME, displayName), flow.region);
    expectWin(onPage, flow.framed, 'control: the page shows the framed window');
    // The editor page seeds its default blocks as it loads (swallowed by the
    // harness): only what happens from the pencil on is the photo editor's.
    await page.waitForTimeout(1_000);
    writes.length = 0;

    for (const leave of ['ok', 'x'] as const) {
      await frame.getByTitle(EN['editor.editCurrentPhoto']).first().click();
      await photoEditorReady(page);
      // The cropper's picture is the kept original, on the framed window.
      expect(await page.locator('.reactEasyCrop_Image').getAttribute('src'), 'the cropper holds the kept original').toContain(originalName);
      expectWin(await framedInCropper(page), flow.framed, 'the cropper reopened on the framed window');
      if (leave === 'ok') await editorOk(page).click();
      else await overlay(page).getByRole('button', { name: EN['editor.cancel'], exact: true }).click();
      await expect(overlay(page), `${leave}: the editor closed`).toHaveCount(0, { timeout: 15_000 });
      await page.waitForTimeout(1_500);
      expect(writes, `${leave}: no request that writes`).toEqual([]);
      expect(h.patches, `${leave}: no pages PATCH`).toHaveLength(0);
      expect(h.uploads, `${leave}: no upload`).toHaveLength(0);
      expect(h.deletes, `${leave}: nothing deleted`).toHaveLength(0);
    }
    // …and the page still shows what it showed.
    expectWin(shownInSource(await heroSettled(page, 'hero', FRAME, displayName), flow.region), flow.framed, 'the canvas is unchanged');
  });

  for (const failOriginal of [false, true]) {
    test(`6${failOriginal ? 'b' : ''}. OK straight after a new pick stores the zoom-1 centred window${failOriginal ? ', alone when the original does not upload' : ' and windowSource'}`, async ({ page }) => {
      // A page that already stores both keys (written the way the app writes
      // them) and a stale scale: none of it survives a new pick.
      const stored = writePictureFit(null, { mode: 'crop', crop: { x: 8, y: 2, w: 70, h: 96 }, aspect: canonicalHeroAspect() });
      const h = newHarness('hero', { fit: 'fit', posX: 30, posY: 40, scale: 1.2, window: stored, windowSource: stored });
      h.failOriginal = failOriginal;
      h.files.set(PLACARD, { body: rulerPng(), type: 'image/png' });
      h.avatarUrl = `${AVATARS}${PLACARD}`;
      await install(page, h);
      await openEditor(page);
      await pickRuler(page);
      await photoEditorReady(page);
      await expect(editorZoom(page), 'the editor opens at zoom 1').toHaveValue('1');
      // Zoom 1, centred: the largest window of the frame's shape, in the middle.
      const frameH = (100 * SRC.width) / (canonicalHeroAspect() * SRC.height);
      const centred: Win = { x: 0, y: (100 - frameH) / 2, w: 100, h: frameH };
      const framed = await framedInCropper(page);
      expectWin(framed, centred, 'the editor opens on the zoom-1 centred window');
      await editorOk(page).click();
      await expect.poll(() => h.patches.length, { timeout: 60_000, message: 'the pages PATCH was captured' }).toBe(1);
      await expect(overlay(page)).toHaveCount(0, { timeout: 15_000 });

      const cfg = heroConfigOf(h.patches[0]);
      expect(cfg.fit, 'every save is Fill').toBe('fill');
      expect(cfg.posX).toBe(50);
      expect(cfg.posY).toBe(50);
      expect(Object.keys(cfg), 'a stale scale does not ride on').not.toContain('scale');
      expect(cfg.window, 'the window is stored').toBeTruthy();
      expect(cfg.window, 'not the window the page stored before').not.toEqual(stored);
      // The upload is the region heroDisplayRegion gives for that area.
      const display = h.files.get(objectPath(h.patches[0].avatar_url as string))!;
      const held = await decodeRuler(page, display);
      const want = heroDisplayRegion(
        { x: (framed.x / 100) * SRC.width, y: (framed.y / 100) * SRC.height, width: (framed.w / 100) * SRC.width, height: (framed.h / 100) * SRC.height },
        SRC, HERO_BOX_ASPECTS.hero,
      )!.region;
      expectWin(pct(held), pct({ x0: want.x, x1: want.x + want.width, y0: want.y, y1: want.y + want.height }), 'the display file is the region for the centred area');
      // The stored window, through that file, is the centred area.
      const overFile = pictureFitSeed(cfg.window, canonicalHeroAspect()).crop!;
      const W = held.x1 - held.x0, H = held.y1 - held.y0;
      expectWin(pct({
        x0: held.x0 + (overFile.x / 100) * W, x1: held.x0 + ((overFile.x + overFile.w) / 100) * W,
        y0: held.y0 + (overFile.y / 100) * H, y1: held.y0 + ((overFile.y + overFile.h) / 100) * H,
      }), centred, 'window, through the display file, == the centred area');
      if (failOriginal) {
        expect(Object.keys(cfg), 'no windowSource without a kept original').not.toContain('windowSource');
        expect(h.patches[0].avatar_original_url, 'no original column without an upload').toBeUndefined();
        expect(h.uploads.map((u) => (u.path.includes('-original.') ? 'original' : 'display'))).toEqual(['display']);
      } else {
        expectWin(pictureFitSeed(cfg.windowSource, canonicalHeroAspect()).crop!, centred, 'windowSource == the centred area');
        expect(h.uploads.map((u) => (u.path.includes('-original.') ? 'original' : 'display')).sort()).toEqual(['display', 'original']);
      }
    });
  }

  test('7. a full-screen page: the window is written and framed == shown', async ({ page }) => {
    const flow = await cropFlow(page, 'full_bleed');
    expectWindowPatch(flow, 'full_bleed');
    // The frame the crop was made in is the full-screen one.
    expect((flow.framed.w * SRC.width) / (flow.framed.h * SRC.height)).toBeCloseTo(canonicalFullBleedAspect(), 2);

    const { h } = await resume(page, 'full_bleed');
    const name = h.avatarUrl!.split('/').pop();
    await openEditor(page);
    expectWin(shownInSource(await heroSettled(page, 'full_bleed', FRAME, name), flow.region), flow.framed, 'editor, default preset');
    await openPublic(page, { width: 402, height: 874 });
    expectWin(shownInSource(await heroSettled(page, 'full_bleed', '', name), flow.region), flow.framed, 'public 402×874');
  });

  test('8. identity: Fit, Fill + posY, a window and a full-screen page paint exactly what they painted before', async ({ page }, testInfo) => {
    const styles = testInfo.project.name === 'mobile' ? STAGE0.mobile : STAGE0.desktop;
    const recorded = testInfo.project.name === 'mobile' ? PE1_IDENTITY.mobile : PE1_IDENTITY.desktop;
    const heroes: { id: 'fit' | 'window' | 'hero' | 'full_bleed'; style: Style; cfg: Record<string, unknown> }[] = [
      { id: 'hero', style: 'hero', cfg: { fit: 'fill', posY: 25 } },
      { id: 'full_bleed', style: 'full_bleed', cfg: { fit: 'fill', posY: 25 } },
      { id: 'fit', style: 'hero', cfg: { fit: 'fit', posY: 25 } },
      { id: 'window', style: 'hero', cfg: { fit: 'fill', posX: 50, posY: 50, window: PE1_WINDOW } },
    ];
    for (const hero of heroes) {
      const { style, id } = hero;
      const h = newHarness(style, hero.cfg);
      const name = 'identity-ruler.png';
      h.files.set(`${FIX_DIR}/${name}`, { body: rulerPng(), type: 'image/png' });
      h.avatarUrl = `${AVATARS}${FIX_DIR}/${name}`;
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await install(page, h);
      const want = id === 'fit' || id === 'window'
        ? recorded[id]
        : { style: styles[id], attr: STAGE0.attr[id], sizes: STAGE0.sizes[id], widths: STAGE0.widths[id] };

      await openPublic(page, { width: 402, height: 874 });
      const pub = await heroSettled(page, style, '', name);
      expect(pub.style, `${id} · public · inline style`).toBe(want.style);
      expect(pub.attr, `${id} · public · data-hero-framing`).toBe(want.attr);
      expect(pub.sizes, `${id} · public · sizes`).toBe(want.sizes);
      expect((pub.srcset || '').split(', ').map((c) => c.split(' ').pop()).join(','), `${id} · public · srcset widths`).toBe(want.widths);

      await openEditor(page);
      const editor = await heroSettled(page, style, FRAME, name);
      expect(editor.style, `${id} · editor · inline style`).toBe(want.style);
      expect(editor.attr, `${id} · editor · data-hero-framing`).toBe(want.attr);
      expect(editor.srcset, `${id} · editor · no srcset`).toBeNull();
      expect(h.patches, 'looking at a page writes nothing').toHaveLength(0);
    }
  });

  for (const lang of ['en', 'es'] as const) {
    test(`9. a pick opens the photo editor directly · ${lang}: zoom, New photo and OK — no Fill, Fit, position slider, Crop Image, Back or Apply Crop`, async ({ page }) => {
      const T = translations[lang] as Record<string, string>;
      await page.addInitScript((l) => { try { window.localStorage.setItem('titilinks-language', l); } catch { /* storage disabled */ } }, lang);
      // The app syncs a chosen language to the profile: answered here, never sent.
      await page.route('**/rest/v1/rpc/set_my_language*', (route) => route.fulfill({ status: 204, body: '' }));
      const h = newHarness('hero', { fit: 'fill', posY: 25 });
      h.files.set(PLACARD, { body: rulerPng(), type: 'image/png' });
      h.avatarUrl = `${AVATARS}${PLACARD}`;
      await install(page, h);
      await openEditor(page);
      await pickRuler(page);
      // ONE screen, straight away: the cropper is up with no step in between.
      await photoEditorReady(page);
      const dlg = overlay(page);
      await expect(dlg).toHaveCount(1);
      await expect(dlg.getByText(T['editor.editPhoto'], { exact: true }), 'the header').toBeVisible();
      await expect(dlg.getByText(T['editor.crop.zoom'], { exact: true }), 'the Zoom row').toBeVisible();
      await expect(editorNewPhoto(page)).toHaveText(T['editor.hero.newPhoto']);
      await expect(editorOk(page)).toHaveText(T['editor.hero.ok']);
      await expect(dlg.getByText(T['editor.hero.autoEnhance'], { exact: true }), 'the Auto enhance row').toBeVisible();
      // Its controls are exactly: X, New photo, OK; the zoom slider; the switch.
      await expect(dlg.getByRole('button'), 'three buttons: X, New photo, OK').toHaveCount(3);
      await expect(dlg.locator('input[type=range]'), 'one slider: zoom').toHaveCount(1);
      await expect(dlg.getByRole('switch')).toHaveCount(1);
      await expect(dlg.getByRole('switch'), 'the switch starts off').toHaveAttribute('aria-checked', 'false');
      // The labels of what is gone, as literals in both languages (their keys are gone with them).
      const GONE = [
        'Fill', 'Fit', 'Top', 'Bottom', 'Left', 'Right', 'Crop Image', 'Use Original', 'Back', 'Apply Crop', 'Save',
        'Rellenar', 'Ajustar', 'Arriba', 'Abajo', 'Izquierda', 'Derecha', 'Recortar Imagen', 'Recortar imagen', 'Usar original', 'Atrás', 'Aplicar recorte', 'Guardar',
      ];
      for (const label of GONE) {
        await expect(dlg.getByText(label, { exact: true }), `no "${label}"`).toHaveCount(0);
      }
      await expect(page.getByTestId('hero-photo-preview'), 'no first screen').toHaveCount(0);
      expect(h.patches, 'opening the editor writes nothing').toHaveLength(0);
      expect(h.uploads, 'and uploads nothing').toHaveLength(0);
    });
  }
});

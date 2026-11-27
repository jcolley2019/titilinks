// HERO.FIT.3 — the shared harness for specs that crop a hero picture.
//
// Spec 101's method, lifted so the onboarding crop and the face presets can be
// measured the same way: the battery account, reads patched, and EVERY write
// captured and fulfilled here. Nothing reaches a real table or bucket — the
// `avatars` uploads (their bytes read in the page before the request leaves),
// the `pages` PATCH / INSERT, the superseded-object DELETEs. Any request to the
// paid `ai-enhance` function is trapped and counted, never sent.
//
// The ruler: a 2000×3000 picture whose red encodes x and green encodes y, with
// a blue grid line every 100 px. Any file cut from it decodes back to the exact
// source window it holds.
import { PNG } from 'pngjs';
import { expect, type Page, type Route } from '../fixtures';
import { TEST_HANDLE } from './auth';

export const SUPA = 'https://ohmvlypcbrfkuudcuqub.supabase.co';
export const AVATARS = `${SUPA}/storage/v1/object/public/avatars/`;
export const DESKTOP = { width: 1440, height: 1000 };
export const SRC = { width: 2000, height: 3000 };
export const FRAME = '[data-testid="device-frame"]';

export type Style = 'hero' | 'full_bleed';
export type Win = { x: number; y: number; w: number; h: number };
export type Region = { x0: number; x1: number; y0: number; y1: number };
export type StoredFile = { body: Buffer; type: string };

export const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');
export const objectPath = (url: string) => decodeURIComponent(url.split('/public/avatars/')[1].split('?')[0]);

// ── uploads ──────────────────────────────────────────────────────────────────

/**
 * The upload body is a FormData holding a File, which a route handler cannot
 * read. Wrap `fetch` in the page so the bytes are kept before the request
 * leaves; `uploadedBytes` then hands them to the spec.
 */
export async function installUploadCapture(page: Page) {
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
}

type UploadLog = {
  files: Map<string, StoredFile>;
  uploads: { path: string; type: string; size: number }[];
  deletes: unknown[];
  /** Refuse the kept ORIGINAL's upload (the display copy still lands). */
  failOriginal?: boolean;
};

/** The avatars bucket: uploads captured with their bytes, deletes recorded, files served back. */
async function routeAvatars(page: Page, h: UploadLog) {
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
    if (!got) return route.fulfill({ status: 500, body: 'hero harness: the upload bytes were not captured' });
    const body = Buffer.from(got.b64, 'base64');
    h.files.set(path, { body, type: got.type });
    h.uploads.push({ path, type: got.type, size: body.length });
    return asJson(route, { Key: `avatars/${path}`, Id: 'herofit' });
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

/** The paid enhancement is never called: every request is recorded and refused here. */
async function trapAiEnhance(page: Page, log: string[]) {
  await page.route(/\/functions\/v1\/(ai-enhance|create-checkout-session)/, async (route) => {
    log.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return asJson(route, { error: 'trapped by the spec: never sent' }, 503);
  });
}

// ── the editor / public harness ──────────────────────────────────────────────

export type EditorHarness = UploadLog & {
  style: Style;
  heroConfig: Record<string, unknown>;
  avatarUrl: string | null;
  originalUrl: string | null;
  patches: Record<string, unknown>[];
  /** Every request that tried to reach `ai-enhance` (trapped, never sent). */
  aiCalls: string[];
  blockId: string;
};

export const newEditorHarness = (style: Style, heroConfig: Record<string, unknown>, blockId = 'herofit3-links-block'): EditorHarness => ({
  style, heroConfig, avatarUrl: null, originalUrl: null,
  files: new Map(), patches: [], uploads: [], deletes: [], aiCalls: [], blockId,
});
/** The same stored state on a fresh page: files and row kept, the logs empty. */
export const cloneEditorHarness = (h: EditorHarness): EditorHarness => ({
  ...h, heroConfig: { ...h.heroConfig }, files: new Map(h.files), patches: [], uploads: [], deletes: [], aiCalls: [],
});

/** The battery page with this harness's hero stamped on. Reads patched, every write captured and answered. */
export async function installEditor(page: Page, h: EditorHarness) {
  await installUploadCapture(page);
  await trapAiEnhance(page, h.aiCalls);

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
    const block = { id: h.blockId, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 0 };
    return asJson(route, wantsObject(route) ? block : [block]);
  });
  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') return asJson(route, []);
    const item = {
      id: `${h.blockId}-item`, block_id: h.blockId, label: 'HERO.FIT.3', url: 'https://fixture.titilinks.test/herofit3',
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
  await routeAvatars(page, h);
}

export async function openEditor(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  const frame = page.getByTestId('device-frame');
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('device-selector').selectOption('iphone-17-pro');
  return frame;
}
export async function openPublic(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize(vp);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/${TEST_HANDLE}`);
  await page.waitForLoadState('networkidle');
}

/** The editor's hero photo dialog (portalled to the body). */
export const heroDialog = (page: Page) => page.locator('div[class*="z-[130]"]');

/** The editor's hero file input (photo or video). */
export const pickHeroFile = (page: Page, file: { name: string; mimeType: string; buffer: Buffer }) => page
  .locator('input[type="file"][accept*="image/jpeg"][accept*="video/mp4"]')
  .first()
  .setInputFiles(file);

// ── the onboarding harness ───────────────────────────────────────────────────

export type OnboardingHarness = UploadLog & {
  /** Bodies of every `pages` INSERT (fulfilled here, never sent). */
  pageInserts: Record<string, unknown>[];
  /** Bodies of every `pages` PATCH (fulfilled here, never sent). */
  pageUpdates: Record<string, unknown>[];
  profilePatches: Record<string, unknown>[];
  aiCalls: string[];
};

export const ONB_PAGE_ID = '11111111-1111-4111-8111-111111111111';
const ONB_MODE_ID = '22222222-2222-4222-8222-222222222222';
const ONB_BLOCK_ID = '33333333-3333-4333-8333-333333333333';

/**
 * Spec 62's door into the wizard: the resume guard's reads are answered empty so
 * it boots at step 1 with a clean sessionStorage, and every write is fulfilled
 * here — the storage uploads with their bytes kept, the `pages` insert and
 * updates captured. Once the insert has landed, step 3's "does a page exist?"
 * lookup is answered with that page, as the real table would (the wizard's
 * existing-page branch). sessionStorage is cleared on the FIRST load only, so a
 * spec may reload mid-wizard and resume.
 */
export async function installOnboarding(page: Page): Promise<OnboardingHarness> {
  const h: OnboardingHarness = { files: new Map(), uploads: [], deletes: [], pageInserts: [], pageUpdates: [], profilePatches: [], aiCalls: [] };
  await page.addInitScript(() => {
    try {
      if (window.sessionStorage.getItem('__herofit_onb_cleared') !== '1') {
        window.sessionStorage.clear();
        window.sessionStorage.setItem('__herofit_onb_cleared', '1');
      }
    } catch { /* storage disabled */ }
  });
  await installUploadCapture(page);
  await trapAiEnhance(page, h.aiCalls);
  await routeAvatars(page, h);

  await page.route('**/rest/v1/profiles*', async (route) => {
    const m = route.request().method();
    if (m === 'GET') return asJson(route, []);
    if (m === 'PATCH') {
      h.profilePatches.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  for (const re of [/\/rest\/v1\/pages(\?|$)/, /\/rest\/v1\/pages_public/]) {
    const isPublic = String(re).includes('pages_public');
    await page.route(re, async (route) => {
      const m = route.request().method();
      if (m === 'GET') {
        // Step 3's lookup (`select=id,handle` by user_id), after the insert.
        const u = new URL(route.request().url());
        const lookup = !isPublic && h.pageInserts.length > 0
          && u.searchParams.has('user_id') && (u.searchParams.get('select') || '').replace(/\s/g, '') === 'id,handle';
        return asJson(route, lookup ? [{ id: ONB_PAGE_ID, handle: 'windowperson' }] : []);
      }
      if (m === 'PATCH' && !isPublic) {
        h.pageUpdates.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({ status: 204, body: '' });
      }
      if (m === 'POST') {
        const body = route.request().postDataJSON();
        h.pageInserts.push((Array.isArray(body) ? body[0] : body) as Record<string, unknown>);
        return asJson(route, {
          id: ONB_PAGE_ID, user_id: 'mock-user', handle: 'mock', display_name: 'mock',
          avatar_url: null, avatar_original_url: null, bio: null, theme_json: {},
          goal_primary_offer_item_id: null, goal_secondary_item_id: null,
          created_at: '', updated_at: '',
        }, 201);
      }
      if (m === 'PATCH') return route.fulfill({ status: 204, body: '' });
      return route.fallback();
    });
  }
  await page.route('**/rest/v1/modes*', async (route) =>
    route.request().method() === 'POST'
      ? asJson(route, [{ id: ONB_MODE_ID, page_id: ONB_PAGE_ID, type: 'page1' }], 201)
      : asJson(route, []));
  await page.route('**/rest/v1/blocks*', async (route) => {
    const m = route.request().method();
    if (m === 'GET') return asJson(route, []);
    if (m === 'POST') return asJson(route, { id: ONB_BLOCK_ID }, 201);
    return route.fallback();
  });
  await page.route('**/rest/v1/block_items*', async (route) =>
    route.request().method() === 'POST' ? asJson(route, [], 201) : asJson(route, []));
  return h;
}

// ── the ruler ────────────────────────────────────────────────────────────────

/** The ruler: red = x, green = y (256 levels each), a blue grid line every 100 px. */
let rulerCache: Buffer | null = null;
export function rulerPng(): Buffer {
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
export const decodeRuler = (page: Page, file: StoredFile) => page.evaluate(async ({ b64, mime, W, H }) => {
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

export const pct = (r: Region): Win => ({
  x: (100 * r.x0) / SRC.width, y: (100 * r.y0) / SRC.height,
  w: (100 * (r.x1 - r.x0)) / SRC.width, h: (100 * (r.y1 - r.y0)) / SRC.height,
});
export const expectWin = (got: Win, want: Win, what: string, tol = 0.5) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    expect(Math.abs(got[k] - want[k]), `${what}: ${k} ${got[k].toFixed(2)} vs ${want[k].toFixed(2)} (percent of the source)`).toBeLessThan(tol);
  }
};

// ── the cropper ──────────────────────────────────────────────────────────────

/** The framed window in the open cropper, in percent of its picture. ONE read. */
export const framedInCropper = (page: Page): Promise<Win> => page.evaluate(() => {
  const a = document.querySelector('.reactEasyCrop_CropArea')!.getBoundingClientRect();
  const i = document.querySelector('.reactEasyCrop_Image')!.getBoundingClientRect();
  return {
    x: (100 * (a.left - i.left)) / i.width, y: (100 * (a.top - i.top)) / i.height,
    w: (100 * a.width) / i.width, h: (100 * a.height) / i.height,
  };
});

/** The crop frame's own shape on screen (width / height). */
export const cropFrameShape = (page: Page): Promise<number> => page.evaluate(() => {
  const a = document.querySelector('.reactEasyCrop_CropArea')!.getBoundingClientRect();
  return a.width / a.height;
});

export async function cropperReady(page: Page) {
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

/** Wait until two reads of the cropper a frame apart agree (a seed or a drag has painted). */
export async function cropperStill(page: Page, differentFrom?: string) {
  await expect.poll(async () => {
    const a = JSON.stringify(await framedInCropper(page));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
    const b = JSON.stringify(await framedInCropper(page));
    return a === b && a !== differentFrom;
  }, { timeout: 20_000, message: 'the cropper painted its position' }).toBe(true);
}

/** Zoom to `zoom` on the given range input, then drag the picture by (dx, dy) px. Returns the framed window. */
export async function zoomAndDrag(page: Page, range: ReturnType<Page['locator']>, zoom: number, dx: number, dy: number): Promise<Win> {
  // Spec 41's slider driver: React listens for `input`, so set the value natively.
  await range.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, zoom);
  await page.waitForTimeout(400);
  const box = (await page.locator('.reactEasyCrop_CropArea').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const atRest = JSON.stringify(await framedInCropper(page));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 6 });
  await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
  // react-easy-crop reports the framed area on mouse-up from the crop it was
  // last RENDERED with. On the mobile project a frame takes ~0.7 s, so the whole
  // drag fits inside one: release only once the picture has painted where the
  // drag left it, or the app is handed the pre-drag area.
  await cropperStill(page, atRest);
  await page.mouse.up();
  await page.waitForTimeout(500);
  return framedInCropper(page);
}

// ── the hero on a page ───────────────────────────────────────────────────────

export type Shown = {
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
export const readHero = (page: Page, style: Style, scope: string): Promise<Shown | null> => page.evaluate(({ full, sel }) => {
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
export async function heroSettled(page: Page, style: Style, scope: string, urlPart?: string): Promise<Shown> {
  await expect.poll(async () => {
    const s = await readHero(page, style, scope);
    return !!s && s.ready && (!urlPart || `${s.src} ${s.srcset}`.includes(urlPart));
  }, { timeout: 45_000, message: 'the hero picture is decoded and framed' }).toBe(true);
  await page.waitForTimeout(600);
  return (await readHero(page, style, scope))!;
}

/** What the box shows of the display FILE, mapped through the file's region of the source. */
export const shownInSource = (s: Shown, file: Region): Win => {
  const c = (n: number) => Math.min(1, Math.max(0, n));
  const fx0 = c((s.box.x - s.img.x) / s.img.w), fx1 = c((s.box.x + s.box.w - s.img.x) / s.img.w);
  const fy0 = c((s.box.y - s.img.y) / s.img.h), fy1 = c((s.box.y + s.box.h - s.img.y) / s.img.h);
  const W = file.x1 - file.x0, H = file.y1 - file.y0;
  return pct({ x0: file.x0 + fx0 * W, x1: file.x0 + fx1 * W, y0: file.y0 + fy0 * H, y1: file.y0 + fy1 * H });
};

// ── driving the onboarding wizard ────────────────────────────────────────────

/** Step 1 (pick the page style) → step 2, with the profile fields filled. */
export async function toOnboardingStepTwo(page: Page, style: Style, desktop: boolean, T: Record<string, string>) {
  const scope = desktop ? page.getByTestId('onboarding-panel') : page;
  await page.goto('/onboarding');
  const card = style === 'full_bleed' ? T['onboardingFlow.styleFullBleedDesc'] : T['onboardingFlow.styleHeroDesc'];
  await scope.getByRole('button').filter({ hasText: card }).first().click();
  await scope.getByRole('button', { name: T['onboardingFlow.continue'], exact: true }).click();
  const name = scope.getByPlaceholder(T['onboardingFlow.displayNamePlaceholder']);
  await expect(name).toBeVisible({ timeout: 15_000 });
  await name.fill('Window Person');
  await scope.getByPlaceholder(T['onboardingFlow.usernamePlaceholder']).fill('windowperson');
  await expect(page.getByTestId('onb-continue')).toBeEnabled({ timeout: 15_000 });
  return scope;
}

/** Pick a picture in step 2 and open the crop modal on it. */
export async function openOnboardingCrop(
  page: Page,
  scope: ReturnType<Page['locator']> | Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  T: Record<string, string>,
) {
  await scope.locator('input[type="file"]').setInputFiles(file);
  const cropImage = page.getByRole('button', { name: T['onboardingFlow.cropImage'], exact: true });
  await expect(cropImage).toBeVisible({ timeout: 15_000 });
  await cropImage.click();
  await cropperReady(page);
}

// PHOTO.POLISH.1 — Auto enhance in the Edit Photo screen.
//
// A switch with a strength slider on the pencil dialog's first screen. The kept
// original is never changed; the DISPLAY file is what gets enhanced, and the
// hero config stores `enhance` { strength, params } beside the window:
//
//   1. new pick, switch on, Save: the display upload is brighter than the
//      un-enhanced bake, the original upload is byte-identical to the one sent
//      with the switch off, and the PATCH carries `enhance`;
//   2. Crop + Apply with the switch on: window, windowSource and enhance are
//      stored, and the upload is the region, enhanced;
//   3. the pencil reopens with the switch on at the stored strength; strength to
//      50, Save: ONE new display upload, made from the ORIGINAL (it matches a
//      from-scratch 0.5 bake, so nothing compounds), the window is unchanged,
//      windowSource is untouched, and the superseded display object is deleted;
//   4. switch off, Save: the upload matches the un-enhanced bake; the key is gone;
//   5. nothing changed, Save: no upload;
//   6. hold shows the un-enhanced picture and release returns; the preview's
//      mean colour matches what the page then shows;
//   7. a GIF pick and a slot with no kept original show no row — nor does a
//      hero cropped before windows were stored (its display file is a cut of
//      the original with no record of where, so there is nothing to bake from).
//
// PHOTO.POLISH.2:
//   8. Page 2's OWN hero (not inheriting): switch on, Save — the write goes to
//      theme_json.avatar_url_page2 and heroConfig_page2 with `enhance`, and
//      Page 1's picture column and hero slot are untouched;
//   9. the canvas work is a lazy chunk: the public page never requests
//      hero-enhance-canvas (nor the heavy half of auto-enhance), and the editor
//      requests it once, only when the row is used.
//
// Built like spec 101. Battery account; reads patched; EVERY write is captured
// and fulfilled in tests/helpers/hero-window-harness.ts — no real hero save, and
// `ai-enhance` is trapped, never sent. The picture is synthetic: a dim,
// photo-like scene (soft gradients, a warm patch, per-pixel grain).
import { PNG } from 'pngjs';
import { test, expect, type Page } from './fixtures';
import { PINNED_TEST_USER_ID } from './helpers/auth';
import { translations } from '../src/hooks/useLanguage';
import { canonicalHeroAspect } from '../src/lib/device-presets';
import { HERO_BOX_ASPECTS, heroDisplayRegion } from '../src/lib/hero-window';
import { pictureFitSeed } from '../src/lib/picture-fit';
import { readHeroEnhance, type HeroEnhance } from '../src/lib/hero-enhance';
import { isIdentity } from '../src/lib/auto-enhance';
import {
  AVATARS, FRAME, DIM,
  installEditor, newEditorHarness, cloneEditorHarness, openEditor, openPublic, heroDialog, pickHeroFile,
  cropperReady, zoomAndDrag, heroSettled, objectPath, dimPng,
  type EditorHarness, type StoredFile, type Win,
} from './helpers/hero-window-harness';

const EN = translations.en as Record<string, string>;
const FIX_DIR = `${PINNED_TEST_USER_ID}/photopolish1`;
const PLACARD = `${FIX_DIR}/before.png`;
const GRID = 8;

// The dim, photo-like picture is the harness's (dimPng): spec 102 uses it too.
const DIM_FILE = () => ({ name: 'dim.png', mimeType: 'image/png', buffer: dimPng() });

/** A square cut: not the kept original's shape. */
function squarePng(): Buffer {
  const png = new PNG({ width: 300, height: 300 });
  for (let p = 0; p < 300 * 300; p++) png.data.set([70 + (p % 300) / 6, 60, 50 + Math.floor(p / 300) / 6, 255], p * 4);
  return PNG.sync.write(png);
}

/** A valid 2×2 GIF (one frame). */
const GIF_FILE = {
  name: 'tiny.gif', mimeType: 'image/gif',
  buffer: Buffer.from('R0lGODlhAgACAIAAAP8AAAAA/ywAAAAAAgACAAACAoRRADs=', 'base64'),
};

// ── reading pictures ─────────────────────────────────────────────────────────
type Measured = { w: number; h: number; mean: [number, number, number]; blocks: number[] };

/** A picture's size, mean colour and an 8×8 grid of block means (r, g, b each). */
/**
 * `src` is a file's bytes, or 'preview': the choose preview's own <img>, read
 * off the element (its object URL is revoked the moment the app replaces it).
 */
const measure = (page: Page, src: { b64: string; mime: string } | 'preview'): Promise<Measured> =>
  page.evaluate(async ({ src, grid }) => {
    let img: HTMLImageElement;
    if (src === 'preview') {
      img = document.querySelector('[data-testid="hero-photo-preview"] img') as HTMLImageElement;
      if (!img.complete || !img.naturalWidth) await img.decode();
    } else {
      img = new Image();
      img.src = `data:${src.mime};base64,${src.b64}`;
      await img.decode();
    }
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    const blocks: number[] = [];
    const total = [0, 0, 0];
    for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
      const x0 = Math.floor((bx * w) / grid), x1 = Math.floor(((bx + 1) * w) / grid);
      const y0 = Math.floor((by * h) / grid), y1 = Math.floor(((by + 1) * h) / grid);
      const s = [0, 0, 0];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2];
      }
      const n = (x1 - x0) * (y1 - y0);
      for (let k = 0; k < 3; k++) { blocks.push(s[k] / n); total[k] += s[k]; }
    }
    return { w, h, mean: [total[0] / (w * h), total[1] / (w * h), total[2] / (w * h)] as [number, number, number], blocks };
  }, { src, grid: GRID });

const measureFile = (page: Page, f: StoredFile) => measure(page, { b64: f.body.toString('base64'), mime: f.type });

/**
 * A from-scratch bake, in the page, with the app's own module: `region` of the
 * kept original drawn at `out` size, then enhanced (or not), then measured.
 */
const scratchBake = (
  page: Page,
  original: StoredFile,
  region: { x: number; y: number; width: number; height: number } | null,
  out: { w: number; h: number },
  enhance: HeroEnhance | null,
): Promise<Measured> => page.evaluate(async ({ b64, mime, region, out, enhance, grid }) => {
  // A string the bundler cannot follow: the spec is typechecked without the app's module graph.
  const path = '/src/lib/hero-enhance-canvas.ts';
  const mod = await import(/* @vite-ignore */ path);
  const img = new Image();
  img.src = `data:${mime};base64,${b64}`;
  await img.decode();
  const r = region ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight };
  const c = document.createElement('canvas');
  c.width = out.w; c.height = out.h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, out.w, out.h);
  if (enhance) mod.enhanceCanvas(c, enhance.params, enhance.strength);
  const d = ctx.getImageData(0, 0, out.w, out.h).data;
  const w = out.w, h = out.h;
  const blocks: number[] = [];
  const total = [0, 0, 0];
  for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
    const x0 = Math.floor((bx * w) / grid), x1 = Math.floor(((bx + 1) * w) / grid);
    const y0 = Math.floor((by * h) / grid), y1 = Math.floor(((by + 1) * h) / grid);
    const s = [0, 0, 0];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2];
    }
    const n = (x1 - x0) * (y1 - y0);
    for (let k = 0; k < 3; k++) { blocks.push(s[k] / n); total[k] += s[k]; }
  }
  return { w, h, mean: [total[0] / (w * h), total[1] / (w * h), total[2] / (w * h)] as [number, number, number], blocks };
}, { b64: original.body.toString('base64'), mime: original.type, region, out, enhance, grid: GRID });

/** The largest difference between two pictures' block means, in levels. */
const worstBlock = (a: Measured, b: Measured) => a.blocks.reduce((m, v, i) => Math.max(m, Math.abs(v - b.blocks[i])), 0);
const lum = (m: Measured) => 0.2126 * m.mean[0] + 0.7152 * m.mean[1] + 0.0722 * m.mean[2];
const worstMean = (a: Measured, b: Measured) => Math.max(...a.mean.map((v, i) => Math.abs(v - b.mean[i])));

// ── driving the dialog ───────────────────────────────────────────────────────
const row = (page: Page) => heroDialog(page).getByTestId('hero-enhance-row');
const toggle = (page: Page) => heroDialog(page).getByTestId('hero-enhance-switch');
const strength = (page: Page) => heroDialog(page).getByTestId('hero-enhance-strength');
const preview = (page: Page) => page.getByTestId('hero-photo-preview');
const saveButton = (page: Page) => heroDialog(page).getByRole('button', { name: EN['editor.hero.save'], exact: true });

/** The choose preview is painting the copy named by `state` ('on' = enhanced, 'original' = held). */
async function previewShows(page: Page, state: 'on' | 'original' | 'off') {
  await expect(preview(page)).toHaveAttribute('data-enhance-preview', state, { timeout: 30_000 });
  await expect.poll(
    () => preview(page).evaluate((el) => { const i = el.querySelector('img') as HTMLImageElement; return i.complete && i.naturalWidth > 0; }),
    { timeout: 30_000, message: 'the preview picture decoded' },
  ).toBe(true);
}
const previewSrc = (page: Page) => preview(page).evaluate((el) => (el.querySelector('img') as HTMLImageElement).currentSrc || (el.querySelector('img') as HTMLImageElement).src);

async function setStrength(page: Page, value: number) {
  await strength(page).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(strength(page)).toHaveValue(String(value));
}

async function pickDim(page: Page) {
  await pickHeroFile(page, DIM_FILE());
  await expect(preview(page)).toBeVisible({ timeout: 30_000 });
  await expect(row(page)).toBeVisible({ timeout: 15_000 });
}

async function openPencil(page: Page) {
  const frame = await openEditor(page);
  await heroSettled(page, 'hero', FRAME);
  await frame.getByTitle(EN['editor.editCurrentPhoto']).first().click();
  await expect(preview(page)).toBeVisible({ timeout: 15_000 });
}

async function waitPatch(page: Page, h: EditorHarness, count: number) {
  await expect.poll(() => h.patches.length, { timeout: 90_000, message: 'the pages PATCH was captured' }).toBe(count);
  await expect(heroDialog(page)).toHaveCount(0, { timeout: 15_000 });
}

const heroConfigOf = (patch: Record<string, unknown>) =>
  ((patch.theme_json as Record<string, unknown>).heroConfig ?? {}) as Record<string, unknown>;
const displayOf = (h: EditorHarness) => h.files.get(objectPath(h.avatarUrl!))!;
const originalOf = (h: EditorHarness) => h.files.get(objectPath(h.originalUrl!))!;
const uploadKinds = (h: EditorHarness) => h.uploads.map((u) => (u.path.includes('-original.') ? 'original' : 'display')).sort();

function startHarness(): EditorHarness {
  const h = newEditorHarness('hero', { fit: 'fill', posY: 25 }, 'photopolish1-links-block');
  h.files.set(PLACARD, { body: dimPng(), type: 'image/png' });
  h.avatarUrl = `${AVATARS}${PLACARD}`;
  return h;
}

// ── shared flows (one real run each; a failed flow caches nothing) ───────────
type PickFlow = { h: EditorHarness; display: StoredFile; original: StoredFile; patch: Record<string, unknown> };
const pickFlows: Partial<Record<'off' | 'on', PickFlow>> = {};
/** New pick → (switch on) → Save. */
async function pickFlow(page: Page, mode: 'off' | 'on'): Promise<PickFlow> {
  const cached = pickFlows[mode];
  if (cached) return cached;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const h = startHarness();
  await installEditor(page, h);
  await openEditor(page);
  await pickDim(page);
  await expect(toggle(page), 'the switch starts off').toHaveAttribute('aria-checked', 'false');
  await expect(strength(page), 'no slider while off').toHaveCount(0);
  if (mode === 'on') {
    await toggle(page).click();
    await expect(strength(page), 'the slider starts at 100').toHaveValue('100');
    await expect(heroDialog(page).getByText(EN['editor.hero.holdToCompare'])).toBeVisible();
    await previewShows(page, 'on');
  }
  await saveButton(page).click();
  await waitPatch(page, h, 1);
  const flow = { h, display: displayOf(h), original: originalOf(h), patch: h.patches[0] };
  pickFlows[mode] = flow;
  return flow;
}

type CropFlow = {
  h: EditorHarness; framed: Win; patch: Record<string, unknown>;
  display: StoredFile; original: StoredFile;
  region: { x: number; y: number; width: number; height: number };
  enhance: HeroEnhance;
};
let cropFlowCache: CropFlow | null = null;
/** New pick → switch on → Crop Image → zoom 1.5, off-centre → Apply Crop. */
async function cropFlow(page: Page): Promise<CropFlow> {
  if (cropFlowCache) return cropFlowCache;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const h = startHarness();
  await installEditor(page, h);
  await openEditor(page);
  await pickDim(page);
  await toggle(page).click();
  await previewShows(page, 'on');
  await page.getByRole('button', { name: EN['editor.cropImage'] }).click();
  await cropperReady(page);
  const framed = await zoomAndDrag(page, heroDialog(page).locator('input[type=range]'), 1.5, 30, -40);
  await page.getByRole('button', { name: EN['editor.crop.applyCrop'] }).click();
  await waitPatch(page, h, 1);
  const patch = h.patches[0];
  const want = heroDisplayRegion(
    { x: (framed.x / 100) * DIM.width, y: (framed.y / 100) * DIM.height, width: (framed.w / 100) * DIM.width, height: (framed.h / 100) * DIM.height },
    DIM, HERO_BOX_ASPECTS.hero,
  )!;
  expect(want, 'the framed rectangle resolves').toBeTruthy();
  const enhance = readHeroEnhance(heroConfigOf(patch))!;
  expect(enhance, 'the Apply PATCH carries enhance').toBeTruthy();
  cropFlowCache = { h, framed, patch, display: displayOf(h), original: originalOf(h), region: want.region, enhance };
  return cropFlowCache;
}

/** A fresh page over the state the crop flow left: an enhanced, windowed hero with its kept original. */
async function resumeCrop(page: Page): Promise<{ flow: CropFlow; h: EditorHarness }> {
  const flow = await cropFlow(page);
  const h = cloneEditorHarness(flow.h);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await installEditor(page, h);
  return { flow, h };
}

test.describe('PHOTO.POLISH.1 — Auto enhance in the Edit Photo screen', () => {
  // A hero save on the mobile project (WebKit at 3×) is slow, not flaky.
  test.setTimeout(300_000);

  test('1. new pick, switch on, Save: a brighter display file, the same original, and enhance on the PATCH', async ({ page }) => {
    const off = await pickFlow(page, 'off');
    const on = await pickFlow(page, 'on');

    // Switch off: today's save — no key.
    expect(Object.keys(heroConfigOf(off.patch)), 'no enhance key with the switch off').not.toContain('enhance');
    expect(uploadKinds(off.h)).toEqual(['display', 'original']);
    expect(uploadKinds(on.h)).toEqual(['display', 'original']);

    // The PATCH carries enhance: full strength, and params that do something.
    const stored = readHeroEnhance(heroConfigOf(on.patch));
    expect(stored, 'the PATCH carries enhance').toBeTruthy();
    expect(stored!.strength).toBe(1);
    expect(isIdentity(stored!.params), 'the dim picture has something to enhance').toBe(false);
    expect(Object.keys(heroConfigOf(on.patch)), 'a no-crop save stores no window').not.toContain('window');

    // The original is the same bytes either way: it is never enhanced.
    expect(on.original.body.equals(off.original.body), 'the kept original is byte-identical with the switch on and off').toBe(true);

    // The display file is brighter than the un-enhanced bake, and is exactly
    // the whole picture enhanced with the stored numbers.
    const plain = await measureFile(page, off.display);
    const bright = await measureFile(page, on.display);
    expect([bright.w, bright.h], 'the same size as the un-enhanced bake').toEqual([plain.w, plain.h]);
    expect(lum(bright), `enhanced ${lum(bright).toFixed(1)} vs plain ${lum(plain).toFixed(1)}`).toBeGreaterThan(lum(plain) + 8);
    const scratch = await scratchBake(page, on.original, null, { w: bright.w, h: bright.h }, stored);
    expect(worstBlock(bright, scratch), 'the upload == the whole picture, enhanced with the stored params').toBeLessThan(2);
    const scratchPlain = await scratchBake(page, off.original, null, { w: plain.w, h: plain.h }, null);
    expect(worstBlock(plain, scratchPlain), 'control: the switch-off upload == the plain bake').toBeLessThan(2);
    expect(on.h.aiCalls, 'nothing reached ai-enhance').toEqual([]);
  });

  test('2. Crop + Apply with the switch on: window, windowSource and enhance stored; the upload is the region, enhanced', async ({ page }) => {
    const flow = await cropFlow(page);
    const cfg = heroConfigOf(flow.patch);
    expect(cfg.window, 'window is stored').toBeTruthy();
    expect(cfg.windowSource, 'windowSource is stored').toBeTruthy();
    expect(flow.enhance.strength).toBe(1);
    expect(isIdentity(flow.enhance.params)).toBe(false);
    expect(cfg.fit).toBe('fill');
    expect(uploadKinds(flow.h)).toEqual(['display', 'original']);

    // The upload is the region heroDisplayRegion gives…
    const got = await measureFile(page, flow.display);
    expect(Math.abs(got.w - flow.region.width), 'file width == region width').toBeLessThanOrEqual(2);
    expect(Math.abs(got.h - flow.region.height), 'file height == region height').toBeLessThanOrEqual(2);
    expect(got.w * got.h, 'not the whole picture').toBeLessThan(DIM.width * DIM.height * 0.9);
    // …enhanced with the stored params: it matches a from-scratch bake, and is
    // brighter than the same region left alone.
    const scratch = await scratchBake(page, flow.original, flow.region, { w: got.w, h: got.h }, flow.enhance);
    expect(worstBlock(got, scratch), 'the upload == the region, enhanced').toBeLessThan(2);
    const plain = await scratchBake(page, flow.original, flow.region, { w: got.w, h: got.h }, null);
    expect(lum(got), 'brighter than the region left alone').toBeGreaterThan(lum(plain) + 8);
    // The kept original is the picture as picked: not enhanced.
    const orig = await measureFile(page, flow.original);
    const pickedPlain = await measure(page, { b64: dimPng().toString('base64'), mime: 'image/png' });
    expect(worstBlock(orig, pickedPlain), 'the kept original is the picture as picked').toBeLessThan(2);
  });

  test('3. the pencil reopens on the stored strength; strength 50, Save: one upload from the original, nothing compounds', async ({ page }) => {
    const { flow, h } = await resumeCrop(page);
    const oldDisplay = objectPath(h.avatarUrl!);
    const before = heroConfigOf(flow.patch);
    await openPencil(page);
    await expect(row(page)).toBeVisible({ timeout: 15_000 });
    await expect(toggle(page), 'the switch reopens on').toHaveAttribute('aria-checked', 'true');
    await expect(strength(page), 'at the stored strength').toHaveValue('100');
    await previewShows(page, 'on');

    await setStrength(page, 50);
    await previewShows(page, 'on');
    await saveButton(page).click();
    await waitPatch(page, h, 1);

    // ONE new display upload; the original is not re-sent.
    expect(uploadKinds(h), 'one display upload, no original').toEqual(['display']);
    const cfg = heroConfigOf(h.patches[0]);
    const stored = readHeroEnhance(cfg)!;
    expect(stored, 'enhance is stored').toBeTruthy();
    expect(stored.strength).toBe(0.5);
    expect(stored.params, 'a strength change re-uses the stored params').toEqual(flow.enhance.params);
    // windowSource untouched; the window within 0.5%.
    expect(cfg.windowSource, 'windowSource is unchanged').toEqual(before.windowSource);
    const was = pictureFitSeed(before.window, canonicalHeroAspect()).crop!;
    const now = pictureFitSeed(cfg.window, canonicalHeroAspect()).crop!;
    expect(now, 'window is stored').toBeTruthy();
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(now[k] - was[k]), `window ${k}`).toBeLessThan(0.5);
    expect(h.patches[0].avatar_original_url, 'the original column is not written').toBeUndefined();

    // Made from the ORIGINAL: it matches a from-scratch 0.5 bake of the region,
    // not a second pass over the already-enhanced file.
    const display = displayOf(h);
    const got = await measureFile(page, display);
    const scratch = await scratchBake(page, flow.original, flow.region, { w: got.w, h: got.h }, { strength: 0.5, params: flow.enhance.params });
    expect(worstBlock(got, scratch), 'the upload == a from-scratch 0.5 bake of the original').toBeLessThan(2);
    const full = await measureFile(page, flow.display);
    const plain = await scratchBake(page, flow.original, flow.region, { w: got.w, h: got.h }, null);
    expect(lum(got), 'dimmer than the full-strength file').toBeLessThan(lum(full) - 3);
    expect(lum(got), 'brighter than no enhancement').toBeGreaterThan(lum(plain) + 3);
    // The superseded display object is deleted; the kept original is not.
    expect(JSON.stringify(h.deletes), 'the superseded display object was deleted').toContain(oldDisplay);
    expect(JSON.stringify(h.deletes), 'the kept original survives').not.toContain('-original.');
  });

  test('4. switch off, Save: the upload matches the un-enhanced bake; the key is gone', async ({ page }) => {
    const { flow, h } = await resumeCrop(page);
    const oldDisplay = objectPath(h.avatarUrl!);
    await openPencil(page);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(strength(page), 'no slider while off').toHaveCount(0);
    await previewShows(page, 'off');
    await saveButton(page).click();
    await waitPatch(page, h, 1);

    expect(uploadKinds(h)).toEqual(['display']);
    const cfg = heroConfigOf(h.patches[0]);
    expect(Object.keys(cfg), 'the key is gone').not.toContain('enhance');
    expect(readHeroEnhance(cfg)).toBeNull();
    expect(cfg.window, 'the window is kept').toBeTruthy();
    expect(cfg.windowSource, 'windowSource is unchanged').toEqual(heroConfigOf(flow.patch).windowSource);
    const got = await measureFile(page, displayOf(h));
    const plain = await scratchBake(page, flow.original, flow.region, { w: got.w, h: got.h }, null);
    expect(worstBlock(got, plain), 'the upload == the un-enhanced bake of the region').toBeLessThan(2);
    expect(JSON.stringify(h.deletes)).toContain(oldDisplay);
  });

  test('5. nothing changed, Save: no upload', async ({ page }) => {
    const { flow, h } = await resumeCrop(page);
    await openPencil(page);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(strength(page)).toHaveValue('100');
    await previewShows(page, 'on');
    await saveButton(page).click();
    await waitPatch(page, h, 1);
    expect(h.uploads, 'no upload').toHaveLength(0);
    expect(h.deletes, 'nothing deleted').toHaveLength(0);
    expect(h.patches[0].avatar_url, 'the picture column is not written').toBeUndefined();
    // The config-only write keeps what was stored.
    const cfg = heroConfigOf(h.patches[0]);
    expect(readHeroEnhance(cfg), 'enhance rides through a config-only save').toEqual(flow.enhance);
    expect(cfg.window).toEqual(heroConfigOf(flow.patch).window);
  });

  test('6. hold shows the un-enhanced picture and release returns; the preview matches what the page then shows', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    await installEditor(page, h);
    await openEditor(page);
    await pickDim(page);
    await previewShows(page, 'off');
    const offSrc = await previewSrc(page);
    const offLook = await measure(page, 'preview');

    await toggle(page).click();
    await previewShows(page, 'on');
    const onSrc = await previewSrc(page);
    expect(onSrc, 'the enhanced copy is another picture').not.toBe(offSrc);
    const onLook = await measure(page, 'preview');
    expect(Math.max(onLook.w, onLook.h), 'the preview copy is at most 800 px').toBeLessThanOrEqual(800);
    expect(lum(onLook), 'the preview is brighter with the switch on').toBeGreaterThan(lum(offLook) + 8);

    // Press and hold: the un-enhanced copy; release: the enhanced one again.
    const box = (await preview(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await previewShows(page, 'original');
    const heldLook = await measure(page, 'preview');
    expect(worstMean(heldLook, offLook), 'held: the un-enhanced picture').toBeLessThan(3);
    await page.mouse.up();
    await previewShows(page, 'on');
    expect(await previewSrc(page), 'released: the enhanced copy is back').toBe(onSrc);

    // The slider is live: 50 sits between off and full.
    await setStrength(page, 50);
    await expect.poll(async () => (await previewSrc(page)) !== onSrc, { timeout: 15_000, message: 'the preview was re-made' }).toBe(true);
    await previewShows(page, 'on');
    const halfLook = await measure(page, 'preview');
    expect(lum(halfLook)).toBeGreaterThan(lum(offLook) + 3);
    expect(lum(halfLook)).toBeLessThan(lum(onLook) - 3);
    await setStrength(page, 100);
    await expect.poll(async () => {
      try { return worstMean(await measure(page, 'preview'), onLook); } catch { return 255; }
    }, { timeout: 15_000, message: 'back at 100 the preview is the full-strength look again' }).toBeLessThan(1);
    await previewShows(page, 'on');
    const shownLook = await measure(page, 'preview');

    // Save: what the page then shows has the preview's mean colour.
    await saveButton(page).click();
    await waitPatch(page, h, 1);
    const name = h.avatarUrl!.split('/').pop()!;
    const hero = await heroSettled(page, 'hero', FRAME, name);
    expect(hero.src, 'the canvas shows the file just saved').toContain(name);
    const pageLook = await measureFile(page, displayOf(h));
    expect(worstMean(shownLook, pageLook), `preview ${shownLook.mean.map((v) => v.toFixed(1))} vs page ${pageLook.mean.map((v) => v.toFixed(1))}`).toBeLessThan(3);
    expect(readHeroEnhance(heroConfigOf(h.patches[0]))?.strength).toBe(1);
  });

  test('7. a GIF pick and a slot with no kept original show no row', async ({ page }) => {
    // A GIF pick: saved as picked, never re-encoded — nothing to enhance.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    await installEditor(page, h);
    await openEditor(page);
    await pickHeroFile(page, GIF_FILE);
    await expect(preview(page)).toBeVisible({ timeout: 30_000 });
    await expect(saveButton(page)).toBeVisible();
    await expect(row(page), 'no row for a GIF').toHaveCount(0);
    await heroDialog(page).getByRole('button', { name: EN['editor.cancel'], exact: true }).click();
    await expect(heroDialog(page)).toHaveCount(0);

    // The pencil on a hero with no kept original: no un-enhanced source.
    expect(h.originalUrl, 'control: this slot has no kept original').toBeNull();
    await page.getByTestId('device-frame').getByTitle(EN['editor.editCurrentPhoto']).first().click();
    await expect(preview(page)).toBeVisible({ timeout: 15_000 });
    await expect(saveButton(page)).toBeVisible();
    await page.waitForTimeout(1_500);
    await expect(row(page), 'no row without a kept original').toHaveCount(0);
    expect(h.patches, 'looking writes nothing').toHaveLength(0);

    // A hero cropped before windows were stored: a kept original, but the
    // display file is a cut of it and nothing records which — no row.
    const h3 = startHarness();
    h3.files.set(`${FIX_DIR}/legacy-crop.png`, { body: squarePng(), type: 'image/png' });
    h3.avatarUrl = `${AVATARS}${FIX_DIR}/legacy-crop.png`;
    h3.files.set(`${FIX_DIR}/kept-original.png`, { body: dimPng(), type: 'image/png' });
    h3.originalUrl = `${AVATARS}${FIX_DIR}/kept-original.png`;
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installEditor(page, h3);
    await openPencil(page);
    await expect(saveButton(page)).toBeVisible();
    await page.waitForTimeout(2_500);
    await expect(row(page), 'no row for a cut with no stored window').toHaveCount(0);
    expect(h3.patches, 'looking writes nothing').toHaveLength(0);

    // Control: the same slot WITH a kept original shows the row.
    const h2 = startHarness();
    h2.files.set(`${FIX_DIR}/kept-original.png`, { body: dimPng(), type: 'image/png' });
    h2.originalUrl = `${AVATARS}${FIX_DIR}/kept-original.png`;
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installEditor(page, h2);
    await openPencil(page);
    await expect(row(page), 'control: with a kept original the row shows').toBeVisible({ timeout: 15_000 });
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('8. Page 2\'s own hero: switch on, Save writes avatar_url_page2 and heroConfig_page2 with enhance; Page 1\'s slot is untouched', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    const page1Config = { ...h.heroConfig };
    const page1Picture = h.avatarUrl;
    // A second page with its own hero (heroInherit off), no picture yet.
    h.page2 = { avatarUrl: null, originalUrl: null, heroConfig: null };
    await installEditor(page, h);
    const frame = await openEditor(page);
    await heroSettled(page, 'hero', FRAME);

    const page2Tab = frame.getByRole('button', { name: EN['editor.page2'], exact: true });
    await expect(page2Tab, 'the two-page switcher is on the canvas').toBeVisible({ timeout: 15_000 });
    await page2Tab.click();
    await expect(page2Tab, 'Page 2 is the selected page').toHaveClass(/bg-\[#C9A55C\]/);

    await pickDim(page);
    await expect(toggle(page), 'the switch starts off').toHaveAttribute('aria-checked', 'false');
    await toggle(page).click();
    await previewShows(page, 'on');
    await saveButton(page).click();
    await waitPatch(page, h, 1);

    // ONE write, to the theme alone: Page 2's hero lives in theme_json.
    const patch = h.patches[0];
    expect(Object.keys(patch), 'Page 1\'s picture columns are not written').toEqual(['theme_json']);
    const theme = patch.theme_json as Record<string, unknown>;
    expect(uploadKinds(h)).toEqual(['display', 'original']);
    const displayUpload = h.uploads.find((u) => !u.path.includes('-original.'))!;
    const originalUpload = h.uploads.find((u) => u.path.includes('-original.'))!;
    expect(objectPath(theme.avatar_url_page2 as string), 'avatar_url_page2 is the display upload').toBe(displayUpload.path);
    expect(objectPath(theme.avatar_original_url_page2 as string), 'avatar_original_url_page2 is the kept original').toBe(originalUpload.path);

    // Page 2's slot carries enhance; Page 1's slot is exactly what it was.
    const stored = readHeroEnhance(theme.heroConfig_page2);
    expect(stored, 'heroConfig_page2 carries enhance').toBeTruthy();
    expect(stored!.strength).toBe(1);
    expect(isIdentity(stored!.params), 'the dim picture has something to enhance').toBe(false);
    expect(theme.heroConfig, 'Page 1\'s hero slot is untouched').toEqual(page1Config);
    expect(readHeroEnhance(theme.heroConfig), 'no enhance on Page 1').toBeNull();
    expect(h.avatarUrl, 'Page 1\'s picture is untouched').toBe(page1Picture);
    expect(JSON.stringify(h.deletes), 'Page 1\'s file is not deleted').not.toContain(PLACARD);

    // The upload is the whole picture, enhanced with the stored numbers; the kept original is not.
    const display = h.files.get(displayUpload.path)!;
    const original = h.files.get(originalUpload.path)!;
    const got = await measureFile(page, display);
    const scratch = await scratchBake(page, original, null, { w: got.w, h: got.h }, stored);
    expect(worstBlock(got, scratch), 'the upload == the whole picture, enhanced with the stored params').toBeLessThan(2);
    const plain = await scratchBake(page, original, null, { w: got.w, h: got.h }, null);
    expect(lum(got), 'brighter than the picture left alone').toBeGreaterThan(lum(plain) + 8);
    const picked = await measure(page, { b64: dimPng().toString('base64'), mime: 'image/png' });
    expect(worstBlock(await measureFile(page, original), picked), 'the kept original is the picture as picked').toBeLessThan(2);
    expect(h.aiCalls, 'nothing reached ai-enhance').toEqual([]);
  });

  test('9. the public page never requests the canvas chunk; the editor does, once, when the row is used', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    await installEditor(page, h);
    // The dev server serves every module as its own request, so a module on a
    // page's path shows up by name.
    const seen: string[] = [];
    page.on('request', (req) => {
      const p = new URL(req.url()).pathname;
      if (p.startsWith('/src/lib/')) seen.push(p);
    });
    const requests = (file: string) => seen.filter((p) => p === `/src/lib/${file}`).length;

    // A visitor: the stored-key module rides with the page, the canvas work does not.
    await openPublic(page, { width: 402, height: 874 });
    await heroSettled(page, 'hero', '');
    // Down the whole page (mobile WebKit has no mouse wheel), so anything a scroll would load has loaded.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1_500);
    expect(requests('hero-enhance.ts'), 'control: hero-enhance.ts IS on the public page\'s path').toBe(1);
    expect(requests('auto-enhance-params.ts'), 'control: so is the light params module').toBe(1);
    expect(requests('hero-enhance-canvas.ts'), 'the public page does not request the canvas chunk').toBe(0);
    expect(requests('auto-enhance.ts'), 'nor the heavy half of the enhancement').toBe(0);

    // The editor: not on load, not when the Edit Photo screen opens…
    seen.length = 0;
    await openEditor(page);
    await pickDim(page);
    await previewShows(page, 'off');
    await page.waitForTimeout(1_000);
    expect(requests('hero-enhance.ts'), 'control: the editor loaded the stored-key module').toBe(1);
    expect(requests('hero-enhance-canvas.ts'), 'the row on screen, unused: no canvas chunk yet').toBe(0);
    expect(requests('auto-enhance.ts')).toBe(0);
    // …but once the row is used.
    await toggle(page).click();
    await previewShows(page, 'on');
    expect(requests('hero-enhance-canvas.ts'), 'the switch fetched the canvas chunk').toBe(1);
    expect(requests('auto-enhance.ts'), 'and the heavy half with it').toBe(1);
    // One cached load: using the row again fetches nothing.
    await toggle(page).click();
    await previewShows(page, 'off');
    await toggle(page).click();
    await previewShows(page, 'on');
    expect(requests('hero-enhance-canvas.ts'), 'one load, kept').toBe(1);
    expect(h.patches, 'looking writes nothing').toHaveLength(0);
  });
});

// PHOTO.POLISH.1 — Auto enhance in the photo editor.
//
// A switch with a strength slider in the hero photo editor (PHOTO.EDITOR.1: ONE
// screen, src/components/HeroPhotoEditor.tsx — the enhanced look is shown in the
// cropper itself). The kept original is never changed; the DISPLAY file is what
// gets enhanced, and the hero config stores `enhance` { strength, params }
// beside the window:
//
//   1. new pick, switch on, OK: the display upload is brighter than the
//      un-enhanced bake, the original upload is byte-identical to the one sent
//      with the switch off, and the PATCH carries `enhance` and the window;
//   2. switch on, drag and zoom, OK: window, windowSource and enhance are
//      stored, the upload is the region, enhanced, and the drag did not
//      re-analyse (the params are the ones a save with no drag stores);
//   3. the pencil reopens on the stored frame with the switch on at the stored
//      strength; strength to 50, OK: ONE new display upload, made from the
//      ORIGINAL (it matches a from-scratch 0.5 bake, so nothing compounds), the
//      window is unchanged, windowSource is untouched, and the superseded
//      display object is deleted;
//   4. switch off, OK: the upload matches the un-enhanced bake; the key is gone;
//   5. nothing changed, OK: no upload and no write at all;
//   6. switch on at 50: hold shows the real source and release returns; OK
//      stores 0.5, and the upload is the framed region of what the editor
//      showed — a from-scratch bake with the stored params, within 2 levels;
//  6b. the switch, the strength slider and a hold never move the framed area;
//   7. a GIF: no drag, no zoom, no row, one caption, saved as picked; a slot
//      with no kept original opens on the display file with no row;
//
// PHOTO.POLISH.2:
//   8. Page 2's OWN hero (not inheriting): switch on, OK — the write goes to
//      theme_json.avatar_url_page2 and heroConfig_page2 with `enhance`, and
//      Page 1's picture column and hero slot are untouched;
//   9. the canvas work is a lazy chunk: the public page never requests
//      hero-enhance-canvas (nor the heavy half of auto-enhance), and the editor
//      requests it once, only when the row is used.
//
// PHOTO.EDITOR.1:
//  10. New photo inside the editor: a new pick, the switch back to off, the
//      frame reset;
//  11. the editor fits: every control on screen with no scrolling at 375x553,
//      393x659 and 1440x900, switch off and on, hero and full-screen.
//
// Built like spec 101. Battery account; reads patched; EVERY write is captured
// and fulfilled in tests/helpers/hero-window-harness.ts — no real hero save, and
// `ai-enhance` is trapped, never sent. The picture is synthetic: a dim,
// photo-like scene (soft gradients, a warm patch, per-pixel grain).
import { PNG } from 'pngjs';
import { test, expect, type Page } from './fixtures';
import { PINNED_TEST_USER_ID } from './helpers/auth';
import { translations } from '../src/hooks/useLanguage';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '../src/lib/device-presets';
import { pictureFitSeed } from '../src/lib/picture-fit';
import { readHeroEnhance, type HeroEnhance } from '../src/lib/hero-enhance';
import { isIdentity } from '../src/lib/auto-enhance';
import {
  AVATARS, FRAME, DIM, SRC,
  installEditor, newEditorHarness, cloneEditorHarness, openEditor, openPublic, heroDialog, pickHeroFile,
  zoomAndDrag, heroSettled, objectPath, dimPng, rulerPng, decodeRuler, pct, expectWin, framedInCropper,
  photoEditorReady, editorZoom, editorOk, editorNewPhoto, enhanceRow, enhanceSwitch, enhanceStrength,
  editorShows, setRange, cropperPicture, winDrift, holdPhoto, checkerGif,
  measurePicture, scratchBake, worstBlock, lumOf, worstMean, regionFor, CROPPER_IMG,
  readEditorLayout, expectEditorFits,
  type EditorHarness, type StoredFile, type Style, type Win,
} from './helpers/hero-window-harness';

const EN = translations.en as Record<string, string>;
const FIX_DIR = `${PINNED_TEST_USER_ID}/photopolish1`;
const PLACARD = `${FIX_DIR}/before.png`;

// The dim, photo-like picture is the harness's (dimPng): spec 102 uses it too.
const DIM_FILE = () => ({ name: 'dim.png', mimeType: 'image/png', buffer: dimPng() });
const RULER_FILE = () => ({ name: 'ruler.png', mimeType: 'image/png', buffer: rulerPng() });

/** A square cut: not the kept original's shape. */
function squarePng(): Buffer {
  const png = new PNG({ width: 300, height: 300 });
  for (let p = 0; p < 300 * 300; p++) png.data.set([70 + (p % 300) / 6, 60, 50 + Math.floor(p / 300) / 6, 255], p * 4);
  return PNG.sync.write(png);
}

/** A valid GIF, big enough to sit in the cropper like a real one. */
const GIF_BYTES = checkerGif(120, 180);
const GIF_FILE = { name: 'checker.gif', mimeType: 'image/gif', buffer: GIF_BYTES };

// ── reading pictures (the harness's measuring helpers) ───────────────────────
const measureFile = (page: Page, f: StoredFile) => measurePicture(page, f);
const lum = lumOf;

// ── driving the photo editor ─────────────────────────────────────────────────
const row = enhanceRow;
const toggle = enhanceSwitch;
const strength = enhanceStrength;
const setStrength = (page: Page, value: number) => setRange(strength(page), value);

async function pickDim(page: Page) {
  await pickHeroFile(page, DIM_FILE());
  await photoEditorReady(page);
  await expect(row(page)).toBeVisible({ timeout: 15_000 });
}

async function openPencil(page: Page) {
  const frame = await openEditor(page);
  await heroSettled(page, 'hero', FRAME);
  await frame.getByTitle(EN['editor.editCurrentPhoto']).first().click();
  await photoEditorReady(page);
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

type PxRegion = { x: number; y: number; width: number; height: number };

// ── shared flows (one real run each; a failed flow caches nothing) ───────────
type PickFlow = {
  h: EditorHarness; display: StoredFile; original: StoredFile; patch: Record<string, unknown>;
  framed: Win; region: PxRegion;
};
const pickFlows: Partial<Record<'off' | 'on', PickFlow>> = {};
/** New pick → (switch on) → OK, with the frame left where the editor opened it. */
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
    await editorShows(page, 'on');
  }
  const framed = await framedInCropper(page);
  await editorOk(page).click();
  await waitPatch(page, h, 1);
  const flow = { h, display: displayOf(h), original: originalOf(h), patch: h.patches[0], framed, region: regionFor(framed, DIM, 'hero').region };
  pickFlows[mode] = flow;
  return flow;
}

type CropFlow = {
  h: EditorHarness; framed: Win; patch: Record<string, unknown>;
  display: StoredFile; original: StoredFile;
  region: PxRegion;
  enhance: HeroEnhance;
};
let cropFlowCache: CropFlow | null = null;
/** New pick → switch on → zoom 1.5, off-centre → OK. */
async function cropFlow(page: Page): Promise<CropFlow> {
  if (cropFlowCache) return cropFlowCache;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const h = startHarness();
  await installEditor(page, h);
  await openEditor(page);
  await pickDim(page);
  await toggle(page).click();
  await editorShows(page, 'on');
  const framed = await zoomAndDrag(page, editorZoom(page), 1.5, 30, -40);
  await editorOk(page).click();
  await waitPatch(page, h, 1);
  const patch = h.patches[0];
  const want = regionFor(framed, DIM, 'hero');
  const enhance = readHeroEnhance(heroConfigOf(patch))!;
  expect(enhance, 'the OK PATCH carries enhance').toBeTruthy();
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

test.describe('PHOTO.POLISH.1 — Auto enhance in the photo editor', () => {
  // A hero save on the mobile project (WebKit at 3×) is slow, not flaky.
  test.setTimeout(300_000);

  test('1. new pick, switch on, OK: a brighter display file, the same original, and enhance on the PATCH', async ({ page }) => {
    const off = await pickFlow(page, 'off');
    const on = await pickFlow(page, 'on');

    // Switch off: no key.
    expect(Object.keys(heroConfigOf(off.patch)), 'no enhance key with the switch off').not.toContain('enhance');
    expect(uploadKinds(off.h)).toEqual(['display', 'original']);
    expect(uploadKinds(on.h)).toEqual(['display', 'original']);

    // The PATCH carries enhance: full strength, and params that do something.
    const stored = readHeroEnhance(heroConfigOf(on.patch));
    expect(stored, 'the PATCH carries enhance').toBeTruthy();
    expect(stored!.strength).toBe(1);
    expect(isIdentity(stored!.params), 'the dim picture has something to enhance').toBe(false);
    // PHOTO.EDITOR.1: every save stores the framed window, switch on or off.
    for (const flow of [off, on]) {
      const cfg = heroConfigOf(flow.patch);
      expect(cfg.fit).toBe('fill');
      expect(cfg.window, 'the window is stored').toBeTruthy();
      expect(cfg.windowSource, 'windowSource is stored').toBeTruthy();
      expectWin(pictureFitSeed(cfg.windowSource, canonicalHeroAspect()).crop!, flow.framed, 'windowSource == the area the editor opened on');
    }

    // The original is the same bytes either way: it is never enhanced.
    expect(on.original.body.equals(off.original.body), 'the kept original is byte-identical with the switch on and off').toBe(true);

    // The display file is brighter than the un-enhanced bake, and is exactly
    // the region for the zoom-1 centred area, enhanced with the stored numbers.
    const plain = await measureFile(page, off.display);
    const bright = await measureFile(page, on.display);
    expect([bright.w, bright.h], 'the same size as the un-enhanced bake').toEqual([plain.w, plain.h]);
    expect(Math.abs(plain.w - off.region.width), 'the file is the region: width').toBeLessThanOrEqual(2);
    expect(Math.abs(plain.h - off.region.height), 'the file is the region: height').toBeLessThanOrEqual(2);
    expect(lum(bright), `enhanced ${lum(bright).toFixed(1)} vs plain ${lum(plain).toFixed(1)}`).toBeGreaterThan(lum(plain) + 8);
    const scratch = await scratchBake(page, on.original, on.region, { w: bright.w, h: bright.h }, stored);
    expect(worstBlock(bright, scratch), 'the upload == the region, enhanced with the stored params').toBeLessThan(2);
    const scratchPlain = await scratchBake(page, off.original, off.region, { w: plain.w, h: plain.h }, null);
    expect(worstBlock(plain, scratchPlain), 'control: the switch-off upload == the plain bake').toBeLessThan(2);
    expect(on.h.aiCalls, 'nothing reached ai-enhance').toEqual([]);
  });

  test('2. switch on, drag and zoom, OK: window, windowSource and enhance stored; the upload is the region, enhanced; the drag did not re-analyse', async ({ page }) => {
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
    const pickedPlain = await measurePicture(page, { body: dimPng(), type: 'image/png' });
    expect(worstBlock(orig, pickedPlain), 'the kept original is the picture as picked').toBeLessThan(2);
    // The switch analysed ONCE, on the area framed when it was turned on (the
    // area the editor opened on): the zoom and the drag after it changed nothing.
    const untouched = await pickFlow(page, 'on');
    expect(flow.enhance.params, 'the same params as a save with no drag').toEqual(readHeroEnhance(heroConfigOf(untouched.patch))!.params);
  });

  test('3. the pencil reopens on the stored frame and strength; strength 50, OK: one upload from the original, nothing compounds', async ({ page }) => {
    const { flow, h } = await resumeCrop(page);
    const oldDisplay = objectPath(h.avatarUrl!);
    const before = heroConfigOf(flow.patch);
    await openPencil(page);
    await expect(row(page)).toBeVisible({ timeout: 15_000 });
    await expect(toggle(page), 'the switch reopens on').toHaveAttribute('aria-checked', 'true');
    await expect(strength(page), 'at the stored strength').toHaveValue('100');
    await editorShows(page, 'on');
    expectWin(await framedInCropper(page), flow.framed, 'the editor reopened on the stored frame');

    await setStrength(page, 50);
    await editorShows(page, 'on');
    expect(winDrift(await framedInCropper(page), flow.framed), 'a strength change does not move the frame').toBeLessThan(0.2);
    await editorOk(page).click();
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

  test('4. switch off, OK: the upload matches the un-enhanced bake; the key is gone', async ({ page }) => {
    const { flow, h } = await resumeCrop(page);
    const oldDisplay = objectPath(h.avatarUrl!);
    await openPencil(page);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await editorShows(page, 'on');
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(strength(page), 'no slider while off').toHaveCount(0);
    await editorShows(page, 'off');
    await editorOk(page).click();
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

  test('5. nothing changed, OK: no upload and no write at all', async ({ page }) => {
    const { h } = await resumeCrop(page);
    await openPencil(page);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(strength(page)).toHaveValue('100');
    await editorShows(page, 'on');
    // Looking is not touching: a hold to compare, and the strength there and back.
    await holdPhoto(page);
    await editorShows(page, 'original');
    await page.mouse.up();
    await editorShows(page, 'on');
    await setStrength(page, 60);
    await setStrength(page, 100);
    await editorShows(page, 'on');
    await editorOk(page).click();
    await expect(heroDialog(page), 'the editor closed').toHaveCount(0, { timeout: 15_000 });
    await page.waitForTimeout(1_500);
    expect(h.uploads, 'no upload').toHaveLength(0);
    expect(h.deletes, 'nothing deleted').toHaveLength(0);
    expect(h.patches, 'no pages PATCH').toHaveLength(0);
  });

  test('6. switch on at 50, hold shows the source and release returns; OK stores 0.5 and uploads what the editor showed', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    await installEditor(page, h);
    await openEditor(page);
    await pickDim(page);
    await editorShows(page, 'off');
    const offPic = await cropperPicture(page);
    expect([offPic.w, offPic.h], 'switch off: the cropper holds the real source').toEqual([DIM.width, DIM.height]);
    const offLook = await measurePicture(page, CROPPER_IMG);

    await toggle(page).click();
    await editorShows(page, 'on');
    const onPic = await cropperPicture(page);
    expect(onPic.src, 'the enhanced copy is another picture').not.toBe(offPic.src);
    expect(Math.max(onPic.w, onPic.h), 'the enhanced copy is at most 1600 px on its long side').toBeLessThanOrEqual(1600);
    expect(Math.abs(onPic.w / onPic.h / (DIM.width / DIM.height) - 1), 'the WHOLE picture, the same shape').toBeLessThan(0.005);
    const onLook = await measurePicture(page, CROPPER_IMG);
    expect(lum(onLook), 'the editor is brighter with the switch on').toBeGreaterThan(lum(offLook) + 8);

    // Press and hold: the real source; release: the enhanced copy again.
    await holdPhoto(page);
    await editorShows(page, 'original');
    expect((await cropperPicture(page)).src, 'held: the real source').toBe(offPic.src);
    expect(worstMean(await measurePicture(page, CROPPER_IMG), offLook), 'held: the un-enhanced picture').toBeLessThan(1);
    await page.mouse.up();
    await editorShows(page, 'on');
    expect((await cropperPicture(page)).src, 'released: the enhanced copy is back').toBe(onPic.src);

    // The slider is live: 50 sits between off and full.
    await setStrength(page, 50);
    await expect.poll(async () => (await cropperPicture(page)).src !== onPic.src, { timeout: 15_000, message: 'the enhanced copy was re-made' }).toBe(true);
    await editorShows(page, 'on');
    const halfLook = await measurePicture(page, CROPPER_IMG);
    expect(lum(halfLook)).toBeGreaterThan(lum(offLook) + 3);
    expect(lum(halfLook)).toBeLessThan(lum(onLook) - 3);

    // OK: what is uploaded is the framed region of what the editor showed.
    const framed = await framedInCropper(page);
    const want = regionFor(framed, DIM, 'hero');
    const cut: Win = {
      x: (100 * want.region.x) / DIM.width, y: (100 * want.region.y) / DIM.height,
      w: (100 * want.region.width) / DIM.width, h: (100 * want.region.height) / DIM.height,
    };
    const shownLook = await measurePicture(page, CROPPER_IMG, cut);
    await editorOk(page).click();
    await waitPatch(page, h, 1);
    const stored = readHeroEnhance(heroConfigOf(h.patches[0]))!;
    expect(stored, 'enhance is stored').toBeTruthy();
    expect(stored.strength, 'the strength the slider showed').toBe(0.5);
    const name = h.avatarUrl!.split('/').pop()!;
    const hero = await heroSettled(page, 'hero', FRAME, name);
    expect(hero.src, 'the canvas shows the file just saved').toContain(name);
    const pageLook = await measureFile(page, displayOf(h));
    expect(worstMean(shownLook, pageLook), `editor ${shownLook.mean.map((v) => v.toFixed(1))} vs page ${pageLook.mean.map((v) => v.toFixed(1))}`).toBeLessThan(3);
    // …and it is exactly a from-scratch bake of the region with the stored params.
    const scratch = await scratchBake(page, originalOf(h), want.region, { w: pageLook.w, h: pageLook.h }, stored);
    expect(worstBlock(pageLook, scratch), 'the upload == a from-scratch bake with the stored params (levels per channel)').toBeLessThan(2);
  });

  test('6b. the switch, the strength slider and a hold never move the framed area', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    await installEditor(page, h);
    await openEditor(page);
    await pickDim(page);
    const framed = await zoomAndDrag(page, editorZoom(page), 1.8, 25, -35);
    const still = async (what: string) =>
      expect(winDrift(await framedInCropper(page), framed), `${what}: the framed area moved (percent of the picture)`).toBeLessThan(0.2);

    await toggle(page).click();
    await editorShows(page, 'on');
    await still('switch on');
    await setStrength(page, 30);
    await editorShows(page, 'on');
    await page.waitForTimeout(600);
    await still('strength 30');
    await holdPhoto(page);
    await editorShows(page, 'original');
    await still('held');
    await page.mouse.up();
    await editorShows(page, 'on');
    await still('released');
    await toggle(page).click();
    await editorShows(page, 'off');
    await still('switch off');
    await toggle(page).click();
    await editorShows(page, 'on');
    await still('switch on again');
    await expect(editorZoom(page), 'the zoom is where it was left').toHaveValue('1.8');
    expect(h.patches, 'looking writes nothing').toHaveLength(0);
  });

  test('7. a GIF is shown as the page will show it and saved as picked; no kept original, no Auto enhance row', async ({ page }) => {
    // A GIF pick: no drag, no zoom, no row, one caption — and OK saves it as picked.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    await installEditor(page, h);
    await openEditor(page);
    await pickHeroFile(page, GIF_FILE);
    await photoEditorReady(page);
    await expect(row(page), 'no row for a GIF').toHaveCount(0);
    await expect(heroDialog(page).getByText(EN['editor.hero.gifNoCrop'], { exact: true }), 'the caption').toBeVisible();
    await expect(editorZoom(page), 'the zoom slider is disabled').toBeDisabled();
    const gifFramed = await framedInCropper(page);
    const box = (await page.locator('.reactEasyCrop_CropArea').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 6 });
    await page.waitForTimeout(600);
    await page.mouse.up();
    expect(winDrift(await framedInCropper(page), gifFramed), 'a GIF does not drag').toBe(0);
    await editorOk(page).click();
    await waitPatch(page, h, 1);
    const gifCfg = heroConfigOf(h.patches[0]);
    expect(gifCfg.fit).toBe('fill');
    expect(gifCfg.posX).toBe(50);
    expect(gifCfg.posY).toBe(50);
    for (const key of ['window', 'windowSource', 'enhance']) expect(Object.keys(gifCfg), `a GIF stores no ${key}`).not.toContain(key);
    expect(uploadKinds(h)).toEqual(['display', 'original']);
    for (const u of h.uploads) {
      expect(u.type, `${u.path} is uploaded as a GIF`).toBe('image/gif');
      expect(h.files.get(u.path)!.body.equals(GIF_BYTES), `${u.path} is the GIF as picked`).toBe(true);
    }

    // The pencil on a hero with no kept original: the display file, and no row
    // (its pixels may already be enhanced).
    const h1 = startHarness();
    expect(h1.originalUrl, 'control: this slot has no kept original').toBeNull();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await installEditor(page, h1);
    await openPencil(page);
    expect((await cropperPicture(page)).src, 'the cropper holds the display file').toContain(PLACARD.split('/').pop()!);
    await page.waitForTimeout(1_500);
    await expect(row(page), 'no row without a kept original').toHaveCount(0);
    await expect(editorZoom(page)).toBeEnabled();
    expect(h1.patches, 'looking writes nothing').toHaveLength(0);

    // With a kept original the row shows — also for a hero cut before windows
    // were stored: OK bakes its own region from the kept original now.
    for (const legacyCut of [true, false]) {
      const h2 = startHarness();
      if (legacyCut) {
        h2.files.set(`${FIX_DIR}/legacy-crop.png`, { body: squarePng(), type: 'image/png' });
        h2.avatarUrl = `${AVATARS}${FIX_DIR}/legacy-crop.png`;
      }
      h2.files.set(`${FIX_DIR}/kept-original.png`, { body: dimPng(), type: 'image/png' });
      h2.originalUrl = `${AVATARS}${FIX_DIR}/kept-original.png`;
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await installEditor(page, h2);
      await openPencil(page);
      expect((await cropperPicture(page)).src, 'the cropper holds the kept original').toContain('kept-original.png');
      await expect(row(page), 'with a kept original the row shows').toBeVisible({ timeout: 15_000 });
      await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
      expect(h2.patches, 'looking writes nothing').toHaveLength(0);
    }
  });

  test('8. Page 2\'s own hero: switch on, OK writes avatar_url_page2 and heroConfig_page2 with enhance; Page 1\'s slot is untouched', async ({ page }) => {
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
    await editorShows(page, 'on');
    const framed = await framedInCropper(page);
    await editorOk(page).click();
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

    // Page 2's slot carries enhance and its window; Page 1's slot is exactly what it was.
    const slot = theme.heroConfig_page2 as Record<string, unknown>;
    const stored = readHeroEnhance(slot);
    expect(stored, 'heroConfig_page2 carries enhance').toBeTruthy();
    expect(stored!.strength).toBe(1);
    expect(isIdentity(stored!.params), 'the dim picture has something to enhance').toBe(false);
    expect(slot.fit).toBe('fill');
    expect(slot.window, 'Page 2\'s slot carries its window').toBeTruthy();
    expectWin(pictureFitSeed(slot.windowSource, canonicalHeroAspect()).crop!, framed, 'Page 2\'s windowSource == framed');
    expect(theme.heroConfig, 'Page 1\'s hero slot is untouched').toEqual(page1Config);
    expect(readHeroEnhance(theme.heroConfig), 'no enhance on Page 1').toBeNull();
    expect(h.avatarUrl, 'Page 1\'s picture is untouched').toBe(page1Picture);
    expect(JSON.stringify(h.deletes), 'Page 1\'s file is not deleted').not.toContain(PLACARD);

    // The upload is the framed region, enhanced with the stored numbers; the kept original is not.
    const region = regionFor(framed, DIM, 'hero').region;
    const display = h.files.get(displayUpload.path)!;
    const original = h.files.get(originalUpload.path)!;
    const got = await measureFile(page, display);
    const scratch = await scratchBake(page, original, region, { w: got.w, h: got.h }, stored);
    expect(worstBlock(got, scratch), 'the upload == the region, enhanced with the stored params').toBeLessThan(2);
    const plain = await scratchBake(page, original, region, { w: got.w, h: got.h }, null);
    expect(lum(got), 'brighter than the region left alone').toBeGreaterThan(lum(plain) + 8);
    const picked = await measurePicture(page, { body: dimPng(), type: 'image/png' });
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
      if (p.startsWith('/src/lib/') || p.startsWith('/src/components/')) seen.push(p);
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

    // The editor: not on load, not when the photo editor opens…
    seen.length = 0;
    await openEditor(page);
    await pickDim(page);
    await editorShows(page, 'off');
    await page.waitForTimeout(1_000);
    expect(requests('hero-enhance.ts'), 'control: the editor loaded the stored-key module').toBe(1);
    expect(requests('hero-enhance-canvas.ts'), 'the row on screen, unused: no canvas chunk yet').toBe(0);
    expect(requests('auto-enhance.ts')).toBe(0);
    // …but once the row is used.
    await toggle(page).click();
    await editorShows(page, 'on');
    expect(requests('hero-enhance-canvas.ts'), 'the switch fetched the canvas chunk').toBe(1);
    expect(requests('auto-enhance.ts'), 'and the heavy half with it').toBe(1);
    // One cached load: using the row again fetches nothing.
    await toggle(page).click();
    await editorShows(page, 'off');
    await toggle(page).click();
    await editorShows(page, 'on');
    expect(requests('hero-enhance-canvas.ts'), 'one load, kept').toBe(1);
    expect(h.patches, 'looking writes nothing').toHaveLength(0);
  });

  test('10. New photo inside the editor: a new pick, the switch back to off, the frame reset', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = startHarness();
    await installEditor(page, h);
    await openEditor(page);
    await pickDim(page);
    await toggle(page).click();
    await editorShows(page, 'on');
    await setStrength(page, 40);
    const moved = await zoomAndDrag(page, editorZoom(page), 2, 30, -30);
    expect(moved.w, 'control: zoomed in on the first pick').toBeLessThan(60);

    // New photo: the gallery opens; the pick lands back in the same editor.
    const chooser = page.waitForEvent('filechooser');
    await editorNewPhoto(page).click();
    await (await chooser).setFiles(RULER_FILE());
    await expect.poll(async () => (await cropperPicture(page)).w, { timeout: 30_000, message: 'the cropper holds the new pick' }).toBe(SRC.width);
    await photoEditorReady(page);
    await expect(heroDialog(page), 'still ONE editor').toHaveCount(1);
    await expect(toggle(page), 'the switch is back to off').toHaveAttribute('aria-checked', 'false');
    await expect(strength(page), 'no slider while off').toHaveCount(0);
    await editorShows(page, 'off');
    await expect(editorZoom(page), 'the zoom is back to 1').toHaveValue('1');
    const frameH = (100 * SRC.width) / (canonicalHeroAspect() * SRC.height);
    const centred: Win = { x: 0, y: (100 - frameH) / 2, w: 100, h: frameH };
    expectWin(await framedInCropper(page), centred, 'the frame is reset to the centred area of the new picture');
    expect(h.patches, 'nothing was written by the first pick').toHaveLength(0);
    expect(h.uploads, 'and nothing uploaded').toHaveLength(0);

    // OK saves the NEW picture, un-enhanced, with a fresh strength for next time.
    await editorOk(page).click();
    await waitPatch(page, h, 1);
    const cfg = heroConfigOf(h.patches[0]);
    expect(readHeroEnhance(cfg), 'no enhancement rode over from the first pick').toBeNull();
    const held = await decodeRuler(page, displayOf(h));
    const want = regionFor(centred, SRC, 'hero').region;
    expectWin(pct(held), pct({ x0: want.x, x1: want.x + want.width, y0: want.y, y1: want.y + want.height }), 'the upload is cut from the new pick');
  });

  for (const style of ['hero', 'full_bleed'] as Style[]) {
    test(`11. the editor fits · ${style}: every control on screen with no scrolling at 375x553, 393x659 and 1440x900, switch off and on`, async ({ page }) => {
      const labels = { title: EN['editor.editPhoto'], caption: EN['editor.hero.holdToCompare'] };
      for (const vp of [{ width: 375, height: 553 }, { width: 393, height: 659 }, { width: 1440, height: 900 }]) {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        const h = newEditorHarness(style, { fit: 'fill', posY: 25 }, 'photopolish1-links-block');
        h.files.set(PLACARD, { body: dimPng(), type: 'image/png' });
        h.avatarUrl = `${AVATARS}${PLACARD}`;
        await installEditor(page, h);
        await openEditor(page);
        await pickDim(page);
        // The editor is a full-screen layer: it is measured at the size asked for.
        await page.setViewportSize(vp);
        await editorShows(page, 'off');
        for (const on of [false, true]) {
          if (on) {
            await toggle(page).click();
            await editorShows(page, 'on');
          }
          const at = `${style} ${vp.width}x${vp.height}, switch ${on ? 'on' : 'off'}`;
          const m = await readEditorLayout(page, labels);
          expect([m.vw, m.vh], `${at}: the viewport`).toEqual([vp.width, vp.height]);
          expectEditorFits(m, at, on);
          // The frame is the page's shape.
          const shape = m.parts.frame!.width / m.parts.frame!.height;
          const wantShape = style === 'hero' ? canonicalHeroAspect() : canonicalFullBleedAspect();
          expect(Math.abs(shape / wantShape - 1), `${at}: the frame is the ${style} shape`).toBeLessThan(0.01);
        }
        expect(h.patches, 'looking writes nothing').toHaveLength(0);
      }
    });
  }
});

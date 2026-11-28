// HERO.FIT.3 — onboarding and the face buttons use the hero's window.
//
// HERO.FIT.2 made the editor's crop store a framed WINDOW over a display file
// that is the framed area plus margin. Two places still baked a file with no
// window: the onboarding crop (square by default, offering shapes the page
// never shows) and the editor's Headshot / Shoulders / Full Body buttons (a
// square, sent to the paid `ai-enhance` function for Pro). Now:
//
//   1. the onboarding crop frame is the hero's shape (the full-screen shape on a
//      full-screen page); the uploaded display file is the region
//      heroDisplayRegion gives, not the framed rectangle alone and not the whole
//      picture; and the phone preview shows exactly what was framed;
//   2. the page insert carries `heroConfig` { fit 'fill', posX 50, posY 50,
//      window } — with `windowSource` when the original uploaded, without it
//      when it did not;
//   4. editor (HERO.FIT.3c: manual only): on a hero page and on a full-screen
//      page the photo editor shows the zoom slider, New photo and OK — no Auto
//      frame and no Headshot / Shoulders / Full Body — and while it is open
//      nothing is fetched from /models/ and nothing reaches `ai-enhance`;
//   6. HERO.FIT.3b: Back to step 2 on a page this run created, a new photo
//      cropped, forward again — ONE `pages` update carries the new avatar_url,
//      avatar_original_url and the window made for that file; with no uploaded
//      URL (6b) the update carries the theme alone, with no window.
//
// PHOTO.EDITOR.1 — sign-up opens the SAME photo editor the editor does
// (src/components/HeroPhotoEditor.tsx); the preview modal, the crop modal and
// "Use Original" are gone:
//   3. OK straight after a pick: the upload is the region for the zoom-1 centred
//      area, and the insert carries the window and windowSource;
//   5. a pick opens the photo editor directly, in English and in Spanish: no Use
//      Image, Crop Image, Use Original, Back or Apply Crop;
//   7. Auto enhance at 50, OK: hold shows the source and release returns; a
//      brighter display file, the same original, `enhance` 0.5 beside the
//      window, and the upload is a from-scratch bake with the stored params;
//   8. the switch, the strength slider and a hold never move the framed area;
//   9. a GIF: no drag, no row, one caption, kept as picked;
//  10. the editor fits: every control on screen with no scrolling at 375x553,
//      393x659 and desktop, switch off and on, hero and full-screen;
//  11. the same component in both places: the same parts at the same sizes at
//      393x659, in sign-up and in the editor;
//  12. a sign-up crop is framed == shown on public 402x874, 393x659, 375x553;
//  13. New photo inside the editor, and Change photo on the step, land a new
//      pick in the editor with the switch off and the frame reset.
//
// Built like spec 62 (onboarding, mocked) and spec 101 (ruler picture, captured
// writes). Battery account; reads patched; EVERY write is captured and fulfilled
// in tests/helpers/hero-window-harness.ts — no real hero save, no real sign-up,
// and `ai-enhance` / `create-checkout-session` are trapped, never sent.
import { test, expect, type Page } from './fixtures';
import { PINNED_TEST_USER_ID } from './helpers/auth';
import { translations } from '../src/hooks/useLanguage';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '../src/lib/device-presets';
import { HERO_BOX_ASPECTS, heroDisplayRegion } from '../src/lib/hero-window';
import { pictureFitSeed } from '../src/lib/picture-fit';
import { readHeroEnhance, writeHeroEnhance } from '../src/lib/hero-enhance';
import { isIdentity } from '../src/lib/auto-enhance';
import { HERO_MAX_PX } from '../src/lib/crop';
import {
  AVATARS, FRAME, SRC, DIM,
  installEditor, installOnboarding, newEditorHarness, openEditor, openPublic, heroDialog, pickHeroFile,
  toOnboardingStepTwo, openOnboardingCrop,
  rulerPng, decodeRuler, pct, expectWin,
  cropperStill, cropFrameShape, zoomAndDrag, heroSettled, shownInSource, framedInCropper,
  objectPath, dimPng, pictureLook,
  photoEditorReady, editorZoom, editorOk, editorNewPhoto, enhanceRow, enhanceSwitch, enhanceStrength,
  editorShows, setRange, cropperPicture, winDrift, holdPhoto, checkerGif,
  measurePicture, scratchBake, worstBlock, lumOf, worstMean, regionFor, CROPPER_IMG,
  readEditorLayout, expectEditorFits,
  type OnboardingHarness, type Region, type StoredFile, type Style, type Win, type Measured,
} from './helpers/hero-window-harness';

const EN = translations.en as Record<string, string>;
const RULER = { name: 'ruler.png', mimeType: 'image/png', buffer: rulerPng() };
const frameAspect = (style: Style) => (style === 'hero' ? canonicalHeroAspect() : canonicalFullBleedAspect());
const isDesktop = (name: string) => name === 'desktop';

/** The photo editor (the one overlay holding the cropper). */
const cropModal = heroDialog;

type OnbCrop = {
  h: OnboardingHarness;
  scope: Awaited<ReturnType<typeof toOnboardingStepTwo>>;
  framed: Win;
  shape: number;
  region: Region & { fileW: number; fileH: number };
  displayPath: string;
};

/** Onboarding to step 2 → pick the ruler → the photo editor → zoom 1.5, off-centre → OK. */
async function onboardingCrop(page: Page, style: Style, desktop: boolean, failOriginal = false): Promise<OnbCrop> {
  if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  const h = await installOnboarding(page);
  h.failOriginal = failOriginal;
  const scope = await toOnboardingStepTwo(page, style, desktop, EN);
  await openOnboardingCrop(page, scope, RULER);
  const shape = await cropFrameShape(page);
  const framed = await zoomAndDrag(page, editorZoom(page), 1.5, 40, -60);
  await editorOk(page).click();
  await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(cropModal(page), 'the editor closed').toHaveCount(0);
  // The display copy starts uploading the moment the crop is accepted.
  await expect.poll(() => h.uploads.filter((u) => !u.path.includes('-original.')).length, {
    timeout: 60_000, message: 'the display copy upload was captured',
  }).toBe(1);
  const displayPath = h.uploads.find((u) => !u.path.includes('-original.'))!.path;
  const region = await decodeRuler(page, h.files.get(displayPath)!);
  return { h, scope, framed, shape, region, displayPath };
}

/** Step 2's Continue, then step 3's: the `pages` insert, captured. */
async function finishToInsert(page: Page, c: Pick<OnbCrop, 'h' | 'scope'>, uploads: number) {
  await expect.poll(() => c.h.uploads.length, { timeout: 60_000, message: 'the pick-time uploads landed' }).toBe(uploads);
  await page.getByTestId('onb-continue').click();
  // Step 2 has left (its Continue is the only one with this test id) and step 3 is up.
  await expect(page.getByTestId('onb-continue')).toHaveCount(0, { timeout: 60_000 });
  const next = c.scope.getByRole('button', { name: EN['onboardingFlow.continue'], exact: true });
  await expect(next).toBeVisible({ timeout: 30_000 });
  await next.click();
  await expect.poll(() => c.h.pageInserts.length, { timeout: 60_000, message: 'the pages insert was captured' }).toBe(1);
  return c.h.pageInserts[0];
}

const heroConfigOf = (insert: Record<string, unknown>) =>
  ((insert.theme_json as Record<string, unknown>).heroConfig ?? null) as Record<string, unknown> | null;

/** The region heroDisplayRegion gives for a framed window (percent of the ruler). */
function wantedRegion(framed: Win, style: Style) {
  const framedPx = {
    x: (framed.x / 100) * SRC.width, y: (framed.y / 100) * SRC.height,
    width: (framed.w / 100) * SRC.width, height: (framed.h / 100) * SRC.height,
  };
  const want = heroDisplayRegion(framedPx, SRC, HERO_BOX_ASPECTS[style])!;
  expect(want, 'the framed rectangle resolves').toBeTruthy();
  return want.region;
}

/** A stored window (over the display file) mapped back to percent of the ruler. */
function windowThroughFile(windowJson: unknown, style: Style, region: Region): Win {
  const over = pictureFitSeed(windowJson, frameAspect(style)).crop;
  expect(over, 'the stored window reads back as a window').toBeTruthy();
  const W = region.x1 - region.x0, H = region.y1 - region.y0;
  return pct({
    x0: region.x0 + (over!.x / 100) * W, x1: region.x0 + ((over!.x + over!.w) / 100) * W,
    y0: region.y0 + (over!.y / 100) * H, y1: region.y0 + ((over!.y + over!.h) / 100) * H,
  });
}

/** The zoom-1 centred window of the ruler in a frame of this style (percent of the picture). */
function centredWindow(style: Style): Win {
  const picture = SRC.width / SRC.height, frame = frameAspect(style);
  if (frame >= picture) {
    const h = (100 * picture) / frame;
    return { x: 0, y: (100 - h) / 2, w: 100, h };
  }
  const w = (100 * frame) / picture;
  return { x: (100 - w) / 2, y: 0, w, h: 100 };
}

// ── PHOTO.POLISH.2 / PHOTO.EDITOR.1: Auto enhance in the photo editor ─────────
const DIM_FILE = () => ({ name: 'dim.png', mimeType: 'image/png', buffer: dimPng() });
const DIM_SOURCE: StoredFile = { body: dimPng(), type: 'image/png' };

/**
 * A wizard run that starts clean IN THIS PAGE (a test may make two, to compare
 * them): the previous run's routes and its saved wizard state are dropped, then
 * the wizard is driven to step 2.
 */
async function freshStepTwo(page: Page, desktop: boolean, viewport?: { width: number; height: number }, style: Style = 'hero') {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.evaluate(() => { try { window.sessionStorage.clear(); } catch { /* no storage on this document */ } }).catch(() => {});
  if (viewport) await page.setViewportSize(viewport);
  else if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  const h = await installOnboarding(page);
  const scope = await toOnboardingStepTwo(page, style, desktop, EN);
  return { h, scope };
}

type EnhanceFlow = {
  h: OnboardingHarness;
  display: StoredFile; original: StoredFile; displayPath: string;
  insert: Record<string, unknown>;
  framed: Win;
  region: { x: number; y: number; width: number; height: number };
  /** The framed region of the cropper's picture, measured when OK was pressed. */
  shown: Measured;
};

/** Step 2 → pick the dim picture → (switch on, strength 50) → zoom 1.5, off-centre → OK → the page insert. */
async function enhanceFlow(page: Page, desktop: boolean, on: boolean): Promise<EnhanceFlow> {
  const { h, scope } = await freshStepTwo(page, desktop);
  await scope.locator('input[type="file"]').setInputFiles(DIM_FILE());
  await photoEditorReady(page);
  await expect(enhanceRow(page)).toBeVisible({ timeout: 15_000 });
  await expect(enhanceRow(page), 'the row is labelled Auto enhance').toContainText(EN['editor.hero.autoEnhance']);
  await expect(enhanceSwitch(page), 'the switch starts off').toHaveAttribute('aria-checked', 'false');
  await expect(enhanceStrength(page), 'no slider while off').toHaveCount(0);
  await editorShows(page, 'off');
  const source = await cropperPicture(page);
  expect(source.src.startsWith('data:'), 'switch off: the cropper holds the pick itself').toBe(true);
  const offLook = await measurePicture(page, CROPPER_IMG);
  if (on) {
    await enhanceSwitch(page).click();
    await expect(enhanceSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(enhanceStrength(page), 'the slider starts at 100').toHaveValue('100');
    await expect(cropModal(page).getByText(EN['editor.hero.holdToCompare'], { exact: true })).toBeVisible();
    await editorShows(page, 'on');
    const full = await cropperPicture(page);
    expect(full.src, 'the enhanced copy is another picture').not.toBe(source.src);
    expect(Math.max(full.w, full.h), 'the enhanced copy is at most 1600 px on its long side').toBeLessThanOrEqual(1600);
    const fullLook = await measurePicture(page, CROPPER_IMG);
    expect(lumOf(fullLook), `the editor is brighter with the switch on (${lumOf(fullLook).toFixed(1)} vs ${lumOf(offLook).toFixed(1)})`).toBeGreaterThan(lumOf(offLook) + 8);
    await setRange(enhanceStrength(page), 50);
    await expect.poll(async () => (await cropperPicture(page)).src !== full.src, { timeout: 15_000, message: 'the enhanced copy was re-made at 50' }).toBe(true);
    await editorShows(page, 'on');
    const half = await cropperPicture(page);
    // Hold shows the source; release returns.
    await holdPhoto(page);
    await editorShows(page, 'original');
    expect((await cropperPicture(page)).src, 'held: the pick itself').toBe(source.src);
    await page.mouse.up();
    await editorShows(page, 'on');
    expect((await cropperPicture(page)).src, 'released: the enhanced copy is back').toBe(half.src);
  }
  const framed = await zoomAndDrag(page, editorZoom(page), 1.5, 40, -60);
  const want = regionFor(framed, DIM, 'hero');
  const cut: Win = {
    x: (100 * want.region.x) / DIM.width, y: (100 * want.region.y) / DIM.height,
    w: (100 * want.region.width) / DIM.width, h: (100 * want.region.height) / DIM.height,
  };
  const shown = await measurePicture(page, CROPPER_IMG, cut);
  await editorOk(page).click();
  await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => h.uploads.length, { timeout: 60_000, message: 'both copies uploaded' }).toBe(2);
  const displayPath = h.uploads.find((u) => !u.path.includes('-original.'))!.path;
  const originalPath = h.uploads.find((u) => u.path.includes('-original.'))!.path;
  const insert = await finishToInsert(page, { h, scope }, 2);
  expect(objectPath(insert.avatar_url as string), 'the row points at the display upload').toBe(displayPath);
  expect(objectPath(insert.avatar_original_url as string), 'and at the kept original').toBe(originalPath);
  expect(h.aiCalls, 'nothing reached ai-enhance').toEqual([]);
  return { h, display: h.files.get(displayPath)!, original: h.files.get(originalPath)!, displayPath, insert, framed, region: want.region, shown };
}

test.describe('HERO.FIT.3 — onboarding uses the hero window; the editor crop step is manual', () => {
  // A crop on the mobile project (WebKit at 3×) is slow, not flaky.
  test.setTimeout(300_000);

  for (const style of ['hero', 'full_bleed'] as Style[]) {
    test(`1. onboarding crop · ${style}: the frame is the page's shape, the upload is the region, the preview shows what was framed`, async ({ page }, testInfo) => {
      const desktop = isDesktop(testInfo.project.name);
      const c = await onboardingCrop(page, style, desktop);

      // The frame is the shape the page shows the photo in — not a square, and no chips.
      expect(Math.abs(c.shape / frameAspect(style) - 1), `the crop frame is ${c.shape.toFixed(4)}, the ${style} shape is ${frameAspect(style).toFixed(4)}`).toBeLessThan(0.01);
      expect((c.framed.w * SRC.width) / (c.framed.h * SRC.height), 'the framed window has that shape too').toBeCloseTo(frameAspect(style), 2);
      // Zoom 1.5, off-centre: a real crop, not the cover window.
      expect(c.framed.w, 'zoomed in').toBeLessThan(100 / 1.4);
      expect(Math.abs(c.framed.x + c.framed.w / 2 - 50), 'off-centre').toBeGreaterThan(1);

      // The display upload is the region: more than what was framed, less than the picture.
      const want = wantedRegion(c.framed, style);
      const held = pct(c.region);
      expectWin(held, pct({ x0: want.x, x1: want.x + want.width, y0: want.y, y1: want.y + want.height }), 'the display file');
      expect(held.w * held.h, 'the file holds more than the framed rectangle').toBeGreaterThan(c.framed.w * c.framed.h * 1.05);
      expect(held.w * held.h, 'the file is not the whole picture').toBeLessThan(100 * 100 * 0.9);

      // The phone preview (a ≥lg surface) shows exactly the framed window.
      if (desktop) {
        const shown = await heroSettled(page, style, FRAME, 'data:');
        expect(shown.box.w / shown.box.h, 'the preview box is the crop frame\'s shape').toBeCloseTo(frameAspect(style), 2);
        expectWin(shownInSource(shown, c.region), c.framed, 'the phone preview == framed');
      }
      expect(c.h.aiCalls, 'nothing reached ai-enhance').toEqual([]);
      expect(c.h.pageInserts, 'cropping inserts nothing').toHaveLength(0);
    });
  }

  test('2. the page insert carries heroConfig: fill, centred, window, and windowSource when the original uploaded', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const c = await onboardingCrop(page, 'hero', desktop);
    const insert = await finishToInsert(page, c, 2);
    const cfg = heroConfigOf(insert)!;
    expect(cfg, 'the insert carries heroConfig').toBeTruthy();
    expect(cfg.fit).toBe('fill');
    expect(cfg.posX).toBe(50);
    expect(cfg.posY).toBe(50);
    expect(Object.keys(cfg).sort(), 'nothing else rides in the hero config').toEqual(['fit', 'posX', 'posY', 'window', 'windowSource']);
    // window: the framed window, over the display file that was uploaded.
    expectWin(windowThroughFile(cfg.window, 'hero', c.region), c.framed, 'window, through the display file, == framed');
    // windowSource: the same framed window, over the kept original.
    const overOriginal = pictureFitSeed(cfg.windowSource, frameAspect('hero')).crop;
    expect(overOriginal, 'windowSource reads back as a window').toBeTruthy();
    expectWin(overOriginal!, c.framed, 'windowSource == framed');
    // The row points at the two uploads this session made, never a data: URL.
    expect(objectPath(insert.avatar_url as string), 'avatar_url is the display upload').toBe(c.displayPath);
    expect(insert.avatar_original_url as string, 'avatar_original_url is the kept original').toContain('-original.');
    expect(c.h.aiCalls).toEqual([]);
  });

  test('2b. when the original does not upload, the insert carries the window alone', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const c = await onboardingCrop(page, 'hero', desktop, true);
    const insert = await finishToInsert(page, c, 1);
    const cfg = heroConfigOf(insert)!;
    expect(cfg, 'the insert carries heroConfig').toBeTruthy();
    expect(Object.keys(cfg).sort(), 'no windowSource without a kept original').toEqual(['fit', 'posX', 'posY', 'window']);
    expectWin(windowThroughFile(cfg.window, 'hero', c.region), c.framed, 'window, through the display file, == framed');
    expect(insert.avatar_original_url, 'no original on the row').toBeNull();
  });

  for (const style of ['hero', 'full_bleed'] as Style[]) {
    test(`3. OK straight after a pick · ${style}: the upload is the region for the zoom-1 centred area; the insert carries the window and windowSource`, async ({ page }, testInfo) => {
      const desktop = isDesktop(testInfo.project.name);
      const { h, scope } = await freshStepTwo(page, desktop, undefined, style);
      await openOnboardingCrop(page, scope, RULER);
      await expect(editorZoom(page), 'the editor opens at zoom 1').toHaveValue('1');
      const centred = centredWindow(style);
      const framed = await framedInCropper(page);
      expectWin(framed, centred, 'the editor opens on the zoom-1 centred window');
      await editorOk(page).click();
      await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(cropModal(page)).toHaveCount(0);
      const insert = await finishToInsert(page, { h, scope }, 2);
      const cfg = heroConfigOf(insert)!;
      expect(cfg, 'the insert carries heroConfig').toBeTruthy();
      expect(Object.keys(cfg).sort(), 'Fill, centred, the window and windowSource').toEqual(['fit', 'posX', 'posY', 'window', 'windowSource']);
      expect([cfg.fit, cfg.posX, cfg.posY]).toEqual(['fill', 50, 50]);
      // The display copy on the row is the region for the centred area.
      const display = h.files.get(objectPath(insert.avatar_url as string))!;
      expect(display, 'the row points at an upload this session made').toBeTruthy();
      const held = await decodeRuler(page, display);
      const want = wantedRegion(framed, style);
      expectWin(pct(held), pct({ x0: want.x, x1: want.x + want.width, y0: want.y, y1: want.y + want.height }), 'the display file is the region for the centred area');
      expectWin(windowThroughFile(cfg.window, style, held), centred, 'window, through the display file, == the centred area');
      expectWin(pictureFitSeed(cfg.windowSource, frameAspect(style)).crop!, centred, 'windowSource == the centred area');
      // Baked through the one hero output path: the hero cap on the long side, WebP.
      expect(HERO_MAX_PX, 'control: the hero cap').toBe(2500);
      expect(Math.max(held.fileW, held.fileH), 'never over the hero cap').toBeLessThanOrEqual(HERO_MAX_PX);
      const scale = Math.min(1, HERO_MAX_PX / Math.max(want.width, want.height));
      expect(Math.abs(held.fileW - want.width * scale), 'the region at the cap: width').toBeLessThanOrEqual(2);
      expect(Math.abs(held.fileH - want.height * scale), 'the region at the cap: height').toBeLessThanOrEqual(2);
      expect(display.type, 'encoded as every hero file is').toBe('image/webp');
      expect(readHeroEnhance(cfg), 'the switch was never touched: no enhancement').toBeNull();
      if (desktop) {
        const shown = await heroSettled(page, style, FRAME, 'data:');
        expectWin(shownInSource(shown, held), centred, 'the phone preview == the centred area');
      }
      expect(h.aiCalls).toEqual([]);
    });
  }

  for (const lang of ['en', 'es'] as const) {
    test(`5. a pick opens the photo editor directly · ${lang}: no Use Image, Crop Image, Use Original, Back or Apply Crop`, async ({ page }, testInfo) => {
      const desktop = isDesktop(testInfo.project.name);
      const T = translations[lang] as Record<string, string>;
      await page.addInitScript((l) => { try { window.localStorage.setItem('titilinks-language', l); } catch { /* storage disabled */ } }, lang);
      // The app syncs a chosen language to the profile: answered here, never sent.
      await page.route('**/rest/v1/rpc/set_my_language*', (route) => route.fulfill({ status: 204, body: '' }));
      if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
      const h = await installOnboarding(page);
      const scope = await toOnboardingStepTwo(page, 'hero', desktop, T);
      await scope.locator('input[type="file"]').setInputFiles(RULER);
      // ONE screen, straight away: the cropper is up with no step in between.
      await photoEditorReady(page);
      const dlg = cropModal(page);
      await expect(dlg).toHaveCount(1);
      await expect(dlg.getByText(T['editor.editPhoto'], { exact: true }), 'the header').toBeVisible();
      await expect(dlg.getByText(T['editor.crop.zoom'], { exact: true }), 'the Zoom row').toBeVisible();
      await expect(editorNewPhoto(page)).toHaveText(T['editor.hero.newPhoto']);
      await expect(editorOk(page)).toHaveText(T['editor.hero.ok']);
      await expect(dlg.getByText(T['editor.hero.autoEnhance'], { exact: true }), 'the Auto enhance row').toBeVisible();
      await expect(dlg.getByRole('button'), 'three buttons: X, New photo, OK').toHaveCount(3);
      await expect(dlg.locator('input[type=range]'), 'one slider: zoom').toHaveCount(1);
      await expect(dlg.getByRole('switch'), 'the switch starts off').toHaveAttribute('aria-checked', 'false');
      // The labels of what is gone, as literals in both languages (their keys are gone with them).
      const GONE = [
        'Use Image', 'Crop Image', 'Use Original', 'Back', 'Apply Crop', 'Fill', 'Fit', 'Save', 'Zoom: 1.0x',
        'Usar imagen', 'Recortar imagen', 'Recortar Imagen', 'Usar original', 'Atrás', 'Aplicar recorte', 'Rellenar', 'Ajustar', 'Guardar',
      ];
      for (const label of GONE) {
        await expect(dlg.getByText(label, { exact: true }), `no "${label}"`).toHaveCount(0);
      }
      // The old modals and their ids are gone from the page altogether.
      for (const id of ['onb-photo-preview', 'onb-enhance-row', 'onb-enhance-switch']) {
        await expect(page.getByTestId(id), `no ${id}`).toHaveCount(0);
      }
      for (const label of ['Use Original', 'Usar original', 'Crop Image', 'Recortar imagen', 'Apply Crop', 'Aplicar recorte']) {
        await expect(page.getByRole('button', { name: label, exact: true }), `no "${label}" button on the page`).toHaveCount(0);
      }
      expect(h.uploads, 'opening the editor uploads nothing').toHaveLength(0);
      // X closes it and keeps nothing.
      await dlg.getByRole('button', { name: T['editor.cancel'], exact: true }).click();
      await expect(dlg).toHaveCount(0);
      await expect(scope.getByText(T['onboardingFlow.uploadPhoto'], { exact: true }), 'no photo was kept').toBeVisible();
      await page.waitForTimeout(800);
      expect(h.uploads, 'X uploads nothing').toHaveLength(0);
    });
  }

  /** Step 4 → Back → step 3 (→ Back → step 2 when asked). */
  async function backFromStepFour(page: Page, scope: OnbCrop['scope'], to: 3 | 2) {
    await expect(scope.getByRole('heading', { name: EN['onboardingFlow.yourSocialPlatforms'], exact: true })).toBeVisible({ timeout: 60_000 });
    await scope.getByRole('button', { name: EN['onboardingFlow.back'], exact: true }).click();
    await expect(scope.getByRole('heading', { name: 'Choose Your Vibe', exact: true })).toBeVisible({ timeout: 30_000 });
    if (to === 3) return;
    await scope.getByRole('button', { name: EN['onboardingFlow.back'], exact: true }).click();
    await expect(page.getByTestId('onb-continue')).toBeVisible({ timeout: 30_000 });
  }

  test('6. Back to step 2 on a page this run created: the new photo, its original and its window travel in ONE update', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const c = await onboardingCrop(page, 'hero', desktop);
    const insert = await finishToInsert(page, c, 2);
    await backFromStepFour(page, c.scope, 2);

    // A new photo, cropped differently.
    await openOnboardingCrop(page, c.scope, RULER);
    const framed = await zoomAndDrag(page, editorZoom(page), 2, -50, 50);
    expect(Math.abs(framed.x - c.framed.x) + Math.abs(framed.w - c.framed.w), 'control: the second crop is not the first').toBeGreaterThan(3);
    await editorOk(page).click();
    await expect(c.scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => c.h.uploads.length, { timeout: 60_000, message: 'the second pick uploaded both copies' }).toBe(4);
    const displayPath = c.h.uploads.filter((u) => !u.path.includes('-original.'))[1].path;
    const originalPath = c.h.uploads.filter((u) => u.path.includes('-original.'))[1].path;
    const region = await decodeRuler(page, c.h.files.get(displayPath)!);

    // Forward again: step 2 → step 3 → Continue.
    await page.getByTestId('onb-continue').click();
    await expect(page.getByTestId('onb-continue')).toHaveCount(0, { timeout: 60_000 });
    await c.scope.getByRole('button', { name: EN['onboardingFlow.continue'], exact: true }).click();
    await expect.poll(() => c.h.pageUpdates.length, { timeout: 60_000, message: 'the pages update was captured' }).toBe(1);
    await expect(c.scope.getByRole('heading', { name: EN['onboardingFlow.yourSocialPlatforms'], exact: true })).toBeVisible({ timeout: 60_000 });
    expect(c.h.pageUpdates, 'ONE pages update').toHaveLength(1);
    expect(c.h.pageInserts, 'no second insert').toHaveLength(1);

    const upd = c.h.pageUpdates[0];
    expect(Object.keys(upd).sort(), 'the file, its original and the theme ride together').toEqual(['avatar_original_url', 'avatar_url', 'theme_json']);
    expect(objectPath(upd.avatar_url as string), 'avatar_url is the NEW display upload').toBe(displayPath);
    expect(upd.avatar_url, 'not the first photo').not.toBe(insert.avatar_url);
    expect(objectPath(upd.avatar_original_url as string), 'avatar_original_url is the NEW original').toBe(originalPath);
    expect(String(upd.avatar_url).startsWith('data:'), 'never a data: URL').toBe(false);
    const cfg = heroConfigOf(upd)!;
    expect(cfg, 'the update carries heroConfig').toBeTruthy();
    expect(Object.keys(cfg).sort()).toEqual(['fit', 'posX', 'posY', 'window', 'windowSource']);
    // The window was made for THIS file: through it, it is exactly what was framed.
    expectWin(windowThroughFile(cfg.window, 'hero', region), framed, 'window, through the new display file, == the new framing');
    expectWin(pictureFitSeed(cfg.windowSource, frameAspect('hero')).crop!, framed, 'windowSource == the new framing');
    expect(c.h.aiCalls).toEqual([]);
  });

  test('6b. the same update with no uploaded URL carries no window and no avatar_url', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const c = await onboardingCrop(page, 'hero', desktop);
    await finishToInsert(page, c, 2);
    await backFromStepFour(page, c.scope, 3);

    // A resumed session that lost its upload URL: the window is still in the
    // wizard's state, the URL is not. (The harness clears sessionStorage on the
    // first load only, so the reload resumes on step 3.)
    const kept = await page.evaluate(() => {
      const key = Object.keys(window.sessionStorage).find((k) => k.startsWith('onboarding:'))!;
      const s = JSON.parse(window.sessionStorage.getItem(key)!);
      s.avatarUploadedUrl = null;
      window.sessionStorage.setItem(key, JSON.stringify(s));
      return { window: !!s.avatarWindow, created: s.pageCreatedInWizard, step: s.currentStep };
    });
    expect(kept, 'control: a window in state, on a page this run created, at step 3').toEqual({ window: true, created: true, step: 3 });
    await page.reload();
    await expect(c.scope.getByRole('heading', { name: 'Choose Your Vibe', exact: true })).toBeVisible({ timeout: 60_000 });
    await c.scope.getByRole('button', { name: EN['onboardingFlow.continue'], exact: true }).click();
    await expect.poll(() => c.h.pageUpdates.length, { timeout: 60_000, message: 'the pages update was captured' }).toBe(1);
    await expect(c.scope.getByRole('heading', { name: EN['onboardingFlow.yourSocialPlatforms'], exact: true })).toBeVisible({ timeout: 60_000 });
    expect(c.h.pageUpdates).toHaveLength(1);

    const upd = c.h.pageUpdates[0];
    expect(Object.keys(upd), 'the theme alone: neither photo column is touched').toEqual(['theme_json']);
    const cfg = heroConfigOf(upd);
    expect(cfg?.window, 'no window').toBeUndefined();
    expect(cfg?.windowSource, 'no windowSource').toBeUndefined();
    expect(c.h.aiCalls).toEqual([]);
  });

  test('7. Auto enhance at 50, OK: hold shows the source; a brighter display file, the same original, and enhance 0.5 beside the window', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const off = await enhanceFlow(page, desktop, false);
    const on = await enhanceFlow(page, desktop, true);

    // Switch off: the window config, key for key, and no enhancement.
    const offCfg = heroConfigOf(off.insert)!;
    expect(Object.keys(offCfg).sort(), 'switch off: the window config alone').toEqual(['fit', 'posX', 'posY', 'window', 'windowSource']);
    expect(readHeroEnhance(offCfg), 'switch off: no enhancement').toBeNull();

    // Switch on: the same window config with the enhancement beside it.
    const cfg = heroConfigOf(on.insert)!;
    const stored = readHeroEnhance(cfg);
    expect(stored, 'heroConfig carries the enhancement').toBeTruthy();
    expect(stored!.strength, 'baked at the strength the slider showed').toBe(0.5);
    expect(isIdentity(stored!.params), 'the dim picture has something to enhance').toBe(false);
    const rest = writeHeroEnhance(cfg, null);
    expect(Object.keys(rest).sort(), 'the window config rides with it').toEqual(['fit', 'posX', 'posY', 'window', 'windowSource']);
    expect(rest.fit).toBe('fill');
    expect(pictureFitSeed(rest.window, frameAspect('hero')).crop, 'the window reads back as a window').toBeTruthy();
    expectWin(pictureFitSeed(rest.windowSource, frameAspect('hero')).crop!, on.framed, 'windowSource == framed');

    // The kept original is the same bytes either way: it is never enhanced.
    expect(on.original.body.equals(off.original.body), 'the kept original is byte-identical with the switch on and off').toBe(true);

    // The display file: a cut of the picture (the same cut both times), brighter with the switch on.
    const plain = await measurePicture(page, off.display);
    const bright = await measurePicture(page, on.display);
    expect(plain.w * plain.h, 'a cut, not the whole picture').toBeLessThan(DIM.width * DIM.height * 0.9);
    expect(Math.abs(bright.w - plain.w), 'the same cut: width').toBeLessThanOrEqual(8);
    expect(Math.abs(bright.h - plain.h), 'the same cut: height').toBeLessThanOrEqual(8);
    expect(lumOf(bright), `enhanced ${lumOf(bright).toFixed(1)} vs plain ${lumOf(plain).toFixed(1)}`).toBeGreaterThan(lumOf(plain) + 3);
    expect(on.display.type).toBe('image/webp');

    // The upload is a from-scratch bake of the region with the stored params…
    const scratch = await scratchBake(page, DIM_SOURCE, on.region, { w: bright.w, h: bright.h }, stored);
    expect(worstBlock(bright, scratch), 'the upload == a from-scratch bake with the stored params (levels per channel)').toBeLessThan(2);
    const scratchPlain = await scratchBake(page, DIM_SOURCE, off.region, { w: plain.w, h: plain.h }, null);
    expect(worstBlock(plain, scratchPlain), 'control: the switch-off upload == the plain bake').toBeLessThan(2);
    // …and what the editor showed over that region is what was baked.
    expect(worstMean(on.shown, bright), 'the editor showed what was baked').toBeLessThan(3);
    expect(worstMean(off.shown, plain), 'control: off, the editor showed the picture as it is').toBeLessThan(3);

    // The phone preview (a ≥lg surface) is showing the enhanced file.
    if (desktop) {
      await heroSettled(page, 'hero', FRAME, 'data:');
      const shown = await pictureLook(page, `${FRAME} [data-testid="hero-sticky"] [data-hero-framing] img`);
      expect(Math.abs(shown.lum - lumOf(bright)), 'the phone preview shows the enhanced display copy').toBeLessThan(3);
    }
  });

  test('8. the switch, the strength slider and a hold never move the framed area', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const { h, scope } = await freshStepTwo(page, desktop);
    await scope.locator('input[type="file"]').setInputFiles(DIM_FILE());
    await photoEditorReady(page);
    const framed = await zoomAndDrag(page, editorZoom(page), 1.8, 25, -35);
    const still = async (what: string) =>
      expect(winDrift(await framedInCropper(page), framed), `${what}: the framed area moved (percent of the picture)`).toBeLessThan(0.2);

    await enhanceSwitch(page).click();
    await editorShows(page, 'on');
    await still('switch on');
    await setRange(enhanceStrength(page), 30);
    await editorShows(page, 'on');
    await page.waitForTimeout(600);
    await still('strength 30');
    await holdPhoto(page);
    await editorShows(page, 'original');
    await still('held');
    await page.mouse.up();
    await editorShows(page, 'on');
    await still('released');
    await enhanceSwitch(page).click();
    await editorShows(page, 'off');
    await still('switch off');
    await enhanceSwitch(page).click();
    await editorShows(page, 'on');
    await still('switch on again');
    await expect(editorZoom(page), 'the zoom is where it was left').toHaveValue('1.8');
    expect(h.uploads, 'looking uploads nothing').toHaveLength(0);
  });

  test('9. a GIF: no drag, no Auto enhance row, one caption — and it is kept as picked', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const { h, scope } = await freshStepTwo(page, desktop);
    const gif = checkerGif(120, 180);
    await scope.locator('input[type="file"]').setInputFiles({ name: 'checker.gif', mimeType: 'image/gif', buffer: gif });
    await photoEditorReady(page);
    await expect(enhanceRow(page), 'no row for a GIF').toHaveCount(0);
    await expect(enhanceSwitch(page)).toHaveCount(0);
    await expect(cropModal(page).getByText(EN['editor.hero.gifNoCrop'], { exact: true }), 'the caption').toBeVisible();
    await expect(editorZoom(page), 'the zoom slider is disabled').toBeDisabled();
    const framed = await framedInCropper(page);
    const box = (await page.locator('.reactEasyCrop_CropArea').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 6 });
    await page.waitForTimeout(600);
    await page.mouse.up();
    expect(winDrift(await framedInCropper(page), framed), 'a GIF does not drag').toBe(0);
    await editorOk(page).click();
    await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => h.uploads.length, { timeout: 60_000 }).toBe(2);
    for (const u of h.uploads) {
      expect(u.type, `${u.path} is uploaded as a GIF`).toBe('image/gif');
      expect(h.files.get(u.path)!.body.equals(gif), `${u.path} is the GIF as picked`).toBe(true);
    }
    const insert = await finishToInsert(page, { h, scope }, 2);
    expect(heroConfigOf(insert), 'no heroConfig for a GIF').toBeNull();
  });

  for (const style of ['hero', 'full_bleed'] as Style[]) {
    test(`10. the editor fits · ${style}: every control on screen with no scrolling, switch off and on`, async ({ page }, testInfo) => {
      const desktopProject = isDesktop(testInfo.project.name);
      const labels = { title: EN['editor.editPhoto'], caption: EN['editor.hero.holdToCompare'] };
      const sizes = [
        { width: 375, height: 553, wide: false },
        { width: 393, height: 659, wide: false },
        // The wizard's desktop layout is a Chromium-project surface.
        ...(desktopProject ? [{ width: 1440, height: 900, wide: true }] : []),
      ];
      for (const size of sizes) {
        const { scope } = await freshStepTwo(page, size.wide, { width: size.width, height: size.height }, style);
        await scope.locator('input[type="file"]').setInputFiles(DIM_FILE());
        await photoEditorReady(page);
        await editorShows(page, 'off');
        for (const on of [false, true]) {
          if (on) {
            await enhanceSwitch(page).click();
            await editorShows(page, 'on');
          }
          const at = `${style} ${size.width}x${size.height}, switch ${on ? 'on' : 'off'}`;
          const m = await readEditorLayout(page, labels);
          expect([m.vw, m.vh], `${at}: the viewport`).toEqual([size.width, size.height]);
          expectEditorFits(m, at, on);
          const shape = m.parts.frame!.width / m.parts.frame!.height;
          expect(Math.abs(shape / frameAspect(style) - 1), `${at}: the frame is the ${style} shape`).toBeLessThan(0.01);
        }
      }
    });
  }

  test('11. the same component in both places: the same parts at the same sizes at 393x659', async ({ page }) => {
    const labels = { title: EN['editor.editPhoto'], caption: EN['editor.hero.holdToCompare'] };
    const vp = { width: 393, height: 659 };
    const read = async () => {
      const layouts = [];
      await editorShows(page, 'off');
      layouts.push(await readEditorLayout(page, labels));
      await enhanceSwitch(page).click();
      await editorShows(page, 'on');
      layouts.push(await readEditorLayout(page, labels));
      return layouts;
    };
    // Sign-up.
    const { scope } = await freshStepTwo(page, false, vp);
    await scope.locator('input[type="file"]').setInputFiles(DIM_FILE());
    await photoEditorReady(page);
    const signup = await read();
    const signupIds = await cropModal(page).locator('[data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());

    // The editor.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = newEditorHarness('hero', { fit: 'fill', posY: 25 });
    const placard = `${PINNED_TEST_USER_ID}/herofit3/before.png`;
    h.files.set(placard, { body: dimPng(), type: 'image/png' });
    h.avatarUrl = `${AVATARS}${placard}`;
    await installEditor(page, h);
    await openEditor(page);
    await pickHeroFile(page, DIM_FILE());
    await photoEditorReady(page);
    await page.setViewportSize(vp);
    const editor = await read();
    const editorIds = await cropModal(page).locator('[data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).sort());

    expect(editorIds, 'the same test ids in both places').toEqual(signupIds);
    for (const id of ['hero-editor-zoom', 'hero-editor-new-photo', 'hero-editor-ok', 'hero-enhance-row', 'hero-enhance-switch', 'hero-enhance-strength']) {
      expect(signupIds, `sign-up carries ${id}`).toContain(id);
    }
    for (const [i, state] of ['switch off', 'switch on'].entries()) {
      const a = signup[i], b = editor[i];
      expect([a.vw, a.vh, b.vw, b.vh], `${state}: both measured at 393x659`).toEqual([393, 659, 393, 659]);
      for (const name of Object.keys(a.parts)) {
        const pa = a.parts[name], pb = b.parts[name];
        expect(!!pa, `${state}: ${name} is in both or in neither`).toBe(!!pb);
        if (!pa || !pb) continue;
        for (const k of ['left', 'top', 'width', 'height'] as const) {
          expect(Math.abs(pa[k] - pb[k]), `${state}: ${name} ${k} — sign-up ${pa[k].toFixed(2)} vs editor ${pb[k].toFixed(2)}`).toBeLessThan(0.5);
        }
      }
    }
    expect(h.patches, 'looking writes nothing').toHaveLength(0);
  });

  test('12. a sign-up crop is framed == shown on public 402x874, 393x659 and 375x553', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const c = await onboardingCrop(page, 'hero', desktop);
    const insert = await finishToInsert(page, c, 2);
    const cfg = heroConfigOf(insert)!;
    // The page sign-up made, served the way a visitor gets it: the row's file and its hero config.
    const displayPath = objectPath(insert.avatar_url as string);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const h = newEditorHarness('hero', cfg);
    h.files.set(displayPath, c.h.files.get(displayPath)!);
    h.avatarUrl = `${AVATARS}${displayPath}`;
    await installEditor(page, h);
    const name = displayPath.split('/').pop()!;
    await openPublic(page, { width: 402, height: 874 });
    expectWin(shownInSource(await heroSettled(page, 'hero', '', name), c.region), c.framed, 'public 402x874');
    for (const vp of [{ width: 393, height: 659 }, { width: 375, height: 553 }]) {
      await openPublic(page, vp);
      const s = await heroSettled(page, 'hero', '', name);
      const shown = shownInSource(s, c.region);
      // A wider box than the frame: the framed window is whole, only the sides gain picture.
      expect(shown.x, `${vp.width}x${vp.height}: framed left edge is shown`).toBeLessThan(c.framed.x + 0.5);
      expect(shown.x + shown.w, `${vp.width}x${vp.height}: framed right edge is shown`).toBeGreaterThan(c.framed.x + c.framed.w - 0.5);
      expect(Math.abs(shown.y - c.framed.y), `${vp.width}x${vp.height}: framed top`).toBeLessThan(0.5);
      expect(Math.abs(shown.h - c.framed.h), `${vp.width}x${vp.height}: framed height shown whole`).toBeLessThan(0.5);
    }
    expect(h.patches, 'looking at the page writes nothing').toHaveLength(0);
  });

  test('13. New photo inside the editor, and Change photo on the step: a new pick, the switch back to off, the frame reset', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const { h, scope } = await freshStepTwo(page, desktop);
    await scope.locator('input[type="file"]').setInputFiles(DIM_FILE());
    await photoEditorReady(page);
    await enhanceSwitch(page).click();
    await editorShows(page, 'on');
    await setRange(enhanceStrength(page), 40);
    const moved = await zoomAndDrag(page, editorZoom(page), 2, 30, -30);
    expect(moved.w, 'control: zoomed in on the first pick').toBeLessThan(60);

    const fresh = async (what: string) => {
      await expect.poll(async () => (await cropperPicture(page)).w, { timeout: 30_000, message: `${what}: the cropper holds the new pick` }).toBe(SRC.width);
      await photoEditorReady(page);
      await expect(cropModal(page), `${what}: ONE editor`).toHaveCount(1);
      await expect(enhanceSwitch(page), `${what}: the switch is off`).toHaveAttribute('aria-checked', 'false');
      await expect(enhanceStrength(page), `${what}: no slider while off`).toHaveCount(0);
      await editorShows(page, 'off');
      await expect(editorZoom(page), `${what}: the zoom is 1`).toHaveValue('1');
      expectWin(await framedInCropper(page), centredWindow('hero'), `${what}: the frame is the centred area of the new picture`);
    };
    // New photo: the gallery opens; the pick lands back in the same editor.
    let chooser = page.waitForEvent('filechooser');
    await editorNewPhoto(page).click();
    await (await chooser).setFiles(RULER);
    await fresh('New photo');
    expect(h.uploads, 'the first pick was never uploaded').toHaveLength(0);
    await editorOk(page).click();
    await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => h.uploads.length, { timeout: 60_000 }).toBe(2);
    const first = h.uploads.find((u) => !u.path.includes('-original.'))!;
    const held = await decodeRuler(page, h.files.get(first.path)!);
    const want = wantedRegion(centredWindow('hero'), 'hero');
    expectWin(pct(held), pct({ x0: want.x, x1: want.x + want.width, y0: want.y, y1: want.y + want.height }), 'the upload is cut from the new pick');

    // Change photo on the step: the gallery again, and the same editor.
    chooser = page.waitForEvent('filechooser');
    await scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true }).click();
    await (await chooser).setFiles(RULER);
    await fresh('Change photo');
    await cropModal(page).getByRole('button', { name: EN['editor.cancel'], exact: true }).click();
    await expect(cropModal(page)).toHaveCount(0);
    // X kept the photo the step already had.
    await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    expect(h.uploads, 'X uploads nothing more').toHaveLength(2);
    expect(h.aiCalls).toEqual([]);
  });

  // HERO.FIT.3c: the editor's photo editor is manual only — drag, zoom, New photo, OK.
  for (const style of ['hero', 'full_bleed'] as Style[]) {
    test(`4. editor photo editor · ${style}: zoom, New photo and OK only — no Auto frame, no face presets, nothing fetched from /models or ai-enhance`, async ({ page }) => {
      // Traps that fail the test: nothing may reach the face model's files.
      const modelRequests: string[] = [];
      page.on('request', (req) => { if (new URL(req.url()).pathname.includes('/models/')) modelRequests.push(req.url()); });
      await page.route(/\/models\//, (route) => route.abort());

      const h = newEditorHarness(style, { fit: 'fill', posY: 25 });
      const placard = `${PINNED_TEST_USER_ID}/herofit3/before.png`;
      h.files.set(placard, { body: rulerPng(), type: 'image/png' });
      h.avatarUrl = `${AVATARS}${placard}`;
      await installEditor(page, h);
      await openEditor(page);
      await pickHeroFile(page, RULER);
      await photoEditorReady(page);

      const dlg = heroDialog(page);
      await expect(editorZoom(page)).toBeVisible();
      await expect(editorNewPhoto(page)).toBeVisible();
      await expect(editorOk(page)).toBeVisible();
      await expect(page.getByTestId('crop-auto-frame'), 'no Auto frame button').toHaveCount(0);
      // PHOTO.POLISH.1: the labels are literals — their dictionary keys are gone with the buttons.
      for (const label of ['Headshot', 'Shoulders', 'Full Body', 'Auto frame']) {
        await expect(dlg.getByRole('button', { name: label }), `no ${label} button`).toHaveCount(0);
      }
      // Top to bottom: the zoom row, the Auto enhance row, then New photo / OK in one row.
      const m = await readEditorLayout(page, { title: EN['editor.editPhoto'], caption: EN['editor.hero.holdToCompare'] });
      expectEditorFits(m, `${style} editor`, false);
      // The frame the crop is made in is the page's own shape.
      expect(Math.abs((await cropFrameShape(page)) / frameAspect(style) - 1), `the frame is the ${style} shape`).toBeLessThan(0.01);

      // Leave the editor open a while: a preload would have fired on open.
      await cropperStill(page);
      await page.waitForTimeout(3_000);
      expect(modelRequests, 'no request went to /models/').toEqual([]);
      expect(h.aiCalls, 'no request went to ai-enhance').toEqual([]);
    });
  }
});

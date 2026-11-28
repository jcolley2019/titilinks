// HERO.FIT.3 — onboarding and the face buttons use the hero's window.
//
// HERO.FIT.2 made the editor's Apply Crop store a framed WINDOW over a display
// file that is the framed area plus margin. Two places still baked a file with
// no window: the onboarding crop (square by default, offering shapes the page
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
//   3. "Use Original" after a crop: the insert carries no `heroConfig`;
//   4. editor (HERO.FIT.3c: the crop step is manual only): on a hero page and
//      on a full-screen page the crop step shows the zoom slider, Back and Apply
//      Crop — no Auto frame and no Headshot / Shoulders / Full Body — and while
//      it is open nothing is fetched from /models/ and nothing reaches
//      `ai-enhance`;
//   6. HERO.FIT.3b: Back to step 2 on a page this run created, a new photo
//      cropped, forward again — ONE `pages` update carries the new avatar_url,
//      avatar_original_url and the window made for that file; with no uploaded
//      URL (6b) the update carries the theme alone, with no window.
//
// PHOTO.POLISH.2 — the sign-up photo step gets the Auto enhance switch (off by
// default), in the first photo modal:
//   7. switch on then Use Original: the display upload is brighter than the same
//      flow with the switch off, the original upload is byte-identical either
//      way, and the insert's heroConfig holds the enhancement ALONE (off: no
//      heroConfig at all);
//   8. switch on then Crop Image + Apply Crop: the same, with the window beside
//      the enhancement (off: the window config, no enhancement);
//   9. a GIF shows no switch and is kept as picked;
//  10. the modal fits: picture, switch row and both buttons on screen at
//      375x553, 393x659 and desktop, switch off and on.
// And in 3: an uncropped 2000x3000 pick now uploads at 1667x2500 (the hero cap),
// no longer through the old 800 px JPEG path.
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
  installEditor, installOnboarding, newEditorHarness, openEditor, heroDialog, pickHeroFile,
  toOnboardingStepTwo, openOnboardingCrop,
  rulerPng, decodeRuler, pct, expectWin,
  cropperReady, cropperStill, cropFrameShape, zoomAndDrag, heroSettled, shownInSource,
  objectPath, dimPng, pictureLook,
  type OnboardingHarness, type Region, type StoredFile, type Style, type Win,
} from './helpers/hero-window-harness';

const EN = translations.en as Record<string, string>;
const RULER = { name: 'ruler.png', mimeType: 'image/png', buffer: rulerPng() };
const frameAspect = (style: Style) => (style === 'hero' ? canonicalHeroAspect() : canonicalFullBleedAspect());
const isDesktop = (name: string) => name === 'desktop';

/** The onboarding crop modal (the one overlay holding the cropper). */
const cropModal = (page: Page) => page.locator('div.fixed.inset-0').filter({ has: page.locator('.reactEasyCrop_Container') });

type OnbCrop = {
  h: OnboardingHarness;
  scope: Awaited<ReturnType<typeof toOnboardingStepTwo>>;
  framed: Win;
  shape: number;
  region: Region & { fileW: number; fileH: number };
  displayPath: string;
};

/** Onboarding to step 2 → pick the ruler → Crop Image → zoom 1.5, off-centre → Apply Crop. */
async function onboardingCrop(page: Page, style: Style, desktop: boolean, failOriginal = false): Promise<OnbCrop> {
  if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  const h = await installOnboarding(page);
  h.failOriginal = failOriginal;
  const scope = await toOnboardingStepTwo(page, style, desktop, EN);
  await openOnboardingCrop(page, scope, RULER, EN);
  const shape = await cropFrameShape(page);
  const framed = await zoomAndDrag(page, cropModal(page).locator('input[type=range]'), 1.5, 40, -60);
  await page.getByRole('button', { name: EN['onboardingFlow.applyCrop'], exact: true }).click();
  await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
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

// ── PHOTO.POLISH.2: Auto enhance in the first photo modal ────────────────────
const DIM_FILE = () => ({ name: 'dim.png', mimeType: 'image/png', buffer: dimPng() });
const enhanceRow = (page: Page) => page.getByTestId('onb-enhance-row');
const enhanceSwitch = (page: Page) => page.getByTestId('onb-enhance-switch');
const photoPreview = (page: Page) => page.getByTestId('onb-photo-preview');
const PREVIEW_IMG = '[data-testid="onb-photo-preview"] img';

/**
 * A wizard run that starts clean IN THIS PAGE (a test may make two, to compare
 * them): the previous run's routes and its saved wizard state are dropped, then
 * the wizard is driven to step 2.
 */
async function freshStepTwo(page: Page, desktop: boolean, viewport?: { width: number; height: number }) {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.evaluate(() => { try { window.sessionStorage.clear(); } catch { /* no storage on this document */ } }).catch(() => {});
  if (viewport) await page.setViewportSize(viewport);
  else if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  const h = await installOnboarding(page);
  const scope = await toOnboardingStepTwo(page, 'hero', desktop, EN);
  return { h, scope };
}

/** The modal's picture is decoded and in the state asked for. */
async function modalShows(page: Page, state: 'on' | 'off') {
  await expect(photoPreview(page)).toHaveAttribute('data-enhance-preview', state, { timeout: 30_000 });
  await expect.poll(
    () => page.locator(PREVIEW_IMG).evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0),
    { timeout: 30_000, message: 'the modal picture decoded' },
  ).toBe(true);
}

type EnhanceFlow = {
  h: OnboardingHarness;
  display: StoredFile; original: StoredFile; displayPath: string;
  insert: Record<string, unknown>;
  /** The modal picture's mean luminance when its button was pressed. */
  modalLum: number;
};

/** Step 2 → pick the dim picture → (switch on) → Use Original, or Crop Image + Apply Crop → the page insert. */
async function enhanceFlow(page: Page, desktop: boolean, how: 'original' | 'crop', on: boolean): Promise<EnhanceFlow> {
  const { h, scope } = await freshStepTwo(page, desktop);
  await scope.locator('input[type="file"]').setInputFiles(DIM_FILE());
  await expect(enhanceRow(page)).toBeVisible({ timeout: 15_000 });
  await expect(enhanceRow(page), 'the row is labelled Auto enhance').toContainText(EN['editor.hero.autoEnhance']);
  await expect(enhanceSwitch(page), 'the switch starts off').toHaveAttribute('aria-checked', 'false');
  await modalShows(page, 'off');
  const offLook = await pictureLook(page, PREVIEW_IMG);
  let modalLum = offLook.lum;
  if (on) {
    await enhanceSwitch(page).click();
    await expect(enhanceSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await modalShows(page, 'on');
    const onLook = await pictureLook(page, PREVIEW_IMG);
    expect(Math.max(onLook.w, onLook.h), 'the modal shows a preview-size copy').toBeLessThanOrEqual(800);
    expect(onLook.lum, `the modal picture is brighter with the switch on (${onLook.lum.toFixed(1)} vs ${offLook.lum.toFixed(1)})`).toBeGreaterThan(offLook.lum + 8);
    modalLum = onLook.lum;
  }
  if (how === 'crop') {
    await page.getByRole('button', { name: EN['onboardingFlow.cropImage'], exact: true }).click();
    await cropperReady(page);
    await expect(enhanceRow(page), 'the crop modal itself has no switch').toHaveCount(0);
    await zoomAndDrag(page, cropModal(page).locator('input[type=range]'), 1.5, 40, -60);
    await page.getByRole('button', { name: EN['onboardingFlow.applyCrop'], exact: true }).click();
  } else {
    await page.getByRole('button', { name: EN['onboardingFlow.useOriginal'], exact: true }).click();
  }
  await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => h.uploads.length, { timeout: 60_000, message: 'both copies uploaded' }).toBe(2);
  const displayPath = h.uploads.find((u) => !u.path.includes('-original.'))!.path;
  const originalPath = h.uploads.find((u) => u.path.includes('-original.'))!.path;
  const insert = await finishToInsert(page, { h, scope }, 2);
  expect(objectPath(insert.avatar_url as string), 'the row points at the display upload').toBe(displayPath);
  expect(objectPath(insert.avatar_original_url as string), 'and at the kept original').toBe(originalPath);
  expect(h.aiCalls, 'nothing reached ai-enhance').toEqual([]);
  return { h, display: h.files.get(displayPath)!, original: h.files.get(originalPath)!, displayPath, insert, modalLum };
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

  test('3. "Use Original" after a crop: the insert carries no heroConfig', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const c = await onboardingCrop(page, 'hero', desktop);
    await expect.poll(() => c.h.uploads.length, { timeout: 60_000 }).toBe(2);
    // A second pick, accepted whole.
    await c.scope.locator('input[type="file"]').setInputFiles(RULER);
    const useOriginal = page.getByRole('button', { name: EN['onboardingFlow.useOriginal'], exact: true });
    await expect(useOriginal).toBeVisible({ timeout: 15_000 });
    await useOriginal.click();
    await expect(cropModal(page)).toHaveCount(0);
    const insert = await finishToInsert(page, c, 4);
    expect(heroConfigOf(insert), 'no heroConfig on an uncropped photo').toBeNull();
    expect(Object.keys(insert.theme_json as Record<string, unknown>)).not.toContain('heroConfig');
    // …and the display copy on the row is the whole picture, as today.
    const display = c.h.files.get(objectPath(insert.avatar_url as string))!;
    expect(display, 'the row points at an upload this session made').toBeTruthy();
    const whole = await decodeRuler(page, display);
    expectWin(pct(whole), { x: 0, y: 0, w: 100, h: 100 }, 'the uncropped display file is the whole picture');
    // PHOTO.POLISH.2: baked through the one hero output path — the hero cap on
    // the long side (2000x3000 → 1667x2500), no longer an 800 px JPEG.
    expect(HERO_MAX_PX, 'control: the hero cap').toBe(2500);
    expect([whole.fileW, whole.fileH], 'a 2000x3000 pick uploads at 1667x2500').toEqual([1667, 2500]);
    expect(display.type, 'encoded as every hero file is').toBe('image/webp');
    expect(readHeroEnhance(heroConfigOf(insert)), 'the switch was never touched: no enhancement').toBeNull();
    if (desktop) {
      // The preview paints it as a no-window hero: cover, the whole width.
      const shown = await heroSettled(page, 'hero', FRAME, 'data:');
      expect(Math.abs(shown.img.w - shown.box.w), 'the uncropped photo covers the box width').toBeLessThan(1);
    }
  });

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
    await openOnboardingCrop(page, c.scope, RULER, EN);
    const framed = await zoomAndDrag(page, cropModal(page).locator('input[type=range]'), 2, -50, 50);
    expect(Math.abs(framed.x - c.framed.x) + Math.abs(framed.w - c.framed.w), 'control: the second crop is not the first').toBeGreaterThan(3);
    await page.getByRole('button', { name: EN['onboardingFlow.applyCrop'], exact: true }).click();
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

  test('7. Auto enhance · Use Original: a brighter display file, the same original, and heroConfig holding the enhancement alone', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const off = await enhanceFlow(page, desktop, 'original', false);
    const on = await enhanceFlow(page, desktop, 'original', true);

    // Switch off: no hero config at all, as before.
    expect(heroConfigOf(off.insert), 'switch off: no heroConfig').toBeNull();
    // Switch on: the hero config holds the enhancement and nothing else.
    const cfg = heroConfigOf(on.insert)!;
    expect(cfg, 'switch on: the insert carries heroConfig').toBeTruthy();
    const stored = readHeroEnhance(cfg);
    expect(stored, 'heroConfig carries the enhancement').toBeTruthy();
    expect(stored!.strength, 'baked at full strength').toBe(1);
    expect(isIdentity(stored!.params), 'the dim picture has something to enhance').toBe(false);
    expect(Object.keys(writeHeroEnhance(cfg, null)), 'the enhancement is the only key (no window on an uncropped photo)').toEqual([]);

    // The kept original is the same bytes either way: it is never enhanced.
    expect(on.original.body.equals(off.original.body), 'the kept original is byte-identical with the switch on and off').toBe(true);

    // The display file: the whole picture at its own size, brighter with the switch on.
    const plain = await pictureLook(page, off.display);
    const bright = await pictureLook(page, on.display);
    expect([plain.w, plain.h], 'switch off: the whole picture, not capped at 800 px').toEqual([DIM.width, DIM.height]);
    expect([bright.w, bright.h], 'the same size with the switch on').toEqual([plain.w, plain.h]);
    expect(bright.lum, `enhanced ${bright.lum.toFixed(1)} vs plain ${plain.lum.toFixed(1)}`).toBeGreaterThan(plain.lum + 8);
    expect(on.display.type).toBe('image/webp');
    // What the modal showed is what was baked (both read the whole picture).
    expect(Math.abs(on.modalLum - bright.lum), `modal ${on.modalLum.toFixed(1)} vs baked ${bright.lum.toFixed(1)}`).toBeLessThan(3);
    expect(Math.abs(off.modalLum - plain.lum), 'control: off, the modal showed the picture as it is').toBeLessThan(3);

    // The phone preview (a ≥lg surface) is showing the enhanced file.
    if (desktop) {
      await heroSettled(page, 'hero', FRAME, 'data:');
      const shown = await pictureLook(page, `${FRAME} [data-testid="hero-sticky"] [data-hero-framing] img`);
      expect(Math.abs(shown.lum - bright.lum), 'the phone preview shows the enhanced display copy').toBeLessThan(3);
    }
  });

  test('8. Auto enhance · Crop Image + Apply Crop: a brighter display file, the same original, and enhance beside the window', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const off = await enhanceFlow(page, desktop, 'crop', false);
    const on = await enhanceFlow(page, desktop, 'crop', true);

    // Switch off: the window config, key for key, and no enhancement.
    const offCfg = heroConfigOf(off.insert)!;
    expect(Object.keys(offCfg).sort(), 'switch off: today\'s hero config').toEqual(['fit', 'posX', 'posY', 'window', 'windowSource']);
    expect(readHeroEnhance(offCfg), 'switch off: no enhancement').toBeNull();

    // Switch on: the same window config with the enhancement beside it.
    const cfg = heroConfigOf(on.insert)!;
    const stored = readHeroEnhance(cfg);
    expect(stored, 'heroConfig carries the enhancement').toBeTruthy();
    expect(stored!.strength, 'baked at full strength').toBe(1);
    expect(isIdentity(stored!.params)).toBe(false);
    const rest = writeHeroEnhance(cfg, null);
    expect(Object.keys(rest).sort(), 'the window config rides with it').toEqual(['fit', 'posX', 'posY', 'window', 'windowSource']);
    expect(rest.fit).toBe('fill');
    expect(pictureFitSeed(rest.window, frameAspect('hero')).crop, 'the window reads back as a window').toBeTruthy();
    expect(pictureFitSeed(rest.windowSource, frameAspect('hero')).crop, 'so does windowSource').toBeTruthy();

    // The kept original is the same bytes either way.
    expect(on.original.body.equals(off.original.body), 'the kept original is byte-identical with the switch on and off').toBe(true);

    // The display file: a cut of the picture (the same cut both times), brighter with the switch on.
    const plain = await pictureLook(page, off.display);
    const bright = await pictureLook(page, on.display);
    expect(plain.w * plain.h, 'a cut, not the whole picture').toBeLessThan(DIM.width * DIM.height * 0.9);
    expect(Math.abs(bright.w - plain.w), 'the same cut: width').toBeLessThanOrEqual(8);
    expect(Math.abs(bright.h - plain.h), 'the same cut: height').toBeLessThanOrEqual(8);
    expect(bright.lum, `enhanced ${bright.lum.toFixed(1)} vs plain ${plain.lum.toFixed(1)}`).toBeGreaterThan(plain.lum + 8);
  });

  test('9. a GIF shows no Auto enhance switch and is kept as picked', async ({ page }, testInfo) => {
    const desktop = isDesktop(testInfo.project.name);
    const { h, scope } = await freshStepTwo(page, desktop);
    // A valid 2x2 GIF (one frame).
    const gif = Buffer.from('R0lGODlhAgACAIAAAP8AAAAA/ywAAAAAAgACAAACAoRRADs=', 'base64');
    await scope.locator('input[type="file"]').setInputFiles({ name: 'tiny.gif', mimeType: 'image/gif', buffer: gif });
    const useOriginal = page.getByRole('button', { name: EN['onboardingFlow.useOriginal'], exact: true });
    await expect(useOriginal).toBeVisible({ timeout: 15_000 });
    await expect(photoPreview(page)).toBeVisible();
    await expect(enhanceRow(page), 'no row for a GIF').toHaveCount(0);
    await expect(enhanceSwitch(page)).toHaveCount(0);
    await useOriginal.click();
    await expect(scope.getByText(EN['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => h.uploads.length, { timeout: 60_000 }).toBe(2);
    for (const u of h.uploads) {
      expect(u.type, `${u.path} is uploaded as a GIF`).toBe('image/gif');
      expect(h.files.get(u.path)!.body.equals(gif), `${u.path} is the GIF as picked`).toBe(true);
    }
    const insert = await finishToInsert(page, { h, scope }, 2);
    expect(heroConfigOf(insert), 'no heroConfig for a GIF').toBeNull();
  });

  test('10. the first photo modal fits: picture, Auto enhance row and both buttons on screen, switch off and on', async ({ page }, testInfo) => {
    const desktopProject = isDesktop(testInfo.project.name);
    const sizes = [
      { width: 375, height: 553, wide: false },
      { width: 393, height: 659, wide: false },
      // The wizard's desktop layout is a Chromium-project surface.
      ...(desktopProject ? [{ width: 1440, height: 900, wide: true }] : []),
    ];
    /** Every part of the modal, and the viewport, read in one evaluate. */
    const read = () => page.evaluate(({ crop, original }) => {
      const box = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
      };
      const btn = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
      return {
        vw: window.innerWidth, vh: window.innerHeight, docW: document.documentElement.scrollWidth,
        picture: box(document.querySelector('[data-testid="onb-photo-preview"]')),
        row: box(document.querySelector('[data-testid="onb-enhance-row"]')),
        toggle: box(document.querySelector('[data-testid="onb-enhance-switch"]')),
        crop: box(btn(crop)), original: box(btn(original)),
      };
    }, { crop: EN['onboardingFlow.cropImage'], original: EN['onboardingFlow.useOriginal'] });

    for (const size of sizes) {
      const { scope } = await freshStepTwo(page, size.wide, { width: size.width, height: size.height });
      await scope.locator('input[type="file"]').setInputFiles(DIM_FILE());
      await expect(enhanceRow(page)).toBeVisible({ timeout: 15_000 });
      for (const state of ['off', 'on'] as const) {
        if (state === 'on') await enhanceSwitch(page).click();
        await modalShows(page, state);
        const at = `${size.width}x${size.height}, switch ${state}`;
        const m = await read();
        expect([m.vw, m.vh], `${at}: the viewport`).toEqual([size.width, size.height]);
        for (const [name, b] of Object.entries({ picture: m.picture, row: m.row, switch: m.toggle, 'Crop Image': m.crop, 'Use Original': m.original })) {
          expect(b, `${at}: ${name} is in the modal`).toBeTruthy();
          expect(b!.top, `${at}: ${name} top is on screen`).toBeGreaterThanOrEqual(0);
          expect(b!.bottom, `${at}: ${name} bottom is on screen`).toBeLessThanOrEqual(m.vh);
          expect(b!.left, `${at}: ${name} left is on screen`).toBeGreaterThanOrEqual(0);
          expect(b!.right, `${at}: ${name} right is on screen`).toBeLessThanOrEqual(m.vw);
        }
        // In order, top to bottom: picture, row, Crop Image, Use Original.
        expect(m.picture!.bottom, `${at}: the row is under the picture`).toBeLessThanOrEqual(m.row!.top);
        expect(m.row!.bottom, `${at}: Crop Image is under the row`).toBeLessThanOrEqual(m.crop!.top);
        expect(m.crop!.bottom, `${at}: Use Original is under Crop Image`).toBeLessThanOrEqual(m.original!.top);
        expect(m.picture!.height, `${at}: the picture keeps a usable height`).toBeGreaterThanOrEqual(120);
        expect(m.docW, `${at}: no sideways scroll`).toBeLessThanOrEqual(m.vw);
      }
    }
  });

  // HERO.FIT.3c: the editor crop step is manual only — drag, zoom, Back, Apply Crop.
  for (const style of ['hero', 'full_bleed'] as Style[]) {
    test(`4. editor crop step · ${style}: zoom, Back and Apply Crop only — no Auto frame, no face presets, nothing fetched from /models or ai-enhance`, async ({ page }) => {
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
      await expect(page.getByTestId('hero-photo-preview')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: EN['editor.cropImage'] }).click();
      await cropperReady(page);

      const dlg = heroDialog(page);
      const zoom = dlg.locator('input[type=range]');
      const back = dlg.getByRole('button', { name: EN['editor.crop.back'], exact: true });
      const apply = dlg.getByRole('button', { name: EN['editor.crop.applyCrop'], exact: true });
      await expect(zoom).toBeVisible();
      await expect(back).toBeVisible();
      await expect(apply).toBeVisible();
      await expect(page.getByTestId('crop-auto-frame'), 'no Auto frame button').toHaveCount(0);
      // PHOTO.POLISH.1: the labels are literals — their dictionary keys are gone with the buttons.
      for (const label of ['Headshot', 'Shoulders', 'Full Body', 'Auto frame']) {
        await expect(dlg.getByRole('button', { name: label }), `no ${label} button`).toHaveCount(0);
      }
      // The zoom row is followed directly by the Back / Apply Crop row.
      const rows = await page.evaluate(({ backLabel, applyLabel }) => {
        const d = document.querySelector('div[class*="z-[130]"]')!;
        const btn = (label: string) => [...d.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
        const b = btn(backLabel), a = btn(applyLabel);
        const zoomRow = d.querySelector('input[type=range]')!.parentElement!;
        return {
          back: b.getBoundingClientRect().top, apply: a.getBoundingClientRect().top,
          zoomBottom: zoomRow.getBoundingClientRect().bottom,
          next: zoomRow.nextElementSibling === b.parentElement,
        };
      }, { backLabel: EN['editor.crop.back'], applyLabel: EN['editor.crop.applyCrop'] });
      expect(Math.abs(rows.back - rows.apply), 'Back and Apply Crop are one row').toBeLessThan(1);
      expect(rows.next, 'the zoom row is followed directly by the Back / Apply Crop row').toBe(true);
      expect(rows.zoomBottom).toBeLessThanOrEqual(rows.back);

      // Leave the crop step open a while: a preload would have fired on open.
      await cropperStill(page);
      await page.waitForTimeout(3_000);
      expect(modelRequests, 'no request went to /models/').toEqual([]);
      expect(h.aiCalls, 'no request went to ai-enhance').toEqual([]);
    });
  }
});

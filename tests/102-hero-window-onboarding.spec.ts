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
import {
  AVATARS, FRAME, SRC,
  installEditor, installOnboarding, newEditorHarness, openEditor, heroDialog, pickHeroFile,
  toOnboardingStepTwo, openOnboardingCrop,
  rulerPng, decodeRuler, pct, expectWin,
  cropperReady, cropperStill, cropFrameShape, zoomAndDrag, heroSettled, shownInSource,
  objectPath,
  type OnboardingHarness, type Region, type Style, type Win,
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
async function finishToInsert(page: Page, c: OnbCrop, uploads: number) {
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
    expectWin(pct(await decodeRuler(page, display)), { x: 0, y: 0, w: 100, h: 100 }, 'the uncropped display file is the whole picture');
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

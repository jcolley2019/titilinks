import { test, expect } from '@playwright/test';
import {
  canonicalHeroAspect,
  canonicalFullBleedAspect,
  resolveDevicePreset,
  DEFAULT_DEVICE_ID,
} from '../src/lib/device-presets';

// CROP.3a-C — WYSIWYG crop fidelity. CROP.3a proved the crop ENGINE faithful
// (09-crop-fidelity): getCroppedImage extracts croppedAreaPixels exactly. Any
// remaining "what I framed ≠ what publishes" drift was DISPLAY geometry — the
// crop modal derived its frame aspect from the live WINDOW (desktop landscape
// ~1.5) while the hero renders portrait, so object-cover re-cropped the faithful
// output (~35% chopped on desktop; intermittent on mobile via dvh drift).
//
// The fix: the crop frame aspect is now canonicalHeroAspect()/canonicalFullBleedAspect(),
// derived from the DEFAULT device preset — deterministic, window-independent.
// Crop-frame aspect == hero-container aspect ⇒ cover-at-matching-aspect + center
// is an identity. These specs pin that identity three ways.

const preset = resolveDevicePreset(DEFAULT_DEVICE_ID);

// Independent re-derivation of the hero-container aspect from the preset's raw
// logical dims, using the SAME formula EditableProfileView's hero window renders
// at: width = logical width; height = min(50%·height + HERO_EXTRA, cap + HERO_EXTRA),
// with HERO_EXTRA=60 and the maxHeight base cap=500. If canonicalHeroAspect's
// constants ever drift from the container's, this catches it.
const HERO_EXTRA = 60;
const HERO_CAP = 500;
const heroContainerAspect =
  preset.width / Math.min(preset.height * 0.5 + HERO_EXTRA, HERO_CAP + HERO_EXTRA);

test.describe('crop WYSIWYG — frame aspect equals hero-container aspect (CROP.3a-C)', () => {
  // (1) GEOMETRY IDENTITY — the whole point of the fix. The crop frame the user
  // composes in is the exact shape the hero renders, so cover + center = identity.
  test('canonicalHeroAspect equals the hero-container formula for the default preset (portrait)', () => {
    expect(canonicalHeroAspect()).toBeCloseTo(heroContainerAspect, 6);
    // iPhone 17 Pro: 402 / min(437+60, 560) = 402/497 ≈ 0.809 — portrait, never landscape.
    expect(canonicalHeroAspect()).toBeCloseTo(402 / 497, 6);
    expect(canonicalHeroAspect()).toBeLessThan(1);
    // Full-bleed frame is the whole viewport of the default preset.
    expect(canonicalFullBleedAspect()).toBeCloseTo(preset.width / preset.height, 6);
    expect(canonicalFullBleedAspect()).toBeLessThan(1);
  });

  // (2) NEGATIVE PROOF / DETERMINISM — the retired window-derived formula gave a
  // DIFFERENT aspect at every window (landscape on desktop), which is exactly the
  // ~35% re-crop. The canonical value is a single window-independent constant.
  test('the retired window-derived aspect diverges from the canonical (this is the bug the fix kills)', () => {
    // OLD hero formula: min(innerWidth,640) / min(innerHeight·0.5+60, 560).
    const oldAtDesktop = Math.min(1280, 640) / Math.min(720 * 0.5 + 60, 560); // 640/420 ≈ 1.524
    const oldAtPhone = Math.min(402, 640) / Math.min(874 * 0.5 + 60, 560); //    402/497 ≈ 0.809

    // Window-dependent: desktop window yields a LANDSCAPE frame far from the
    // portrait hero — cover re-crops it. That divergence is the defect.
    expect(oldAtDesktop).toBeGreaterThan(1);
    expect(Math.abs(oldAtDesktop - canonicalHeroAspect())).toBeGreaterThan(0.3);
    expect(oldAtDesktop).not.toBeCloseTo(oldAtPhone, 1); // the value moved with the window

    // The canonical value does NOT move with the window — same constant here as
    // when evaluated on any device. On a real phone the OLD formula happened to
    // land near-right (~0.809), which is why the bug was intermittent on mobile.
    expect(canonicalHeroAspect()).toBeCloseTo(oldAtPhone, 2);
  });

  // (3) LIVE WIRING — drive the authenticated editor, open the real crop modal,
  // and measure react-easy-crop's rendered crop frame. It must render at a
  // canonical DEVICE aspect (portrait), never a window ratio. This proves the
  // component actually consumes canonicalHeroAspect()/canonicalFullBleedAspect(),
  // not just that those functions are correct. Stops BEFORE "Apply Crop" so no
  // Supabase upload occurs.
  test('the live crop modal renders its frame at a canonical device aspect', async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    // A real 600×600 PNG minted in-page, then handed to the hidden photo input
    // (the one input that accepts both image and video — the combined hero media
    // picker). setInputFiles fires React's onChange → the "choose" overlay opens.
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 600;
      const x = c.getContext('2d')!;
      x.fillStyle = '#8a8a8a';
      x.fillRect(0, 0, 600, 600);
      return c.toDataURL('image/png');
    });
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    // The editor mounts EditableProfileView twice (desktop preview + mobile
    // layout), so two identical photo inputs exist; the crop modal is a global
    // body-portal, so triggering either instance opens the one modal we measure.
    await page
      .locator('input[type="file"][accept*="image/jpeg"][accept*="video/mp4"]')
      .first()
      .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer });

    // Choose step → open the manual (react-easy-crop) step.
    await page.getByRole('button', { name: 'Crop Image' }).click();

    const cropArea = page.locator('.reactEasyCrop_CropArea');
    await expect(cropArea).toBeVisible();
    // Settle one frame so react-easy-crop has laid the crop box out.
    await expect.poll(async () => {
      const b = await cropArea.boundingBox();
      return b && b.width > 0 && b.height > 0 ? 1 : 0;
    }).toBe(1);

    const box = await cropArea.boundingBox();
    const measured = box!.width / box!.height;

    // Portrait — the retired desktop value was landscape (>1); this alone kills it.
    expect(measured).toBeLessThan(1);
    // And it matches a canonical device aspect (hero OR full-bleed, per the
    // account's page style) — a real preset-derived shape, not a window ratio.
    const gap = Math.min(
      Math.abs(measured - canonicalHeroAspect()),
      Math.abs(measured - canonicalFullBleedAspect()),
    );
    expect(gap).toBeLessThan(0.03);
  });
});

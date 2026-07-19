import { test, expect, type Locator } from '@playwright/test';
import { DEVICE_PRESETS, DEFAULT_DEVICE_ID, resolveDevicePreset } from '../src/lib/device-presets';

// DP.1 — the editor preview frame renders at a real device's LOGICAL CSS
// viewport. offsetWidth/offsetHeight are layout metrics that IGNORE the
// scale-to-fit transform, so they equal the preset's exact px regardless of how
// the frame is scaled to fit the column. The frame is desktop-only (lg:block).

// Logical (pre-scale) size of the device frame — transform-independent.
const logicalSize = (frame: Locator) =>
  frame.evaluate((el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight }));

test.describe('Editor device preview presets (DP.1)', () => {
  // Skip on the mobile project — the device-truthful frame only renders on the
  // desktop (lg) editor layout.
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'Device frame is desktop-only (lg:block).');

  test.beforeEach(async ({ page }) => {
    // Tall desktop viewport: every phone preset fits at 100% while the iPad
    // presets must scale — a clean fit / no-fit contrast for the scale badge.
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
  });

  test('default frame matches DEFAULT_DEVICE_ID logical dimensions', async ({ page }) => {
    const preset = resolveDevicePreset(DEFAULT_DEVICE_ID);
    const frame = page.getByTestId('device-frame');
    await expect(frame).toBeVisible();
    expect(await logicalSize(frame)).toEqual({ w: preset.width, h: preset.height });
    // Default (iPhone 17 Pro) fits the tall column → no scaling badge.
    await expect(page.getByTestId('device-scale')).toBeHidden();
  });

  test('switching presets renders each device at its exact logical size', async ({ page }) => {
    const frame = page.getByTestId('device-frame');
    const selector = page.getByTestId('device-selector');
    for (const id of ['iphone-17-pro-max', 'iphone-16-15', 'galaxy-s26', 'pixel-10', 'ipad-air', 'ipad-pro-13']) {
      const preset = resolveDevicePreset(id);
      await selector.selectOption(id);
      await expect.poll(() => logicalSize(frame)).toEqual({ w: preset.width, h: preset.height });
    }
  });

  test('scale badge appears only when the preset exceeds the column', async ({ page }) => {
    const selector = page.getByTestId('device-selector');
    const badge = page.getByTestId('device-scale');
    // iPad Pro 13" (1376 tall) cannot fit the column → frame scales down.
    await selector.selectOption('ipad-pro-13');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/%$/);
    // A small phone fits at 100% → badge hidden.
    await selector.selectOption('galaxy-s26');
    await expect(badge).toBeHidden();
  });

  test('Android presets surface the approximate-size caption', async ({ page }) => {
    const selector = page.getByTestId('device-selector');
    // iPhone preset (exact) → no caption.
    await selector.selectOption('iphone-17-pro');
    await expect(page.getByText('Android sizes are approximate')).toBeHidden();
    // Galaxy preset (note: android-approx) → caption shown.
    await selector.selectOption('galaxy-s26');
    await expect(page.getByText('Android sizes are approximate')).toBeVisible();
  });

  test('selection persists across a reload', async ({ page }) => {
    const selector = page.getByTestId('device-selector');
    await selector.selectOption('ipad-air');
    await expect(page.getByTestId('device-frame')).toBeVisible();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('device-selector')).toHaveValue('ipad-air');
    const preset = resolveDevicePreset('ipad-air');
    expect(await logicalSize(page.getByTestId('device-frame'))).toEqual({ w: preset.width, h: preset.height });
  });
});

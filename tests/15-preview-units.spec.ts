// DP.2 Task B — container-truthful preview units.
//
// The hero container renders `height: calc(var(--pv-vh, 1dvh) * 50 + 60px)`. The
// editor frame publishes `--pv-vh = frameLogicalHeight / 100`px, so inside the
// preview the `* 50` resolves against the PREVIEWED DEVICE, not the desktop
// window. On the public route `--pv-vh` is absent, so the 1dvh fallback makes it
// identical to the pre-DP.2 `calc(50dvh + 60px)`.
//
// Two proofs:
//  1. The preview hero equals the frame-relative expectation at two presets —
//     the truthfulness Joey wanted (iPads no longer measure the desktop window).
//     This is the spec the negative proof targets: delete --pv-vh and it fails.
//  2. HARD FENCE: the public hero's computed height is byte-identical to the old
//     formula, proven by an in-page probe carrying the retired expression.

import { test, expect } from '@playwright/test';
import { DEVICE_PRESETS } from '../src/lib/device-presets';

const DESKTOP = { width: 1440, height: 1000 };
const PROFILE = '/joeyc';

// Mirror of the hero-container height math (EditableProfileView + device-presets):
// height = min(50% of the frame's logical height + HERO_EXTRA, cap + HERO_EXTRA).
const HERO_EXTRA = 60;
const HERO_CAP = 500;
const frameHero = (logicalHeight: number) =>
  Math.min(logicalHeight * 0.5 + HERO_EXTRA, HERO_CAP + HERO_EXTRA);

const presetH = (id: string) => DEVICE_PRESETS.find((d) => d.id === id)!.height;

test.describe('DP.2 Task B — container-truthful preview units', () => {
  test('preview hero measures against the device frame, not the desktop window', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    const selector = page.getByTestId('device-selector');
    const hero = frame.getByTestId('hero-sticky').first();
    await expect(frame).toBeVisible();

    // A short phone (well under the cap) and a tall tablet (past the cap): the
    // window-relative bug would collapse both to the same desktop-derived height;
    // the frame-relative fix keeps them distinct and preset-true.
    for (const id of ['iphone-17-pro', 'ipad-pro-13']) {
      const expected = frameHero(presetH(id));
      await selector.selectOption(id);
      await expect
        .poll(
          async () => Math.abs((await hero.evaluate((el) => (el as HTMLElement).offsetHeight)) - expected),
          { timeout: 5000, message: `preview hero for ${id} should be ~${expected}px (frame-relative)` }
        )
        .toBeLessThanOrEqual(1);
    }
  });

  test('public hero computed height is byte-identical to the pre-DP.2 formula', async ({ page }) => {
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');

    const hero = page.getByTestId('hero-sticky').first();
    await expect(hero).toBeVisible();

    // The retired expression, measured live against THIS window. With --pv-vh
    // absent on the public route, the DP.2 hero must resolve to the same px.
    const legacy = await page.evaluate(() => {
      const d = document.createElement('div');
      d.style.cssText =
        'position:absolute;visibility:hidden;width:100px;height:calc(50dvh + 60px);max-height:calc(500px + 60px);';
      document.body.appendChild(d);
      const h = d.offsetHeight;
      d.remove();
      return h;
    });
    const heroHeight = await hero.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(heroHeight).toBe(legacy);
  });
});

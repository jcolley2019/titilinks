import { test, expect } from './fixtures';

// TL.AI.COST.1 — the AI-enhance payload is bounded before it leaves the browser.
// Replicate bills crystal-upscaler by OUTPUT megapixels and we always ask for
// scale_factor 2, so the INPUT sets the price: a native-resolution phone crop
// (3000 px) lands at 36 MP = $0.80/run, while a 1024 px input yields a 2048 px
// output = 4.2 MP = $0.05/run. boundForAi() is that bound.
//
// Why the helper is tested directly rather than through the AI button: the
// button only reaches the request after detectFace() succeeds on the picked
// photo, and the battery has no fixture with a real detectable face — so the
// send path cannot be driven end-to-end here. The helper IS the whole cost
// fix; proving its output dimensions and payload size proves the saving.
//
// Writes: none (pure canvas math in the page, no Supabase call).
// Not auth-gated — it tests the real shipped module via the Vite dev server.
test.describe('AI input bound (TL.AI.COST.1)', () => {
  test('a 3000px square crop is bounded to 1024px and a small JPEG payload', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const mod: any = await import('/src/lib/crop.ts');
      const { boundForAi } = mod;

      // A real photo's worth of detail: a two-colour gradient, not a flat fill,
      // so the JPEG size assertion below is meaningful rather than trivially
      // compressible.
      const c = document.createElement('canvas');
      c.width = 3000; c.height = 3000;
      const cx = c.getContext('2d')!;
      const grad = cx.createLinearGradient(0, 0, 3000, 3000);
      grad.addColorStop(0, '#ff0055');
      grad.addColorStop(1, '#0066ff');
      cx.fillStyle = grad;
      cx.fillRect(0, 0, 3000, 3000);

      const out = boundForAi(c);

      // Decode the result to prove the data URL really carries those pixels.
      const img = new Image();
      img.src = out.dataUrl;
      await img.decode();

      return {
        width: out.width,
        height: out.height,
        prefix: out.dataUrl.slice(0, 15),
        base64Chars: out.dataUrl.split(',')[1].length,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      };
    });

    expect(r.width).toBe(1024);
    expect(r.height).toBe(1024);
    expect(r.prefix).toBe('data:image/jpeg');
    expect(r.naturalWidth).toBe(1024);
    expect(r.naturalHeight).toBe(1024);
    // Replicate recommends data-URI inputs under 1 MB; the bounded payload is
    // far under that. A native-resolution 3000px crop is several MB.
    expect(r.base64Chars).toBeLessThan(500 * 1024);
  });

  test('a non-square source is bounded on its longest edge, aspect kept', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const mod: any = await import('/src/lib/crop.ts');
      const { boundForAi } = mod;

      const c = document.createElement('canvas');
      c.width = 3000; c.height = 2000;
      const cx = c.getContext('2d')!;
      const grad = cx.createLinearGradient(0, 0, 3000, 2000);
      grad.addColorStop(0, '#112233');
      grad.addColorStop(1, '#ffcc00');
      cx.fillStyle = grad;
      cx.fillRect(0, 0, 3000, 2000);

      const out = boundForAi(c);
      return { width: out.width, height: out.height };
    });

    // Longest edge hits the bound; the short edge follows the aspect ratio.
    expect(r.width).toBe(1024);
    expect(r.height).toBe(Math.round(2000 * 1024 / 3000)); // 683
  });

  test('a source already within the bound is never upscaled', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const mod: any = await import('/src/lib/crop.ts');
      const { boundForAi, AI_INPUT_MAX_PX } = mod;

      const c = document.createElement('canvas');
      c.width = 600; c.height = 600;
      const cx = c.getContext('2d')!;
      const grad = cx.createLinearGradient(0, 0, 600, 600);
      grad.addColorStop(0, '#00ff88');
      grad.addColorStop(1, '#8800ff');
      cx.fillStyle = grad;
      cx.fillRect(0, 0, 600, 600);

      const out = boundForAi(c);
      return { width: out.width, height: out.height, max: AI_INPUT_MAX_PX };
    });

    expect(r.width).toBe(600);
    expect(r.height).toBe(600);
    expect(r.max).toBe(1024);
  });
});

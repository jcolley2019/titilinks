import { test, expect } from '@playwright/test';

// CROP.3a — crop-engine fidelity net. getCroppedImage is the single output path
// for every crop surface (editor camera flow, onboarding, page 2). This proves
// it faithfully extracts croppedAreaPixels under the natural-pixel contract, so
// any WYSIWYG drift is downstream DISPLAY geometry (crop-frame vs hero-container
// aspect — owned by CROP.3a-C), never the engine. It also exercises the CROP.3a
// decode-wait path and the error-cause mapping (STEP 1/2). Tests the real
// shipped module via the Vite dev server, so it is not auth-gated.
test.describe('crop engine fidelity', () => {
  test('getCroppedImage extracts the exact region + error-cause mapping', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const mod: any = await import('/src/lib/crop.ts');
      const { getCroppedImage, cropErrorCauseKey } = mod;

      // 3x3 grid of distinct colors, 120px cells -> 360x360 fixture.
      const colors = [
        ['#ff0000', '#00ff00', '#0000ff'],
        ['#ffff00', '#ff00ff', '#00ffff'],
        ['#ffffff', '#808080', '#000000'],
      ];
      const g = document.createElement('canvas');
      g.width = 360; g.height = 360;
      const gc = g.getContext('2d')!;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        gc.fillStyle = colors[y][x];
        gc.fillRect(x * 120, y * 120, 120, 120);
      }
      const src = g.toDataURL('image/png');

      // Center cell region, expressed in NATURAL pixels (as react-easy-crop
      // returns croppedAreaPixels). A faithful engine returns exactly cell(1,1).
      const file = await getCroppedImage(src, { x: 120, y: 120, width: 120, height: 120 });
      const url = URL.createObjectURL(file);
      const out = new Image();
      out.src = url;
      await out.decode();
      const oc = document.createElement('canvas');
      oc.width = out.naturalWidth; oc.height = out.naturalHeight;
      const octx = oc.getContext('2d')!;
      octx.drawImage(out, 0, 0);
      const rgb = (X: number, Y: number) => {
        const d = octx.getImageData(X, Y, 1, 1).data;
        return [d[0], d[1], d[2]] as [number, number, number];
      };
      const w = oc.width, h = oc.height;
      const sample = {
        size: `${w}x${h}`,
        tl: rgb(2, 2),
        mid: rgb(w >> 1, h >> 1),
        br: rgb(w - 3, h - 3),
      };

      const causes = {
        tainted: cropErrorCauseKey({ name: 'SecurityError', message: 'Tainted canvases may not be exported.' }),
        model: cropErrorCauseKey({ message: 'failed to fetch model from /models' }),
        decode: cropErrorCauseKey({ message: 'Image decode failed' }),
        unknown: cropErrorCauseKey({ message: 'something else entirely' }),
      };
      return { sample, causes };
    });

    // Output canvas is exactly the requested region size.
    expect(r.sample.size).toBe('120x120');
    // Every sampled point is the center magenta cell (JPEG-tolerant bounds).
    for (const p of [r.sample.tl, r.sample.mid, r.sample.br]) {
      expect(p[0]).toBeGreaterThan(220); // R high
      expect(p[1]).toBeLessThan(45);     // G low
      expect(p[2]).toBeGreaterThan(220); // B high
    }
    // Error-cause mapping keeps the failure modes distinguishable (STEP 1).
    expect(r.causes.tainted).toBe('editor.crop.causeTainted');
    expect(r.causes.model).toBe('editor.crop.causeModel');
    expect(r.causes.decode).toBe('editor.crop.causeDecode');
    expect(r.causes.unknown).toBe('editor.crop.causeUnknown');
  });
});

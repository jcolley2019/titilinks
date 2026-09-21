import { test, expect, type Page } from './fixtures';

// TL.CROP.QUAL.1 — the hero output path caps at HERO_MAX_PX (1440) and encodes
// WebP 0.85 with a JPEG 0.85 fallback. Audit docs/CROP-AI-AUDIT-2026-09.md
// §A.2.1 / finding #2: the old 800 px JPEG cap was upscaled ~1.5× on a 3× phone
// hero (full viewport width × 50 vh, object-fit: cover ≈ 1170 × 1266 device
// pixels). getCroppedImage is the one output path for every crop surface;
// boundHeroImage is the same cap + encoding for the un-cropped cases (AI-accept
// and "Save" with no crop) so a hero can never be uploaded uncapped or mis-typed.
//
// Why the helpers are tested directly: they ARE the whole quality fix, and
// proving output dimensions, type/name agreement and byte size proves it.
// Either encoding is accepted (WebKit's canvas cannot encode WebP and takes
// the JPEG branch) — the invariant is that the NAME matches the TYPE, because
// handlePhotoSave derives the storage extension from the name.
//
// Writes: none (pure canvas math in the page, no Supabase call).
// Not auth-gated — it tests the real shipped module via the Vite dev server.

/** Shape returned by the in-page helper: the decoded File's truth. */
type Probe = {
  naturalWidth: number;
  naturalHeight: number;
  type: string;
  name: string;
  size: number;
  heroMaxPx?: number;
};

/** The in-page probe: mint a gradient PNG of the given size, run it through
 *  the requested output path, then decode the returned File and report its
 *  truth. Everything inside page.evaluate is self-contained — it cannot close
 *  over Node-side helpers, so the arguments carry all it needs. */
const probeInPage = async (
  page: Page,
  args: { w: number; h: number; from: string; to: string; mode: 'crop' | 'bound'; crop?: { x: number; y: number; width: number; height: number } },
): Promise<Probe> =>
  page.evaluate(async (a) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const mod: any = await import('/src/lib/crop.ts');
    const { getCroppedImage, boundHeroImage, HERO_MAX_PX } = mod;

    // A real photo's worth of detail: a two-colour gradient, not a flat fill,
    // so the byte-size assertion is meaningful rather than trivially
    // compressible.
    const c = document.createElement('canvas');
    c.width = a.w; c.height = a.h;
    const cx = c.getContext('2d')!;
    const grad = cx.createLinearGradient(0, 0, a.w, a.h);
    grad.addColorStop(0, a.from);
    grad.addColorStop(1, a.to);
    cx.fillStyle = grad;
    cx.fillRect(0, 0, a.w, a.h);
    const src = c.toDataURL('image/png');

    const file: File = a.mode === 'crop'
      ? await getCroppedImage(src, a.crop)
      : await boundHeroImage(src);

    // Decode the returned File to prove it really carries those pixels.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);

    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      type: file.type,
      name: file.name,
      size: file.size,
      heroMaxPx: HERO_MAX_PX,
    };
  }, args);

/** The name must match the type — handlePhotoSave names the storage object by
 *  the file's extension, so a mismatch would store a JPEG as .webp or vice versa. */
const expectNameMatchesType = (r: Probe) => {
  if (r.type === 'image/webp') {
    expect(r.name).toBe('avatar.webp');
  } else {
    expect(r.type).toBe('image/jpeg');
    expect(r.name).toBe('avatar.jpg');
  }
};

test.describe('Hero output bound (TL.CROP.QUAL.1)', () => {
  test('1. a 3000px full-frame crop lands at 1440px, typed and named consistently, under 600 KB', async ({ page }) => {
    await page.goto('/');
    const r = await probeInPage(page, {
      w: 3000, h: 3000, from: '#ff0055', to: '#0066ff',
      mode: 'crop', crop: { x: 0, y: 0, width: 3000, height: 3000 },
    });

    expect(r.heroMaxPx).toBe(1440);
    expect(r.naturalWidth).toBe(1440);
    expect(r.naturalHeight).toBe(1440);
    expectNameMatchesType(r);
    expect(r.size).toBeLessThan(600 * 1024);
  });

  test('2. boundHeroImage bounds a non-square source on its longest edge, aspect kept', async ({ page }) => {
    await page.goto('/');
    const r = await probeInPage(page, {
      w: 3000, h: 2000, from: '#112233', to: '#ffcc00', mode: 'bound',
    });

    expect(r.naturalWidth).toBe(1440);
    expect(r.naturalHeight).toBe(960); // 2000 × 1440 / 3000
    expectNameMatchesType(r);
  });

  test('3. boundHeroImage never upscales a source already within the cap', async ({ page }) => {
    await page.goto('/');
    const r = await probeInPage(page, {
      w: 600, h: 600, from: '#00ff88', to: '#8800ff', mode: 'bound',
    });

    expect(r.naturalWidth).toBe(600);
    expect(r.naturalHeight).toBe(600);
    expectNameMatchesType(r);
  });

  test('4. a crop under the cap is untouched (the spec-09 contract)', async ({ page }) => {
    await page.goto('/');
    const r = await probeInPage(page, {
      w: 3000, h: 3000, from: '#ff0055', to: '#0066ff',
      mode: 'crop', crop: { x: 1000, y: 1000, width: 500, height: 500 },
    });

    expect(r.naturalWidth).toBe(500);
    expect(r.naturalHeight).toBe(500);
    expectNameMatchesType(r);
  });
});

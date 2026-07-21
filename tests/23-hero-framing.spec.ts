import { test, expect, type Page, type Route } from '@playwright/test';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '../src/lib/device-presets';
import { resolveHeroGeometry } from '../src/lib/hero-framing';
import type { PageStyle } from '../src/lib/theme-defaults';

/**
 * FIX.MEDIA.1 — one truth for hero media.
 *
 * The ratified contract: what the Video Profile panel preview shows is EXACTLY
 * what the live page renders, and every framing slider updates all previews in
 * real time, before any save.
 *
 * The geometry itself is exhaustively unit-tested in scripts/hero-framing.test.mjs
 * (cover / reveal / zoom / pan / fit). These specs verify the WIRING that unit
 * tests cannot see:
 *   1. the panel preview frame renders at the LIVE container aspect;
 *   2. that frame is the same shape empty and populated;
 *   3. dragging a slider moves BOTH previews, with no write;
 *   4. tapping the frame opens the video picker.
 *
 * Harness: reads are mocked so the page carries a hero video; every write is
 * no-op'd and asserted absent where it matters. The video URL is deliberately
 * un-decodable — the framing contract is about the CONTAINER's shape and the
 * resolved framing values, neither of which depends on real pixels, and a real
 * MP4 fixture would buy nothing but flake.
 */

const PAGE_ID = '00000000-0000-0000-0000-000000000000';
const HERO_VIDEO = 'https://stub.invalid/hero.mp4';

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');

const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Reads pinned, writes swallowed. `writes` collects every mutating call to
 * `pages` so a spec can prove a slider drag previewed WITHOUT persisting.
 */
async function installMocks(page: Page, opts: { video?: boolean; style?: PageStyle } = {}) {
  const writes: string[] = [];
  // Mutable so a spec can flip the page from "no hero video" to "hero video"
  // and reload in the SAME context — a second browser context would lose the
  // project-level storageState auth.
  //
  // The page style is pinned rather than inherited: the real test account's page
  // is full_bleed, and the frame's shape is supposed to FOLLOW the page style,
  // so a spec that silently inherited it would assert nothing.
  const state = { video: !!opts.video, style: opts.style ?? ('hero' as PageStyle) };

  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan: 'pro' } : [{ plan: 'pro' }]);
  });

  // The hero video lives in theme_json.heroConfig. Rather than guess the real
  // page's shape, pass the read through and STAMP the config onto whatever came
  // back — so the editor loads its genuine page and simply believes it has a
  // hero video. Writes are swallowed and recorded.
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().method());
      return route.fulfill({ status: 204, body: '' });
    }
    const res = await route.fetch();
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return route.fulfill({ response: res });
    }
    const heroConfig = state.video
      ? { video: HERO_VIDEO, videoPos: { scale: 1, posX: 50, posY: 50 } }
      : {};
    const stamp = (row: unknown) => {
      const r = row as Record<string, unknown>;
      if (!r || typeof r !== 'object' || !('theme_json' in r)) return row;
      const theme = { ...(r.theme_json as Record<string, unknown>) };
      // Per-page overrides outrank the profile default, so clear them before
      // pinning the style — otherwise the page keeps its own.
      delete theme.pages;
      delete theme.heroConfig_page2;
      return { ...r, theme_json: { ...theme, pageStyle: state.style, heroConfig } };
    };
    return asJson(route, Array.isArray(body) ? body.map(stamp) : stamp(body));
  });

  for (const tbl of ['modes', 'blocks', 'block_items', 'profile_snapshots']) {
    await page.route(`**/rest/v1/${tbl}*`, async (route) => {
      if (route.request().method() === 'GET') return route.continue();
      return route.fulfill({ status: 204, body: '' });
    });
  }

  // Never let the stub URL hit the network.
  await page.route(HERO_VIDEO, (route) => route.abort());

  return { writes, state };
}

async function openVideoProfile(page: Page) {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByText('Video Profile', { exact: true }).first().click();
  await expect(page.getByTestId('hero-video-frame')).toBeVisible();
}

const ratioOf = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).first().boundingBox();
  expect(box, `${testId} should be laid out`).not.toBeNull();
  return box!.width / box!.height;
};

// ── FIX.MEDIA.1c render probes ──────────────────────────────────────────────
// The stub video never decodes, so originally EVERY surface reported
// `…;pending` and the parity assert matched trivially — nothing about the
// measured container aspect (the thing that actually broke) was ever
// exercised. Fake the clip's metadata at the prototype level instead: the
// resolver leaves its fallback, paints the explicit rectangle, and both the
// VALUES and the RENDER become assertable.

const CLIP = { w: 1080, h: 1920 }; // 9:16 portrait — the common phone clip
const CLIP_ASPECT = CLIP.w / CLIP.h;

async function primeVideoMetadata(page: Page) {
  await page.addInitScript(({ w, h }) => {
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => w });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => h });
  }, CLIP);
}

// The aborted stub never fires loadedmetadata on its own; dispatch it so
// React's onLoadedMetadata reads the faked dimensions. Media events don't
// bubble — React attaches them per-element, so a direct dispatch lands.
const fireVideoMetadata = (page: Page) =>
  page.evaluate(() => {
    document.querySelectorAll('video').forEach((v) => v.dispatchEvent(new Event('loadedmetadata')));
  });

/** The RENDER, not the values: the painted <video> rect vs its container. */
async function paintedProbe(page: Page, scopeSel: string) {
  const m = await page.evaluate((sel) => {
    const vid = document.querySelector(sel) as HTMLVideoElement | null;
    if (!vid) return null;
    const pb = (vid.parentElement as HTMLElement).getBoundingClientRect();
    const vb = vid.getBoundingClientRect();
    return {
      containerAspect: pb.width / pb.height,
      fillX: (vb.width / pb.width) * 100,
      fillY: (vb.height / pb.height) * 100,
      attr: vid.getAttribute('data-hero-framing'),
    };
  }, scopeSel);
  expect(m, `${scopeSel} should have a laid-out video`).not.toBeNull();
  return m!;
}

const CANVAS_VIDEO = '[data-testid="device-frame"] video[data-hero-framing]';
const PANEL_VIDEO = '[data-testid="hero-video-frame"] video';

test.describe('FIX.MEDIA.1 — hero framing', () => {
  // The frame is the shape the page publishes at — the same device-preset
  // geometry the crop dialog frames to (DP.1 / CROP.3a-C), not an arbitrary 44vh
  // box. It must TRACK the page style, so both are asserted: the two aspects are
  // far apart (0.81 vs 0.46), which is exactly the drift this replaces.
  for (const [style, aspect] of [
    ['hero', canonicalHeroAspect()],
    ['full_bleed', canonicalFullBleedAspect()],
  ] as const) {
    test(`the panel preview frame renders at the LIVE ${style} aspect`, async ({ page }) => {
      await installMocks(page, { style });
      await openVideoProfile(page);
      expect(await ratioOf(page, 'hero-video-frame')).toBeCloseTo(aspect, 1);
    });
  }

  test('the frame is the SAME shape empty and populated', async ({ page }) => {
    // Empty: an aspect-less dashed box used to sit here, so the preview
    // reshaped the moment a video landed. The frame is a constant now; only
    // its contents change.
    const { state } = await installMocks(page);
    await openVideoProfile(page);
    await expect(page.getByTestId('hero-video-frame').locator('video')).toHaveCount(0);
    const empty = await ratioOf(page, 'hero-video-frame');

    state.video = true;
    await openVideoProfile(page);
    await expect(page.getByTestId('hero-video-frame').locator('video')).toHaveCount(1);
    const withVideo = await ratioOf(page, 'hero-video-frame');

    expect(withVideo).toBeCloseTo(empty, 1);
  });

  test('tapping the frame opens the video picker', async ({ page }) => {
    await installMocks(page);
    await openVideoProfile(page);

    // The whole frame is the affordance — empty state included, which is the
    // only way a first-time user is told the box is actionable at all.
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('hero-video-frame').click();
    const fileChooser = await chooser;
    expect(fileChooser.isMultiple()).toBe(false);
  });

  // FIX.MEDIA.1c hardening: with real (faked) metadata the fingerprints carry
  // resolved rectangles, so `…;pending == …;pending` can no longer satisfy the
  // equality trivially — and the comparison now runs at BOTH page styles,
  // because full_bleed is exactly where the editing canvas used to diverge.
  for (const style of ['hero', 'full_bleed'] as PageStyle[]) {
    test(`a slider drag moves BOTH ${style} previews, and saves nothing`, async ({ page }, testInfo) => {
      const { writes } = await installMocks(page, { video: true, style });
      await primeVideoMetadata(page);
      await openVideoProfile(page);

      // Every VISIBLE framed video: the panel preview plus the page canvas
      // behind it. The CSS-hidden twin EPV (desktop/mobile branches are both
      // mounted) has a zero-size box, can never resolve a rectangle, and is
      // not a rendered surface — filter it out.
      const collect = async () => {
        await fireVideoMetadata(page);
        return page.evaluate(() =>
          Array.from(document.querySelectorAll('video[data-hero-framing]'))
            .filter((e) => e.getBoundingClientRect().width > 0)
            .map((e) => e.getAttribute('data-hero-framing')),
        );
      };
      await expect.poll(async () => {
        const attrs = await collect();
        return attrs.length >= 2 && attrs.every((a) => !!a && !a.includes('pending'));
      }, { message: 'every visible surface must resolve a real rectangle (no `pending`)' }).toBe(true);

      // Desktop: the editor frame renders the canonical default preset, so the
      // full fingerprint — rectangle included — is string-identical. Mobile:
      // the canvas is truthfully viewport-shaped while the panel frames to the
      // canonical preset (CROP.3a-C determinism), so the rectangles legitimately
      // differ there; the resolved FRAMING must still agree field-for-field.
      const key = (a: string | null) =>
        testInfo.project.name === 'desktop' ? a : (a || '').split(';').slice(0, 4).join(';');

      const before = await collect();
      expect(new Set(before.map(key)).size, `surfaces disagreed: ${JSON.stringify(before)}`).toBe(1);

      // Drag zoom. Real-time is the whole point: no Save, no debounce wait.
      const zoom = page.locator('input[type="range"]').first();
      await zoom.fill('1.8');

      const after = await collect();
      expect(new Set(after.map(key)).size, `surfaces disagreed after drag: ${JSON.stringify(after)}`).toBe(1);
      expect(after[0]).not.toEqual(before[0]);
      expect(after[0]!.startsWith('1.80;'), `expected the dragged zoom, got ${after[0]}`).toBe(true);

      // ...and it previewed without persisting. The debounced save is 400ms.
      await page.waitForTimeout(150);
      expect(writes).toEqual([]);
    });
  }

  // FIX.MEDIA.1c (A): edit chrome may reflow AROUND the media, but the hero
  // container's measured geometry may not move. The whole contract in two
  // numbers: the media fills the same fraction of its window in both modes.
  // Pre-1c the full_bleed editing canvas sized itself to the desktop window's
  // raw 100dvh instead of the device frame, so its rectangle tracked the
  // MONITOR, not the previewed phone.
  for (const style of ['hero', 'full_bleed'] as PageStyle[]) {
    test(`the editing canvas paints the same ${style} media rectangle as visitor mode`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'device frame is desktop-only');
      await installMocks(page, { video: true, style });
      await primeVideoMetadata(page);
      // A height no preset shares — a window-coupled canvas cannot pass by luck.
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard/editor');
      await page.waitForLoadState('networkidle');

      await fireVideoMetadata(page);
      await expect.poll(async () => (await paintedProbe(page, CANVAS_VIDEO)).attr).not.toContain('pending');
      const edit = await paintedProbe(page, CANVAS_VIDEO);

      await page.getByTestId('preview-mode-toggle').click();
      await fireVideoMetadata(page);
      await expect.poll(async () => (await paintedProbe(page, CANVAS_VIDEO)).attr).not.toContain('pending');
      const visitor = await paintedProbe(page, CANVAS_VIDEO);

      expect(Math.abs(edit.fillX - visitor.fillX), `fillX edit=${edit.fillX} visitor=${visitor.fillX}`).toBeLessThan(0.5);
      expect(Math.abs(edit.fillY - visitor.fillY), `fillY edit=${edit.fillY} visitor=${visitor.fillY}`).toBeLessThan(0.5);
      expect(edit.attr).toEqual(visitor.attr);
    });
  }

  // FIX.MEDIA.1c (B): the panel preview PAINTS the rectangle it declares.
  // Pre-1c the panel's measured aspect was read once at dashboard mount —
  // before the panel content existed — and stayed null forever, so the panel
  // rendered the object-fit fallback and the fingerprint said `pending` while
  // FIX.MEDIA.1's parity spec compared `pending` against `pending`.
  for (const style of ['hero', 'full_bleed'] as PageStyle[]) {
    test(`the panel preview paints the ${style} rectangle it declares`, async ({ page }) => {
      await installMocks(page, { video: true, style });
      await primeVideoMetadata(page);
      await openVideoProfile(page);

      await fireVideoMetadata(page);
      await expect.poll(async () => {
        await fireVideoMetadata(page);
        return (await paintedProbe(page, PANEL_VIDEO)).attr;
      }, { message: 'panel fingerprint must carry a resolved rectangle' }).not.toContain('pending');

      const p = await paintedProbe(page, PANEL_VIDEO);
      // Values are truthful: the declared rectangle is what the shared resolver
      // computes for the box's real measured shape and the clip's real aspect…
      const geo = resolveHeroGeometry(CLIP_ASPECT, p.containerAspect, { scale: 1, posX: 50, posY: 50 })!;
      // …and the render is the values: the painted rect IS that rectangle.
      expect(Math.abs(p.fillX - geo.widthPct), `painted ${p.fillX} vs resolved ${geo.widthPct}`).toBeLessThan(0.5);
      expect(Math.abs(p.fillY - geo.heightPct), `painted ${p.fillY} vs resolved ${geo.heightPct}`).toBeLessThan(0.5);
    });
  }

  // FIX.MEDIA.1c (B), live reference: same page state, panel preview vs the
  // public route. On desktop the public page renders in the stage at the
  // canonical default device — the same preset the panel frames to — so the
  // two surfaces must show the SAME fraction of the clip.
  for (const style of ['hero', 'full_bleed'] as PageStyle[]) {
    test(`the panel preview paints the same ${style} fill as the public page`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'compares against the desktop stage (canonical device)');
      await installMocks(page, { video: true, style });
      await primeVideoMetadata(page);
      await openVideoProfile(page);
      await fireVideoMetadata(page);
      await expect.poll(async () => {
        await fireVideoMetadata(page);
        return (await paintedProbe(page, PANEL_VIDEO)).attr;
      }).not.toContain('pending');
      const panel = await paintedProbe(page, PANEL_VIDEO);

      await page.goto('/joeyc');
      await page.waitForLoadState('networkidle');
      await fireVideoMetadata(page);
      await expect.poll(async () => {
        await fireVideoMetadata(page);
        return (await paintedProbe(page, 'video[data-hero-framing]')).attr;
      }).not.toContain('pending');
      const live = await paintedProbe(page, 'video[data-hero-framing]');

      expect(Math.abs(panel.fillX - live.fillX), `fillX panel=${panel.fillX} live=${live.fillX}`).toBeLessThan(0.5);
      expect(Math.abs(panel.fillY - live.fillY), `fillY panel=${panel.fillY} live=${live.fillY}`).toBeLessThan(0.5);
    });
  }

  test('the Video Profile menu no longer offers a photo button', async ({ page }) => {
    await installMocks(page);
    await openVideoProfile(page);
    // FIX.MEDIA.1 removed PHOTO.ROUTE.1's button: a photo's home is the camera
    // icon on the hero preview, and a second door read as redundant.
    await expect(page.getByTestId('hero-edit-photo')).toHaveCount(0);
  });
});

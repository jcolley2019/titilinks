import { test, expect, type Page, type Route } from '@playwright/test';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '../src/lib/device-presets';
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

  test('a slider drag moves BOTH previews, and saves nothing', async ({ page }) => {
    const { writes } = await installMocks(page, { video: true });
    await openVideoProfile(page);

    // Every <video> on screen: the panel preview, plus the live page preview
    // behind it. Both must carry a resolved-framing fingerprint.
    const framed = page.locator('video[data-hero-framing]');
    // At least two: the panel preview AND the page preview behind it. One alone
    // would make the equality below compare a surface with itself.
    await expect.poll(() => framed.count()).toBeGreaterThanOrEqual(2);
    const before = await framed.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-hero-framing')),
    );
    // Preview == live: every surface resolved the SAME framing at the SAME
    // container aspect, so the fingerprints are string-identical.
    expect(new Set(before).size, `surfaces disagreed: ${JSON.stringify(before)}`).toBe(1);

    // Drag zoom. Real-time is the whole point: no Save, no debounce wait.
    const zoom = page.locator('input[type="range"]').first();
    await zoom.fill('1.8');

    const after = await framed.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-hero-framing')),
    );
    expect(new Set(after).size, `surfaces disagreed after drag: ${JSON.stringify(after)}`).toBe(1);
    expect(after[0]).not.toEqual(before[0]);
    expect(after[0]!.startsWith('1.80;'), `expected the dragged zoom, got ${after[0]}`).toBe(true);

    // ...and it previewed without persisting. The debounced save is 400ms.
    await page.waitForTimeout(150);
    expect(writes).toEqual([]);
  });

  test('the Video Profile menu no longer offers a photo button', async ({ page }) => {
    await installMocks(page);
    await openVideoProfile(page);
    // FIX.MEDIA.1 removed PHOTO.ROUTE.1's button: a photo's home is the camera
    // icon on the hero preview, and a second door read as redundant.
    await expect(page.getByTestId('hero-edit-photo')).toHaveCount(0);
  });
});

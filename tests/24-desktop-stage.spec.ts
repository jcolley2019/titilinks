import { test, expect, type Page, type Route } from '@playwright/test';
import {
  DEVICE_PRESETS,
  DEFAULT_DEVICE_ID,
  canonicalFullBleedAspect,
  resolveDevicePreset,
} from '../src/lib/device-presets';
import type { PageStyle } from '../src/lib/theme-defaults';

/**
 * DESK.STAGE.1 — desktop visitors see the phone.
 *
 * The page is composed for a phone. Painted across a wide browser window its
 * full-bleed media covered a landscape box, so a portrait photo framed for a
 * phone was blown up and cropped to almost nothing. The page now renders
 * inside a phone-proportioned stage with an ambient blurred backdrop.
 *
 * The contract these specs defend:
 *   1. wide viewport  → a stage exists at the canonical device aspect, centred,
 *      with an ambient backdrop that is a static image (never a video);
 *   2. the page's own boxes — including the `fixed inset-0` full-bleed media
 *      layer — are confined to the stage rather than the window;
 *   3. PARITY — a staged desktop render resolves byte-identical
 *      `data-hero-framing` to the same page on a real 402x874 viewport, for
 *      BOTH page styles. That is the whole point: desktop == mobile;
 *   4. narrow viewport → no stage at all, exactly as before.
 *
 * Harness: reads are mocked so the page carries a hero photo with a KNOWN
 * aspect — an SVG data URI, which decodes with no network and gives the
 * resolver a real `naturalWidth/Height`. Without a decodable photo every
 * surface reports `pending` and a parity assertion would pass vacuously.
 */

/** 800x1200 portrait — the shape a phone hero is actually framed for. */
const HERO_PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='1200'%3E%3Crect width='800' height='1200' fill='%23c9a55c'/%3E%3C/svg%3E";

const HANDLE = '/joeyc';
const PRESET = resolveDevicePreset(DEFAULT_DEVICE_ID);
const PHONE = { width: PRESET.width, height: PRESET.height };

/** Tall enough that the stage reaches its natural preset size rather than
 *  shrinking to fit — required for the exact-parity comparison. */
const ROOMY_DESKTOP = { width: 1400, height: 1000 };

const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Reads pinned, writes swallowed. Stamps a hero photo and a chosen page style
 * onto whatever the real account returns — the test account's page carries no
 * hero media at all, so an un-stamped page would render nothing to measure.
 */
async function installMocks(page: Page, style: PageStyle, stageDeviceId?: string) {
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const res = await route.fetch();
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return route.fulfill({ response: res });
    }
    const stamp = (row: unknown) => {
      const r = row as Record<string, unknown>;
      if (!r || typeof r !== 'object' || !('theme_json' in r)) return row;
      const theme = { ...(r.theme_json as Record<string, unknown>) };
      // Per-page overrides outrank the profile default, so clear them before
      // pinning the style — otherwise the page keeps its own.
      delete theme.pages;
      delete theme.heroConfig_page2;
      return {
        ...r,
        avatar_url: HERO_PHOTO,
        theme_json: {
          ...theme,
          pageStyle: style,
          // Authoritative over avatar_url in the hero resolution order.
          header: { ...((theme.header as object) || {}), image_url: HERO_PHOTO },
          heroConfig: { fit: 'fill', posY: 25, posX: 50 },
          // DESK.STAGE.2 — omitted entirely unless a spec asks for one, so the
          // untouched-page path stays exactly what suite 24 always tested.
          ...(stageDeviceId === undefined ? {} : { desktopStage: { deviceId: stageDeviceId } }),
        },
      };
    };
    return asJson(route, Array.isArray(body) ? body.map(stamp) : stamp(body));
  });

  for (const tbl of ['modes', 'blocks', 'block_items']) {
    await page.route(`**/rest/v1/${tbl}*`, async (route) => {
      if (route.request().method() === 'GET') return route.continue();
      return route.fulfill({ status: 204, body: '' });
    });
  }
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700);
}

/**
 * A real phone's scrollbar is an overlay and takes no layout space; a desktop
 * browser's classic scrollbar steals ~15px from the ICB, which would shrink
 * the `fixed inset-0` layer and make an otherwise-identical render differ.
 * Suppressing it makes the phone-sized comparison faithful to a real device.
 */
async function emulateOverlayScrollbars(page: Page) {
  await page.addStyleTag({
    content: 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}',
  });
}

const framingOf = (page: Page) =>
  page.locator('[data-hero-framing]').first().getAttribute('data-hero-framing');

test.describe('DESK.STAGE.1 — desktop stage', () => {
  test('wide viewport renders a phone-aspect stage with an ambient backdrop', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only surface');
    await installMocks(page, 'full_bleed');

    await page.setViewportSize(ROOMY_DESKTOP);
    await page.goto(HANDLE);
    await settle(page);

    const stage = page.getByTestId('desk-stage');
    await expect(stage).toBeVisible();

    // The stage is the phone: preset-derived, not an invented shape.
    const box = (await stage.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(canonicalFullBleedAspect(), 2);
    expect(Math.round(box.height)).toBe(PRESET.height);
    expect(Math.round(box.width)).toBe(PRESET.width);

    // Centred, and nowhere near filling the window.
    expect(box.x + box.width / 2).toBeCloseTo(ROOMY_DESKTOP.width / 2, 0);
    expect(box.width).toBeLessThan(ROOMY_DESKTOP.width / 2);

    // Ambient backdrop fills the window behind it, from the page's own photo,
    // blurred. Static by design — a decorative video would cost battery.
    const backdrop = page.getByTestId('desk-stage-backdrop');
    await expect(backdrop).toBeVisible();
    expect(Math.round((await backdrop.boundingBox())!.width)).toBe(ROOMY_DESKTOP.width);
    expect(await backdrop.locator('video').count()).toBe(0);
    const blurred = backdrop.locator('img').first();
    await expect(blurred).toHaveAttribute('src', HERO_PHOTO);
    await expect(blurred).toHaveCSS('filter', /blur/);
  });

  test('the fixed full-bleed media layer is confined to the stage', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only surface');
    await installMocks(page, 'full_bleed');

    await page.setViewportSize(ROOMY_DESKTOP);
    await page.goto(HANDLE);
    await settle(page);

    const stageBox = (await page.getByTestId('desk-stage').boundingBox())!;

    // The hero window sizes to the stage, not the viewport. DP.2's `--pv-vh`
    // is what carries this: the stage publishes its own hundredth-of-height,
    // so `calc(var(--pv-vh) * 50 + 60px)` means half the STAGE. This is the
    // desktop counterpart of the unstaged fence in 15-preview-units.spec.ts.
    const heroBox = (await page.getByTestId('hero-sticky').first().boundingBox())!;
    expect(heroBox.width).toBeCloseTo(stageBox.width, 0);
    expect(heroBox.x).toBeCloseTo(stageBox.x, 0);
    const HERO_EXTRA = 60;
    const HERO_CAP = 500;
    const expectedHero = Math.min(stageBox.height * 0.5 + HERO_EXTRA, HERO_CAP + HERO_EXTRA);
    expect(heroBox.height).toBeCloseTo(expectedHero, 0);

    // The real test of the transform containing-block trick: the full-bleed
    // layer is `fixed inset-0`, so its box proves what "the viewport" resolved
    // to. It must be the stage (402x874), not the window (1400x1000).
    //
    // Asserted on the LAYER, not the media inside it: a cover-filled photo is
    // supposed to overflow its container and be clipped by `overflow: hidden`,
    // so the media's own layout box legitimately extends past the stage.
    const framed = page.locator('[data-hero-framing]');
    expect(await framed.count()).toBeGreaterThan(0);
    const layerBox = (await framed.first().locator('xpath=..').boundingBox())!;
    expect(layerBox.x).toBeCloseTo(stageBox.x, 0);
    expect(layerBox.y).toBeCloseTo(stageBox.y, 0);
    expect(layerBox.width).toBeCloseTo(stageBox.width, 0);
    expect(layerBox.height).toBeCloseTo(stageBox.height, 0);
  });

  for (const style of ['full_bleed', 'hero'] as PageStyle[]) {
    test(`PARITY (${style}) — staged desktop framing equals real-phone framing`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'needs one browser at two sizes');
      await installMocks(page, style);

      // Staged, at the preset's natural size.
      await page.setViewportSize(ROOMY_DESKTOP);
      await page.goto(HANDLE);
      await settle(page);
      await expect(page.getByTestId('desk-stage')).toBeVisible();
      const staged = await framingOf(page);

      // Unstaged, on a viewport that IS the preset — below the breakpoint, so
      // no stage and no --pv-vh: the plain narrow render path.
      await page.setViewportSize(PHONE);
      await page.reload();
      await settle(page);
      await emulateOverlayScrollbars(page);
      await page.waitForTimeout(200);
      await expect(page.getByTestId('desk-stage')).toHaveCount(0);
      const phone = await framingOf(page);

      // Not `pending` — a vacuous parity pass is worse than a failure.
      expect(staged).toBeTruthy();
      expect(staged).not.toContain('pending');
      expect(staged).toBe(phone);
    });
  }

  test('narrow viewport renders no stage and keeps the full-viewport page', async ({
    page,
  }, testInfo) => {
    // Runs in BOTH projects: the mobile project proves the real device is
    // untouched, the desktop project proves the breakpoint releases correctly.
    await installMocks(page, 'full_bleed');
    if (testInfo.project.name === 'desktop') await page.setViewportSize(PHONE);

    await page.goto(HANDLE);
    await settle(page);

    await expect(page.getByTestId('desk-stage')).toHaveCount(0);
    await expect(page.getByTestId('desk-stage-backdrop')).toHaveCount(0);

    // The hero still spans the whole viewport width, as it always has.
    const vw = page.viewportSize()!.width;
    const heroBox = (await page.getByTestId('hero-sticky').first().boundingBox())!;
    expect(heroBox.width).toBeGreaterThan(vw * 0.9);
  });
});

/**
 * DESK.STAGE.2 — the stage device is the page OWNER's choice.
 *
 * theme_json.desktopStage.deviceId names a DEVICE_PRESETS entry; the stage
 * renders at THAT preset's real logical size. The key is structural: absent
 * means the default (every pre-DESK.STAGE.2 page is a no-op) and an unknown id
 * degrades to the default silently rather than breaking the page.
 *
 * Parity numbers below are read from the catalog, never hardcoded — the same
 * table the panel lists and the crop aspects derive from.
 */
const ALT = resolveDevicePreset('galaxy-s26-ultra');

test.describe('DESK.STAGE.2 — owner-selected stage device', () => {
  test('the stage renders at the chosen preset, not the default', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only surface');
    // Sanity: the fixture really is a different phone, or this proves nothing.
    expect(ALT.id).not.toBe(PRESET.id);
    expect(ALT.height).not.toBe(PRESET.height);

    await installMocks(page, 'full_bleed', ALT.id);
    await page.setViewportSize(ROOMY_DESKTOP);
    await page.goto(HANDLE);
    await settle(page);

    const stage = page.getByTestId('desk-stage');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute('data-device-id', ALT.id);

    // The chosen preset's REAL dimensions, and its aspect — not the default's.
    const box = (await stage.boundingBox())!;
    expect(Math.round(box.width)).toBe(ALT.width);
    expect(Math.round(box.height)).toBe(ALT.height);
    expect(box.width / box.height).toBeCloseTo(canonicalFullBleedAspect(ALT.id), 2);
    expect(Math.round(box.height)).not.toBe(PRESET.height);

    // The page's own boxes follow the stage, so the choice is real end-to-end.
    const heroBox = (await page.getByTestId('hero-sticky').first().boundingBox())!;
    expect(heroBox.width).toBeCloseTo(box.width, 0);
  });

  test('an unknown device id falls back to the default stage silently', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only surface');
    await installMocks(page, 'full_bleed', 'nokia-3310-xl');
    await page.setViewportSize(ROOMY_DESKTOP);
    await page.goto(HANDLE);
    await settle(page);

    const stage = page.getByTestId('desk-stage');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute('data-device-id', DEFAULT_DEVICE_ID);
    const box = (await stage.boundingBox())!;
    expect(Math.round(box.width)).toBe(PRESET.width);
    expect(Math.round(box.height)).toBe(PRESET.height);
  });

  test('a page with no desktopStage key renders the default stage', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop-only surface');
    await installMocks(page, 'full_bleed'); // key omitted entirely
    await page.setViewportSize(ROOMY_DESKTOP);
    await page.goto(HANDLE);
    await settle(page);

    await expect(page.getByTestId('desk-stage')).toHaveAttribute('data-device-id', DEFAULT_DEVICE_ID);
  });

  test('a chosen device changes nothing for a phone visitor', async ({ page }, testInfo) => {
    // Both projects: the setting is desktop-only by construction.
    await installMocks(page, 'full_bleed', ALT.id);
    if (testInfo.project.name === 'desktop') await page.setViewportSize(PHONE);

    await page.goto(HANDLE);
    await settle(page);

    await expect(page.getByTestId('desk-stage')).toHaveCount(0);
    const vw = page.viewportSize()!.width;
    const heroBox = (await page.getByTestId('hero-sticky').first().boundingBox())!;
    expect(heroBox.width).toBeGreaterThan(vw * 0.9);
  });
});

/**
 * DESK.STAGE.2 — the Desktop view panel (Style group).
 *
 * Non-destructive: reads pass through to real Supabase, every write is captured
 * and swallowed, so the real page is never mutated. The assertion is the PATCH
 * body — that is the contract the public stage reads back.
 */
async function installEditorMocks(page: Page) {
  const patches: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/pages*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.continue();
    if (method === 'PATCH') patches.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: '' });
  });
  for (const tbl of ['modes', 'blocks', 'block_items']) {
    await page.route(`**/rest/v1/${tbl}*`, async (route) => {
      if (route.request().method() === 'GET') return route.continue();
      return route.fulfill({ status: 204, body: '' });
    });
  }
  return patches;
}

async function openDesktopViewPanel(page: Page, editLabel: string | RegExp, rowLabel: RegExp) {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: editLabel }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: rowLabel }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('desktop-view-panel')).toBeVisible();
}

test.describe('DESK.STAGE.2 — Desktop view panel', () => {
  test('lists the device catalog, marks the default, and persists a pick', async ({ page }) => {
    const patches = await installEditorMocks(page);
    await openDesktopViewPanel(page, 'Edit Profile', /desktop view/i);

    // One row per catalog entry — the panel reuses DEVICE_PRESETS, so a preset
    // added there shows up here with no second list to update.
    await expect(page.locator('[data-testid^="desktop-view-option-"]')).toHaveCount(
      DEVICE_PRESETS.length,
    );

    // A page with no stored choice shows the default selected.
    const defaultOption = page.getByTestId(`desktop-view-option-${DEFAULT_DEVICE_ID}`);
    await expect(defaultOption).toHaveAttribute('aria-pressed', 'true');
    await expect(defaultOption).toContainText('Default');

    // Nothing is written until Save — the row tap only moves the draft.
    const target = page.getByTestId(`desktop-view-option-${ALT.id}`);
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
    await expect(defaultOption).toHaveAttribute('aria-pressed', 'false');
    expect(patches.length).toBe(0);

    await page.getByTestId('desktop-view-save').click();
    await expect.poll(() => patches.length).toBeGreaterThan(0);

    const theme = patches.at(-1)!.theme_json as Record<string, any>;
    expect(theme.desktopStage).toEqual({ deviceId: ALT.id });
    // Merge-safe: the write carries the rest of the theme, never a bare replace.
    expect(Object.keys(theme).length).toBeGreaterThan(1);
  });

  test('ES: the panel renders in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await installEditorMocks(page);
    await openDesktopViewPanel(page, /editar perfil/i, /vista de escritorio/i);

    await expect(page.getByTestId('desktop-view-panel')).toContainText(
      'marco con forma de teléfono',
    );
    await expect(page.getByTestId(`desktop-view-option-${DEFAULT_DEVICE_ID}`)).toContainText(
      'Predeterminado',
    );
    await expect(page.getByTestId('desktop-view-save')).toHaveText('Guardar');
  });
});

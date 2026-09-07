// DP.2 Task A — the visitor-preview toggle.
//
// The editor's device frame and its top-bar toggle are DESKTOP-only chrome
// (lg:block), so every test forces a desktop-width viewport and scopes its
// assertions to the frame. This is deliberately NOT gated with test.skip: the
// frame is width-gated, not project-gated, so widening the viewport lets the
// spec run under BOTH the desktop and mobile projects without adding to the
// skip count. All frame queries are scoped to getByTestId('device-frame') so the
// hidden lg:hidden mobile render (also in the DOM) can never satisfy them.
//
// Mechanism under test: visitor mode renders the SAME shared EditableProfileView
// in view mode (editMode=false) — the exact public path — rather than an iframe.
// Two things must hold: (1) the editing chrome disappears; (2) public 18+ gating
// takes over, so a gated destination that the editor is exempted to show is
// stripped from the DOM the instant the creator previews as a visitor.

import { test, expect, type Page } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

const DESKTOP = { width: 1440, height: 1000 };
const PROFILE = `/${TEST_HANDLE}`;

// Fixture identifiers (fixture-injection precedent: tests/04-adult-gate.spec.ts).
const LINKS_BLOCK_ID = 'dp2-links-block';
const GATED_CARD_ID = 'dp2-card-gated';
const ONLYFANS_URL = 'https://onlyfans.com/dp2-creator';

// Seed one enabled links block carrying a single gated card onto the editor's
// data reads. The real pages/modes rows load from the database; only the
// blocks/block_items reads are answered with a fixture, so the whole editor
// render path stays exactly as it ships. Non-GET writes (the editor's
// ensure-default-blocks inserts) are no-oped so they cannot mutate real data.
const seedGatedLinksBlock = async (page: Page) => {
  let modeId = '';

  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [];
    modeId = (arr.find((m) => m?.type === 'page1') ?? arr[0])?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') {
      // ensure-default-blocks inserts — swallow, never touch the real table.
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      json: [
        { id: LINKS_BLOCK_ID, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 0 },
      ],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      json: [
        // THE RULING (Joey): flagged is_adult=false, but the domain is adult, so
        // it must gate on the PUBLIC surface no matter what the flag says.
        { id: GATED_CARD_ID, block_id: LINKS_BLOCK_ID, label: 'Gated Card', url: ONLYFANS_URL, is_adult: false, order_index: 0, subtitle: null, badge: null, image_url: null, size: 'medium', style_json: null },
      ],
    });
  });
};

test.describe('Editor visitor-preview toggle (DP.2 Task A)', () => {
  test('visitor mode strips the editing chrome the editor shows', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    const toggle = page.getByTestId('preview-mode-toggle');
    await expect(frame).toBeVisible();

    // Edit mode: the hero carries its edit-only "New photo" control.
    await expect(frame.getByTitle('New photo')).toBeVisible();

    // Flip to visitor: that edit-only control is gone (public chrome only).
    await toggle.click();
    await expect(frame.getByTitle('New photo')).toHaveCount(0);

    // Session toggle, no reload: flipping back restores the editing chrome.
    await toggle.click();
    await expect(frame.getByTitle('New photo')).toBeVisible();
  });

  test('the toggle flips 18+ gating: exempt href in edit, stripped in visitor', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedGatedLinksBlock(page);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    const toggle = page.getByTestId('preview-mode-toggle');
    const gatedCard = frame.locator('a', { hasText: 'Gated Card' }).first();

    // Edit mode is exempt — the editor needs its real links, so the adult URL
    // is present in this private, authenticated surface.
    await expect(gatedCard).toHaveAttribute('href', ONLYFANS_URL);
    expect(await frame.innerHTML()).toContain('onlyfans.com');

    // Preview as a visitor: the SAME item is now stripped — no adult href, and
    // no adult host anywhere in the frame DOM. This is the compliance self-check.
    await toggle.click();
    const visitorCard = frame.locator('a', { hasText: 'Gated Card' }).first();
    await expect(visitorCard).toBeVisible();
    await expect(visitorCard).not.toHaveAttribute('href', /.*/);
    expect(await frame.innerHTML()).not.toContain('onlyfans.com');
  });
});

// ── TL.PREV.HDR.1 — the public fade-in header inside the phone preview ───────
//
// Live public pages carry a header that is transparent at the top and fades
// to solid on scroll (name left, Save-Contact right; full-bleed pages get a
// gradient scrim instead of the fill). It lived only in PublicProfile.tsx, so
// when DP.2 moved visitor preview off the real public page (2026-07-18) the
// header vanished from the editor: the on-canvas name scrolled off and nothing
// replaced it. TL.PREV.HDR.1 extracts it to src/components/PublicHeader.tsx and
// mounts it in the desktop device frame in BOTH modes, driven by the frame's own
// scroller (`device-frame-scroll`), positioned absolute against the frame.
//
// Same viewport reasoning as above: the frame is width-gated, so both projects
// run these at a desktop width — no skips. The battery page is a HERO page
// (theme_json.pageStyle = 'hero'), so the background alpha is the fill and the
// full-bleed scrim is absent; the assertions say so explicitly rather than
// branching, because a silent branch would let a style flip pass vacuously.
//
// Screenshots for Joey's visual gate land in tests/screenshots (gitignored):
// prev-hdr-{edit,visitor,live}-{top,scrolled}.png.

const SCROLL_PX = 400;

/** rgba alpha of the header's computed background-color (0 for transparent). */
const bgAlpha = (page: Page, header: ReturnType<Page['getByTestId']>) =>
  header.evaluate((el) => {
    const c = getComputedStyle(el).backgroundColor;
    const m = c.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+))?\s*\)/);
    if (!m) return c === 'transparent' ? 0 : NaN;
    return m[1] === undefined ? 1 : parseFloat(m[1]);
  });

const nameOpacity = (name: ReturnType<Page['getByTestId']>) =>
  name.evaluate((el) => parseFloat(getComputedStyle(el).opacity));

/** The header inside a scope (frame or page), plus its name wrapper. */
const headerIn = (scope: ReturnType<Page['getByTestId']> | Page) => ({
  header: scope.getByTestId('public-header'),
  name: scope.getByTestId('public-header-name'),
});

/** Assert the resting state: transparent fill, invisible name, button present. */
async function expectHeaderAtTop(page: Page, scope: ReturnType<Page['getByTestId']> | Page) {
  const { header, name } = headerIn(scope);
  await expect(header, 'the header is mounted').toBeAttached();
  expect(await bgAlpha(page, header), 'background alpha 0 at scrollTop 0').toBeCloseTo(0, 2);
  expect(await nameOpacity(name), 'name opacity 0 at scrollTop 0').toBeCloseTo(0, 2);
  await expect(header.locator('button'), 'the save-contact button is drawn').toBeVisible();
  await expect(scope.locator('[aria-hidden="true"].z-40'), 'hero page: no full-bleed scrim').toHaveCount(0);
}

/** Assert the scrolled state: solid fill, legible name, name matches the canvas. */
async function expectHeaderScrolled(page: Page, scope: ReturnType<Page['getByTestId']> | Page, expectedName: string) {
  const { header, name } = headerIn(scope);
  await expect.poll(() => nameOpacity(name), { message: 'name fades in by 400px' }).toBeGreaterThanOrEqual(0.9);
  expect(await bgAlpha(page, header), 'background alpha ≥ 0.9 by 400px').toBeGreaterThanOrEqual(0.9);
  await expect(name, 'the header name is the on-canvas display name').toHaveText(expectedName);
}

test.describe('TL.PREV.HDR.1 — fade-in header in the phone preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('device-frame')).toBeVisible();
  });

  for (const mode of ['edit', 'visitor'] as const) {
    test(`${mode} mode: header is transparent at the top and fades in by ${SCROLL_PX}px of frame scroll`, async ({ page }) => {
      const frame = page.getByTestId('device-frame');
      if (mode === 'visitor') {
        await page.getByTestId('preview-mode-toggle').click();
        await expect(frame.getByTitle('New photo')).toHaveCount(0);
      }
      const scroller = frame.getByTestId('device-frame-scroll');
      // The on-canvas name — same draft source as the header. Edit mode renders
      // it as the inline-editable <input> (its placeholder is the @handle);
      // visitor mode renders the public <h1>.
      const canvasName = mode === 'edit'
        ? (await frame.locator('input[type="text"]').first().inputValue()).trim()
        : (await frame.locator('h1').first().innerText()).trim();
      expect(canvasName, 'the battery page has an on-canvas name').not.toBe('');

      // (a) resting
      expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
      await expectHeaderAtTop(page, frame);
      // The header must be a SIBLING of the scroller (frame-anchored), not
      // content that scrolls away with the page.
      expect(await scroller.locator('[data-testid="public-header"]').count(), 'header is not inside the scroller').toBe(0);
      await frame.screenshot({ path: `tests/screenshots/prev-hdr-${mode}-top.png` });

      // (b) scrolled 400px inside the frame
      await scroller.evaluate((el, px) => { el.scrollTop = px; }, SCROLL_PX);
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThanOrEqual(SCROLL_PX - 1);
      await expectHeaderScrolled(page, frame, canvasName);
      await frame.screenshot({ path: `tests/screenshots/prev-hdr-${mode}-scrolled.png` });

      // In edit mode the button is inert and the header lets clicks through to
      // EPV's top-right camera/pencil overlays; in visitor mode it is live.
      const btn = frame.getByTestId('public-header').locator('button');
      if (mode === 'edit') {
        await expect(btn).toBeDisabled();
        await expect(frame.getByTestId('public-header')).toHaveClass(/pointer-events-none/);
      } else {
        await expect(btn).toBeEnabled();
      }
    });
  }
});

// (d) The live public page — anonymous, window-scrolled at a phone width so the
// DesktopStage does not engage. Proves the extraction changed nothing.
test.describe('TL.PREV.HDR.1 — live public header unchanged by the extraction', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`anonymous /${TEST_HANDLE}: header fades in by ${SCROLL_PX}px of window scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');

    const canvasName = (await page.locator('h1').first().innerText()).trim();
    expect(canvasName).not.toBe('');

    await expectHeaderAtTop(page, page);
    // The public page keeps `fixed` positioning (viewport-anchored).
    await expect(page.getByTestId('public-header')).toHaveClass(/\bfixed\b/);
    await page.screenshot({ path: 'tests/screenshots/prev-hdr-live-top.png' });

    await page.evaluate((px) => window.scrollTo(0, px), SCROLL_PX);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(SCROLL_PX - 1);
    await expectHeaderScrolled(page, page, canvasName);
    await page.screenshot({ path: 'tests/screenshots/prev-hdr-live-scrolled.png' });
  });
});

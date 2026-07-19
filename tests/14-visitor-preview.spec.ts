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

import { test, expect } from '@playwright/test';

const DESKTOP = { width: 1440, height: 1000 };
const PROFILE = '/joeyc';

// Fixture identifiers (fixture-injection precedent: tests/04-adult-gate.spec.ts).
const LINKS_BLOCK_ID = 'dp2-links-block';
const GATED_CARD_ID = 'dp2-card-gated';
const ONLYFANS_URL = 'https://onlyfans.com/dp2-creator';

// Seed one enabled links block carrying a single gated card onto the editor's
// data reads. The real pages/modes rows load from the database; only the
// blocks/block_items reads are answered with a fixture, so the whole editor
// render path stays exactly as it ships. Non-GET writes (the editor's
// ensure-default-blocks inserts) are no-oped so they cannot mutate real data.
const seedGatedLinksBlock = async (page: import('@playwright/test').Page) => {
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

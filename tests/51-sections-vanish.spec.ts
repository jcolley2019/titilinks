// TL.SECT.1 — the edit canvas treats block toggles honestly.
//
// A block toggled OFF renders nowhere publicly, so it renders nowhere in the
// phone preview either: its whole SortablePreviewCard (control bar, toggle and
// all) vanishes instead of dimming to opacity-40. Re-enabling is the Sections
// rail's job (TL.SECT.2); this spec pins the vanish half plus its live edge —
// flipping a visible card's toggle removes the card without a reload.
//
// Fixture-injection precedent: tests/14-visitor-preview.spec.ts. The real
// pages/modes rows load from the database; only the blocks/block_items reads
// are answered with a fixture so the editor render path stays exactly as it
// ships. Non-GET writes (ensure-default-blocks inserts, the toggle's PATCH)
// are swallowed so nothing touches real data. The blocks route is param-aware:
// the TL.EVNT.SGL graft probe (`type=in.…`) gets an empty list, otherwise the
// fixture list would be re-served to it and grafted in as duplicates.
//
// Desktop-width viewport on purpose (14's convention): the device frame is
// width-gated (lg:block), so widening the viewport lets the spec run under both
// the desktop and mobile projects, and scoping every query to
// getByTestId('device-frame') keeps the hidden mobile render out of reach.

import { test, expect, type Page } from './fixtures';

const DESKTOP = { width: 1440, height: 1000 };

// Fixture identifiers.
const LINKS_BLOCK_ID = 'sect1-links-block';
const TEXT_BLOCK_ID = 'sect1-text-block';
const VISIBLE_CARD_LABEL = 'SECT1 Visible Card';

// One ENABLED links block (with a card, so the body renders content) and one
// DISABLED text block. `text` is many-per-mode, so the fixture can never trip
// client-side singleton handling.
const seedToggledBlocks = async (page: Page) => {
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
      // ensure-default-blocks inserts and the toggle's PATCH — swallow, never
      // touch the real table.
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (route.request().url().includes('type=in.')) {
      // TL.EVNT.SGL page-singleton graft probe — nothing to graft.
      return route.fulfill({ json: [] });
    }
    return route.fulfill({
      json: [
        { id: LINKS_BLOCK_ID, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 0 },
        { id: TEXT_BLOCK_ID, mode_id: modeId, type: 'text', title: null, is_enabled: false, order_index: 1 },
      ],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      json: [
        { id: 'sect1-card-1', block_id: LINKS_BLOCK_ID, label: VISIBLE_CARD_LABEL, url: 'https://example.com/sect1', is_adult: false, order_index: 0, subtitle: null, badge: null, image_url: null, size: 'medium', style_json: null },
      ],
    });
  });
};

test.describe('Edit canvas hides disabled blocks (TL.SECT.1)', () => {
  test('a disabled block renders no card at all; enabled blocks keep theirs', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedToggledBlocks(page);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    await expect(frame).toBeVisible();

    // The enabled links block renders its card: control-bar type label + body.
    await expect(frame.getByText('Featured Links', { exact: true })).toBeVisible();
    await expect(frame.getByText(VISIBLE_CARD_LABEL)).toBeVisible();

    // The disabled text block renders NOTHING — not a dimmed card, no control
    // bar. Its type label is the card's one guaranteed rendering, so its
    // absence inside the frame is the vanish.
    await expect(frame.getByText('Text', { exact: true })).toHaveCount(0);
  });

  test('flipping a visible card\'s toggle off vanishes it live, no reload', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await seedToggledBlocks(page);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    await expect(frame.getByText(VISIBLE_CARD_LABEL)).toBeVisible();

    // The links card is the only canvas card (the text block vanished), so the
    // frame holds exactly one control-bar toggle (the 33px pill).
    const toggle = frame.locator('button[class*="w-[33px]"]');
    await expect(toggle).toHaveCount(1);
    await toggle.click();

    // Optimistic vanish: card gone, toggle gone with it, canvas card-free.
    await expect(frame.getByText(VISIBLE_CARD_LABEL)).toHaveCount(0);
    await expect(frame.getByText('Featured Links', { exact: true })).toHaveCount(0);
    await expect(toggle).toHaveCount(0);
  });
});

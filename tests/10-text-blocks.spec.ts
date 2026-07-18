// TEXT.1 — standalone text blocks on the public page.
//
// Same constraint as 04-adult-gate: the harness runs against the real Supabase
// project with no seeding hook, so a spec cannot author two real text blocks on
// a profile and then delete one through the auth-gated editor. The public render
// path is what TEXT.1 must prove, so we assert it directly with the same
// fixture-injection precedent: the real modes row loads, and the blocks/items
// reads are answered with a fixture. That keeps the whole render path —
// PublicProfile -> EditableProfileView -> the text block(s) — exactly as it
// ships, while pinning the two invariants that matter:
//
//   1. N standalone text blocks each render, in block order (order_index).
//   2. Removing a block removes exactly its render; the others are untouched.
//
// (The editor-side add/toggle/delete UI is exercised manually — it needs auth +
// a DB write the harness can't reach — but every path it drives resolves to one
// of these two public invariants, which are covered here.)

import { test, expect } from '@playwright/test';

const PROFILE = '/joeyc';

// Distinct, collision-proof markers so a match is unambiguously our fixture.
const ALPHA_HEADING = 'TEXTBLOCK_ALPHA_HEADING';
const ALPHA_BODY = 'textblock alpha body copy';
const BRAVO_HEADING = 'TEXTBLOCK_BRAVO_HEADING';
const BRAVO_BODY = 'textblock bravo body copy';

const textConfig = (heading: string, body: string) => JSON.stringify({ heading, body });

// Route the real modes through, capturing an id to hang the block fixture off,
// then answer blocks with the given rows and block_items with nothing (text
// blocks carry no items — their content is JSON in blocks.title).
const seedTextBlocks = async (
  page: import('@playwright/test').Page,
  rows: (modeId: string) => unknown[],
) => {
  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    modeId = Array.isArray(body) ? body[0]?.id ?? '' : '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });
  await page.route('**/rest/v1/blocks*', async (route) => {
    await route.fulfill({ json: rows(modeId) });
  });
  await page.route('**/rest/v1/block_items*', async (route) => {
    await route.fulfill({ json: [] });
  });
};

const gotoWith = async (
  page: import('@playwright/test').Page,
  rows: (modeId: string) => unknown[],
) => {
  await seedTextBlocks(page, rows);
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
};

const textBlock = (id: string, modeId: string, heading: string, body: string, order: number) => ({
  id,
  mode_id: modeId,
  type: 'text',
  title: textConfig(heading, body),
  is_enabled: true,
  order_index: order,
});

test.describe('public profile — standalone text blocks', () => {
  test('two text blocks both render, in block order', async ({ page }) => {
    await gotoWith(page, (modeId) => [
      textBlock('tb-alpha', modeId, ALPHA_HEADING, ALPHA_BODY, 0),
      textBlock('tb-bravo', modeId, BRAVO_HEADING, BRAVO_BODY, 1),
    ]);

    const alpha = page.getByText(ALPHA_HEADING);
    const bravo = page.getByText(BRAVO_HEADING);
    await expect(alpha).toBeVisible();
    await expect(bravo).toBeVisible();
    // Bodies render too — the block is heading + paragraph.
    await expect(page.getByText(ALPHA_BODY)).toBeVisible();
    await expect(page.getByText(BRAVO_BODY)).toBeVisible();

    // Order proof: order_index 0 sits above order_index 1 in the rendered DOM.
    const aBox = await alpha.boundingBox();
    const bBox = await bravo.boundingBox();
    expect(aBox).not.toBeNull();
    expect(bBox).not.toBeNull();
    expect(aBox!.y).toBeLessThan(bBox!.y);
  });

  test('deleting a block removes exactly its render; the other remains', async ({ page }) => {
    // The post-delete state: only Bravo survives on the page.
    await gotoWith(page, (modeId) => [
      textBlock('tb-bravo', modeId, BRAVO_HEADING, BRAVO_BODY, 1),
    ]);

    await expect(page.getByText(BRAVO_HEADING)).toBeVisible();
    // Alpha's heading and body are both gone — nothing of the deleted block
    // lingers anywhere in the DOM.
    await expect(page.getByText(ALPHA_HEADING)).toHaveCount(0);
    expect(await page.content()).not.toContain(ALPHA_BODY);
  });
});

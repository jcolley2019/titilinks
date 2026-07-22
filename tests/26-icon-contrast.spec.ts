// ICON.CONTRAST.1 — icon glyphs never vanish.
//
// Public probes reuse the 11-icon-row fixture-injection precedent (real page +
// modes rows, blocks/block_items answered with a fixture, theme_json patched
// per spec). The glyph tint resolves through resolveGlyphColor (PlatformIcon):
// in color mode a brand color that clashes with an opaque circle background
// flips to the contrasting monochrome; black/white modes flip the same way
// when saved same-on-same, so an already-saved invalid combo renders safe.
// react-icons puts the resolved tint on the svg's style.color (fill is
// currentColor), so the computed `color` of the svg IS the glyph color.
//
// The editor spec drives the real Icon Color / Icon Background chip groups and
// asserts the same-on-same combos are disabled with the "no contrast" hint.
// pages PATCHes are stubbed so the shared test account is never mutated.

import { test, expect } from '@playwright/test';
import { translations } from '../src/hooks/useLanguage';

const PROFILE = '/joeyc';
const BLOCK_ID = 'ic-social-block';

// Patch page.theme_json.headerConfig, pass the real modes through, then answer
// blocks/block_items with the fixture (same shape as 11-icon-row).
const seedIcons = async (
  page: import('@playwright/test').Page,
  headerConfig: Record<string, unknown>,
  labels: string[],
) => {
  await page.route('**/rest/v1/pages*', async (route) => {
    const res = await route.fetch();
    let body = await res.json();
    const patch = (p: any) => {
      if (!p || typeof p !== 'object') return p;
      const theme = { ...(p.theme_json || {}) };
      theme.headerConfig = { ...(theme.headerConfig || {}), ...headerConfig };
      return { ...p, theme_json: theme };
    };
    body = Array.isArray(body) ? body.map(patch) : patch(body);
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const rows = Array.isArray(body) ? body : [body];
    modeId = rows.find((m: any) => m?.type === 'page1')?.id ?? rows[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    await route.fulfill({
      json: [{ id: BLOCK_ID, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 }],
    });
  });
  await page.route('**/rest/v1/block_items*', async (route) => {
    await route.fulfill({
      json: labels.map((label, i) => ({
        id: `ic-${label.toLowerCase()}`, block_id: BLOCK_ID, label,
        url: `https://example.com/${i}`, is_adult: false, order_index: i,
        subtitle: null, badge: null, image_url: null,
      })),
    });
  });
};

const gotoSeeded = async (page: import('@playwright/test').Page) => {
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
};

const glyph = (page: import('@playwright/test').Page, label: string) =>
  page.locator(`a[title="${label}"] svg`).first();

// ─── 1. Color mode + white circle: clashing glyphs flip, brands survive ──────

test.describe('icon contrast — color mode on a white circle', () => {
  test('TikTok (white glyph) renders dark; Instagram keeps its brand color', async ({ page }) => {
    await seedIcons(page, { iconColorMode: 'color', iconBgStyle: 'white' }, ['TikTok', 'Instagram']);
    await gotoSeeded(page);
    // The circle really is white (the invisible-glyph precondition).
    await expect(page.locator('a[title="TikTok"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    // White-glyph brand → contrasting monochrome, never white-on-white.
    await expect(glyph(page, 'TikTok')).toHaveCSS('color', 'rgb(0, 0, 0)');
    // A brand with real contrast is untouched (#E4405F).
    await expect(glyph(page, 'Instagram')).toHaveCSS('color', 'rgb(228, 64, 95)');
  });

  test('the rule is luminance-driven, not a TikTok special case (Snapchat flips too)', async ({ page }) => {
    await seedIcons(page, { iconColorMode: 'color', iconBgStyle: 'white' }, ['Snapchat']);
    await gotoSeeded(page);
    // Snapchat #FFFC00 vs white is ~1.07 — below threshold, flips dark.
    await expect(glyph(page, 'Snapchat')).toHaveCSS('color', 'rgb(0, 0, 0)');
  });

  test('control: color mode on a black circle leaves TikTok its white mark', async ({ page }) => {
    await seedIcons(page, { iconColorMode: 'color', iconBgStyle: 'black' }, ['TikTok']);
    await gotoSeeded(page);
    // 21:1 against black — the rule must NOT fire.
    await expect(glyph(page, 'TikTok')).toHaveCSS('color', 'rgb(255, 255, 255)');
  });
});

// ─── 2. Saved-invalid combos render safe, never invisible ────────────────────

test.describe('icon contrast — saved same-on-same combos', () => {
  test('black icons on black circles render white glyphs', async ({ page }) => {
    await seedIcons(page, { iconColorMode: 'black', iconBgStyle: 'black' }, ['Instagram']);
    await gotoSeeded(page);
    await expect(page.locator('a[title="Instagram"]')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(glyph(page, 'Instagram')).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('white icons on white circles render black glyphs', async ({ page }) => {
    await seedIcons(page, { iconColorMode: 'white', iconBgStyle: 'white' }, ['Instagram']);
    await gotoSeeded(page);
    await expect(page.locator('a[title="Instagram"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(glyph(page, 'Instagram')).toHaveCSS('color', 'rgb(0, 0, 0)');
  });
});

// ─── 3. The picker guard: invalid combos disabled with the hint ──────────────

// A chip group is <label> + sibling <div> of buttons (SocialLinksEditor).
const chip = (page: import('@playwright/test').Page, groupLabel: string, name: string) =>
  page.getByText(groupLabel, { exact: true }).filter({ visible: true }).first()
    .locator('xpath=following-sibling::div[1]')
    .getByRole('button', { name, exact: true });

const HINT_EN = 'No contrast — icons would disappear';

test.describe('icon contrast — picker guard', () => {
  test('same-on-same chips disable in both directions with the hint', async ({ page }) => {
    // Deterministic starting combo on the GET; stub PATCH so the shared test
    // account is never mutated by chip clicks.
    await page.route('**/rest/v1/pages*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      const res = await route.fetch();
      let body = await res.json();
      const patch = (p: any) => {
        if (!p || typeof p !== 'object') return p;
        const theme = { ...(p.theme_json || {}) };
        theme.headerConfig = { ...(theme.headerConfig || {}), iconColorMode: 'color', iconBgStyle: 'default' };
        return { ...p, theme_json: theme };
      };
      body = Array.isArray(body) ? body.map(patch) : patch(body);
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    });

    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
    // Route through the Edit Profile menu (the canvas "+" sits behind the
    // full-width menu overlay on mobile; the menu row works on both projects).
    await page.getByText('Manage Platforms', { exact: false }).filter({ visible: true }).first().click();
    await expect(chip(page, 'Icon Color', 'Brand')).toBeVisible();

    // mode=color, bg=default: nothing disabled, no hint.
    await expect(chip(page, 'Icon Background', 'Black')).toBeEnabled();
    await expect(chip(page, 'Icon Background', 'White')).toBeEnabled();
    await expect(page.getByText(HINT_EN)).toHaveCount(0);

    // Black icons → black background becomes invalid; white stays valid.
    await chip(page, 'Icon Color', 'Black').click();
    await expect(chip(page, 'Icon Background', 'Black')).toBeDisabled();
    await expect(chip(page, 'Icon Background', 'White')).toBeEnabled();
    await expect(page.getByText(HINT_EN).first()).toBeVisible();

    // White icons → the guard tracks the mode: white bg invalid, black frees up.
    await chip(page, 'Icon Color', 'White').click();
    await expect(chip(page, 'Icon Background', 'White')).toBeDisabled();
    await expect(chip(page, 'Icon Background', 'Black')).toBeEnabled();

    // Reverse direction: back to Brand clears both; a white bg then locks the
    // white icon-color chip.
    await chip(page, 'Icon Color', 'Brand').click();
    await expect(chip(page, 'Icon Background', 'White')).toBeEnabled();
    await expect(page.getByText(HINT_EN)).toHaveCount(0);
    await chip(page, 'Icon Background', 'White').click();
    await expect(chip(page, 'Icon Color', 'White')).toBeDisabled();
    await expect(chip(page, 'Icon Color', 'Black')).toBeEnabled();
    await expect(page.getByText(HINT_EN).first()).toBeVisible();
  });
});

// ─── 4. ES smoke — the hint exists in both dictionaries ──────────────────────

test.describe('icon contrast — i18n', () => {
  test('the no-contrast hint resolves in EN and ES, and ES is really Spanish', () => {
    const k = 'socialLinksEditor.noContrastHint';
    expect(translations.en[k], `en:${k}`).toBeTruthy();
    expect(translations.es[k], `es:${k}`).toBeTruthy();
    expect(translations.es[k]).not.toBe(translations.en[k]);
    expect(translations.en[k]).toBe('No contrast — icons would disappear');
    expect(translations.es[k]).toBe('Sin contraste — los iconos desaparecerían');
  });
});

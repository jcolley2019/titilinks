// HDR.SPACE.2 — user-tunable header spacing (name→handle, handle→icons,
// icons→content) via headerConfig.spacing, edited from the Name & Handle hub.
//
// Public probes reuse the 11-icon-row fixture-injection precedent: real page +
// modes rows, blocks/block_items answered with a fixture, theme_json patched per
// spec. The rendered-px probes read the exact levers HDR.SPACE.2 converted:
//
//   name→handle    = computed margin-top of the handle <p>   (was HEADER_GAP_A -2)
//   handle→icons   = computed margin-top of [data-icon-row]  (was HEADER_GAP_B 6)
//   icons→content  = computed padding-bottom of the header stack (was '1rem')
//
// The defaults spec is the byte-identical mutation check: a page with NO
// spacing key must render today's exact values, so if any fallback drifts the
// computed px changes and the assertions go red.
//
// The editor spec drives the real hub sliders and asserts the LIVE draft moves
// the edit canvas before Save, then saves and reloads. It reads the account's
// stored value first and puts that same value back afterwards — never a
// hardcoded one. TL.SPEC.25.FIX: this test used to assert a -2px baseline
// against the shared account, so the first time a human actually moved the
// slider (to -3) the spec went red over correct data. The slider's whole point
// is that any value in range is legitimate; what the spec owns is the
// RELATIONSHIP between the stored number and the rendered px.

import { test, expect } from '@playwright/test';
import { translations } from '../src/hooks/useLanguage';

const PROFILE = '/joeyc';
const BLOCK_ID = 'hs-social-block';

// Patch page.theme_json.headerConfig.spacing (null = strip the key entirely so
// the constants' fallbacks are what renders), pass the real modes through, then
// answer blocks/block_items with one social block so the icon row exists.
const seedSpacing = async (
  page: import('@playwright/test').Page,
  spacing: Record<string, number> | null,
) => {
  await page.route('**/rest/v1/pages*', async (route) => {
    const res = await route.fetch();
    let body = await res.json();
    const patch = (p: any) => {
      if (!p || typeof p !== 'object') return p;
      const theme = { ...(p.theme_json || {}) };
      const header = { ...(theme.headerConfig || {}) };
      if (spacing === null) delete header.spacing;
      else header.spacing = spacing;
      theme.headerConfig = header;
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
      json: [{
        id: 'hs-spotify', block_id: BLOCK_ID, label: 'Spotify',
        url: 'https://open.spotify.com/artist/hs-probe', is_adult: false,
        order_index: 0, subtitle: null, badge: null, image_url: null,
      }],
    });
  });
};

const gotoSeeded = async (page: import('@playwright/test').Page) => {
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
};

// The header stack is the <h1>'s grandparent (header stack > card wrapper > h1)
// — the div HDR.SPACE.2 gave the tunable paddingBottom.
const headerStackPaddingBottom = (page: import('@playwright/test').Page) =>
  page.locator('h1').first().evaluate(
    (el) => getComputedStyle(el.parentElement!.parentElement!).paddingBottom,
  );

// ─── 1. Absent config renders today's exact values (mutation check) ──────────

test.describe('header spacing — defaults are byte-identical', () => {
  test('no spacing key renders -2px / 6px / 16px', async ({ page }) => {
    await seedSpacing(page, null);
    await gotoSeeded(page);
    // name→handle: HEADER_GAP_A
    await expect(page.locator('h1 + p').first()).toHaveCSS('margin-top', '-2px');
    // handle→icons: HEADER_GAP_B
    await expect(page.locator('[data-icon-row]').first()).toHaveCSS('margin-top', '6px');
    // icons→content: the pre-HDR.SPACE.2 '1rem'
    expect(await headerStackPaddingBottom(page)).toBe('16px');
  });
});

// ─── 2. Saved values render at their exact px ────────────────────────────────

test.describe('header spacing — saved values render', () => {
  test('spacing {8, 14, 22} renders 8px / 14px / 22px', async ({ page }) => {
    await seedSpacing(page, { nameHandle: 8, handleIcons: 14, iconsContent: 22 });
    await gotoSeeded(page);
    await expect(page.locator('h1 + p').first()).toHaveCSS('margin-top', '8px');
    await expect(page.locator('[data-icon-row]').first()).toHaveCSS('margin-top', '14px');
    expect(await headerStackPaddingBottom(page)).toBe('22px');
  });

  test('range floors render (0px gaps collapse the header)', async ({ page }) => {
    await seedSpacing(page, { nameHandle: -6, handleIcons: 0, iconsContent: 0 });
    await gotoSeeded(page);
    await expect(page.locator('h1 + p').first()).toHaveCSS('margin-top', '-6px');
    await expect(page.locator('[data-icon-row]').first()).toHaveCSS('margin-top', '0px');
    expect(await headerStackPaddingBottom(page)).toBe('0px');
  });
});

// ─── 3. The hub sliders: live draft, save, persist ───────────────────────────

// The edit-canvas handle <p> inside NameHandleCard (input + p). Two EPV
// instances are mounted (desktop + mobile branches, CSS-hidden) — scope to the
// visible one.
const canvasHandle = (page: import('@playwright/test').Page) =>
  page.locator('input + p').filter({ hasText: '@' }).filter({ visible: true }).first();

const openHub = async (page: import('@playwright/test').Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByText('Name & Handle', { exact: false }).filter({ visible: true }).first().click();
  await expect(
    page.getByRole('slider', { name: 'Name to handle' }).filter({ visible: true }).first()
  ).toBeVisible();
};

const nameHandleSlider = (page: import('@playwright/test').Page) =>
  page.getByRole('slider', { name: 'Name to handle' }).filter({ visible: true }).first();

const saveHub = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: /^(Save|Guardar)$/ }).filter({ visible: true }).first().click();
  await expect(page.getByText(/^(Saved|Guardado)$/).first()).toBeVisible();
  await page.waitForTimeout(600); // let the PATCH + refetch settle
};

// Drive the slider to an exact value by keyboard — the same onChange a drag
// fires. It reads where the slider currently sits instead of assuming, which is
// what makes every caller independent of the account: step is 1, so the
// distance IS the press count.
const setNameHandle = async (page: import('@playwright/test').Page, target: number) => {
  const slider = nameHandleSlider(page);
  const from = Number(await slider.inputValue());
  await slider.focus();
  const key = target > from ? 'ArrowRight' : 'ArrowLeft';
  for (let i = 0; i < Math.abs(target - from); i++) await page.keyboard.press(key);
  await expect(slider).toHaveValue(String(target));
};

test.describe('header spacing — hub sliders', () => {
  test('dragging live-updates the edit canvas, Save persists, reload renders', async ({ page }) => {
    await openHub(page);

    // Whatever this account happens to hold is the baseline — it is the
    // creator's own choice, not a constant. Everything below is expressed
    // against it, and it goes back untouched at the end.
    const original = Number(await nameHandleSlider(page).inputValue());
    expect(
      Number.isInteger(original),
      'the slider must report an integer; a fractional stored value would break the arrow-key arithmetic below',
    ).toBe(true);

    // A probe inside the slider's own -6..12 range that is never the value
    // already stored — otherwise "the canvas followed the slider" could pass
    // with nothing having moved.
    const probe = original === 2 ? -4 : 2;

    // Only a save dirties the account, so only a save obliges a restore. The
    // flag is set BEFORE the click: a save that half-lands must still restore.
    let dirtied = false;
    let bodyFailed = false;
    try {
      // The canvas renders the STORED gap, whatever it is.
      await expect(canvasHandle(page)).toHaveCSS('margin-top', `${original}px`);

      // Drive the slider to the probe. The canvas must follow BEFORE any save —
      // that is the L4 draft.
      await setNameHandle(page, probe);
      await expect(canvasHandle(page)).toHaveCSS('margin-top', `${probe}px`);

      // Save, then reload cold: the persisted value must render with no draft.
      dirtied = true;
      await saveHub(page);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(canvasHandle(page)).toHaveCSS('margin-top', `${probe}px`);
    } catch (err) {
      bodyFailed = true;
      throw err;
    } finally {
      // Leave the shared account exactly as found. Save is disabled unless the
      // hub is dirty, so a restore is attempted only when something was written.
      if (dirtied) {
        try {
          await openHub(page);
          await setNameHandle(page, original);
          await saveHub(page);
          await expect(canvasHandle(page)).toHaveCSS('margin-top', `${original}px`);
        } catch (restoreErr) {
          // A failed restore must never mask the real failure — but if the body
          // passed, an account left on the probe value IS the failure to report.
          if (!bodyFailed) throw restoreErr;
          console.error(`[25-header-spacing] could not restore nameHandle=${original}:`, restoreErr);
        }
      }
    }
  });
});

// ─── 4. ES smoke — the new hub copy exists in both dictionaries ──────────────

test.describe('header spacing — i18n', () => {
  test('every spacing key resolves in EN and ES, and ES is really Spanish', () => {
    const keys = [
      'typoHub.spacing',
      'typoHub.spacingNameHandle',
      'typoHub.spacingHandleIcons',
      'typoHub.spacingIconsContent',
      'typoHub.spacingHint',
    ];
    for (const k of keys) {
      expect(translations.en[k], `en:${k}`).toBeTruthy();
      expect(translations.es[k], `es:${k}`).toBeTruthy();
      expect(translations.es[k], `es:${k} untranslated`).not.toBe(translations.en[k]);
    }
    // Pin one concrete value so a wrong dictionary edit is loud.
    expect(translations.es['typoHub.spacing']).toBe('Espaciado');
  });
});

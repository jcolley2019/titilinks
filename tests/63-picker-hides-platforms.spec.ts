// TL.PLAT.HIDE.1 — Bigo Live and the four ADULT (18+) platforms are hidden
// from the pickers, and ONLY from the pickers.
//
// Decision on record (Titi, Sep 9 2026): hide for now; may return on creator
// demand. The mechanism is a `hidden: true` flag in PLATFORM_CATALOG and a
// derived PICKER_CATALOG that the two pickers iterate — so removing the flag
// is the whole "bring it back" procedure (scripts/platform-catalog.test.mjs
// pins the derivation; this spec pins the two surfaces).
//
// What must NOT change: existing rows. The battery account and joeyc both own
// a Bigo Live row today, and spec 04 renders an OnlyFans link. Those rows keep
// their place in the editor's saved-rows list (the label lookup still reads
// PLATFORM_CATALOG), their glyph on the phone icon row, and their 18+ gating —
// none of which routes through PICKER_CATALOG.
//
// Fixture injection follows 46-social-picker / 47-bigo-image-mark: real pages +
// modes rows pass through, blocks/block_items are answered with a fixture, and
// every write is swallowed so the shared test account is never mutated.

import { test, expect, type Page, type Route } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { TEST_HANDLE } from './helpers/auth';
import { PLATFORM_CATALOG, PICKER_CATALOG } from '../src/lib/platform-catalog';

const T = translations.en;
const HIDDEN = ['Bigo Live', 'OnlyFans', 'Fansly', 'Privacy', 'FatalFans'];
const BLOCK_ID = 'hide-social-block';

// TEST.FLAKE.26 — the passthrough re-fetch stalls intermittently under a full
// battery; retry it so a transient stall never fails the feature.
const routeFetchWithRetry = async (route: Route, attempts = 4) => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await route.fetch({ timeout: 20_000 });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('route.fetch failed after retries');
};

type Seed = { id: string; label: string; url: string };

/** Mocked reads: one social_links block carrying `seeds`; writes swallowed. */
const seedSocial = async (page: Page, seeds: Seed[]) => {
  let cachedPage: string | null = null;
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (cachedPage) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: cachedPage });
      return;
    }
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const out = JSON.stringify(body);
    if (Array.isArray(body) ? body.length > 0 : !!body) cachedPage = out;
    await route.fulfill({ status: 200, contentType: 'application/json', body: out });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : [body];
    modeId = rows.find((m: any) => m?.type === 'page1')?.id ?? rows[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      json: [{ id: BLOCK_ID, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 }],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    const method = route.request().method();
    if (method !== 'GET') {
      await route.fulfill(
        method === 'POST'
          ? { status: 201, contentType: 'application/json', body: '[]' }
          : { status: 204, body: '' },
      );
      return;
    }
    await route.fulfill({
      json: seeds.map((s, i) => ({
        id: s.id, block_id: BLOCK_ID, label: s.label, url: s.url,
        is_adult: false, order_index: i, subtitle: null, badge: null, image_url: null,
      })),
    });
  });
};

const openPlatformsPanel = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  // Route through the Edit Profile menu row — works on both projects.
  const menuRow = page.getByRole('button', { name: /Manage Platforms/ }).filter({ visible: true }).first();
  await expect(menuRow).toBeVisible();
  await menuRow.click();
  await expect(page.getByRole('button', { name: 'Add Platform' })).toBeVisible({ timeout: 15_000 });
};

const pickerRow = (page: Page, label: string) =>
  page.getByRole('button', { name: label, exact: true });

const SEEDS: Seed[] = [
  { id: 'hide-bigo', label: 'Bigo Live', url: 'https://www.bigo.tv/user/titi' },
  { id: 'hide-ig', label: 'Instagram', url: 'https://www.instagram.com/titi' },
];

// ─── 1. The catalog derivation, in the bundle's own words ────────────────────

test.describe('TL.PLAT.HIDE.1 — catalog', () => {
  test('PICKER_CATALOG hides exactly the five; PLATFORM_CATALOG still carries them', () => {
    const picker = PICKER_CATALOG.flatMap((c) => c.platforms.map((p) => p.label));
    const all = PLATFORM_CATALOG.flatMap((c) => c.platforms.map((p) => p.label));
    for (const h of HIDDEN) {
      expect(picker, `picker hides ${h}`).not.toContain(h);
      expect(all, `catalog keeps ${h}`).toContain(h);
    }
    expect(PICKER_CATALOG.map((c) => c.label)).not.toContain('ADULT (18+)');
    expect(picker.length).toBe(all.length - 5);
  });
});

// ─── 2. Editor — Social Platforms panel ──────────────────────────────────────

test.describe('TL.PLAT.HIDE.1 — editor picker', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('the five are absent from the category list; ADULT group gone; Twitch/Kick stay', async ({ page }, info) => {
    await seedSocial(page, []);
    await openPlatformsPanel(page);
    await page.getByRole('button', { name: 'Add Platform' }).click();
    const search = page.getByPlaceholder('Search platforms...');
    await expect(search).toBeVisible();

    // The ADULT group header is not offered at all.
    await expect(page.getByText(T['platformCategory.adult'], { exact: true })).toHaveCount(0);
    await expect(page.getByText('ADULT (18+)', { exact: true })).toHaveCount(0);

    // ENTERTAINMENT expands to its neighbours, minus Bigo.
    await page.getByText(T['platformCategory.entertainment'], { exact: true }).first().click();
    await expect(pickerRow(page, 'Twitch')).toBeVisible();
    await expect(pickerRow(page, 'Kick')).toBeVisible();
    for (const h of HIDDEN) await expect(pickerRow(page, h)).toHaveCount(0);
    // The ENTERTAINMENT header count reflects the picker view (7), not the
    // catalog's 8. Scoped to that header: three other categories also hold 7.
    const entHeader = page.getByRole('button').filter({ hasText: T['platformCategory.entertainment'] }).first();
    await expect(entHeader).toContainText(`7 ${T['socialLinksEditor.platforms']}`);
    await expect(entHeader).not.toContainText(`8 ${T['socialLinksEditor.platforms']}`);

    await page.screenshot({ path: `tests/screenshots/${info.project.name}-plat-hide-entertainment.png` });
  });

  test('search finds none of them: "bigo" → 0 results, and each name by full label', async ({ page }) => {
    await seedSocial(page, []);
    await openPlatformsPanel(page);
    await page.getByRole('button', { name: 'Add Platform' }).click();
    const search = page.getByPlaceholder('Search platforms...');

    await search.fill('bigo');
    await expect(page.getByText(`0 ${T['socialLinksEditor.platformsFound']}`, { exact: true })).toBeVisible();
    await expect(pickerRow(page, 'Bigo Live')).toHaveCount(0);

    for (const h of HIDDEN.slice(1)) {
      await search.fill(h);
      await expect(pickerRow(page, h)).toHaveCount(0);
    }

    // The search path is still alive — a visible neighbour is found.
    await search.fill('twitch');
    await expect(pickerRow(page, 'Twitch')).toBeVisible();
  });

  test('an existing Bigo Live row still renders in the saved-rows list', async ({ page }, info) => {
    await seedSocial(page, SEEDS);
    await openPlatformsPanel(page);

    const rows = page.getByTestId('social-row');
    await expect(rows).toHaveCount(2);
    const bigoRow = rows.filter({ hasText: 'Bigo Live' });
    await expect(bigoRow).toBeVisible();
    // Label, saved URL and the image-mark glyph all survive: the row renders
    // from PlatformIcon + the stored item, none of which consults the picker.
    await expect(bigoRow).toContainText(SEEDS[0].url);
    await expect(bigoRow.locator('svg image')).toHaveCount(1);
    await page.screenshot({ path: `tests/screenshots/${info.project.name}-plat-hide-saved-bigo-row.png` });

    // And the picker still refuses to OFFER it, even though it is on the list.
    await page.getByRole('button', { name: 'Add Platform' }).click();
    await page.getByPlaceholder('Search platforms...').fill('Bigo');
    await expect(pickerRow(page, 'Bigo Live')).toHaveCount(0);
  });
});

// ─── 3. Phone — the public icon row still renders the existing glyph ─────────

test.describe('TL.PLAT.HIDE.1 — public icon row', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('the existing Bigo Live row keeps its glyph on the phone icon row', async ({ page }, info) => {
    await seedSocial(page, SEEDS);
    await page.goto(`/${TEST_HANDLE}`);
    await page.waitForLoadState('networkidle');

    const bigo = page.locator('a[title="Bigo Live"]').first();
    await expect(bigo).toBeVisible();
    await expect(bigo).toHaveAttribute('href', SEEDS[0].url);
    // The image mark (spec 47) is untouched by the picker change.
    await expect(bigo.locator('svg image')).toHaveCount(1);
    await expect(page.locator('a[title="Instagram"]').first()).toBeVisible();
    await page.screenshot({ path: `tests/screenshots/${info.project.name}-plat-hide-public-bigo.png` });
  });
});

// ─── 4. Onboarding step 4 — "Your Social Platforms" ──────────────────────────

test.describe('TL.PLAT.HIDE.1 — onboarding picker', () => {
  test('step 4 offers neither the five nor an ADULT group; Twitch/Kick stay', async ({ page }, info) => {
    // As spec 61 test 3: no mocks. The battery account already owns a page, so
    // the resume guard jumps straight to step 4. sessionStorage is cleared so
    // the wizard cannot restore an older persisted step.
    await page.addInitScript(() => {
      try { window.sessionStorage.clear(); } catch { /* storage disabled */ }
    });
    await page.goto('/onboarding');
    await expect(page.getByText(T['onboardingFlow.yourSocialPlatforms'], { exact: true })).toBeVisible();

    for (const h of HIDDEN) await expect(page.getByRole('button', { name: h, exact: true })).toHaveCount(0);
    await expect(page.getByText('ADULT (18+)', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Twitch', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kick', exact: true })).toBeVisible();
    await expect(page.getByText('ENTERTAINMENT', { exact: true })).toBeVisible();
    await page.screenshot({ path: `tests/screenshots/${info.project.name}-plat-hide-onboarding-step4.png` });
    // Deliberately NOT clicking Continue: step 4 writes the social rows.
  });
});

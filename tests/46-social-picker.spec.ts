// TL.SOC.1 — the platform picker survives a selection, and "skipped" never
// means "deleted".
//
// Two defects lived in the Social Platforms editor:
//
//   A (UX) — picking a platform collapsed the picker AND its category, so
//            adding four platforms meant four re-opens and four re-navigations.
//
//   B (DATA LOSS) — handleSave filtered URL-less rows out of `filled`, then
//            derived the delete set from `filled`. A pre-existing row with no
//            link yet — a legitimate saved state that renders as a plain icon —
//            was therefore DELETED while the toast announced it as "skipped".
//            This really ate three live rows (Instagram/TikTok/YouTube) during
//            TL.POLISH.1 verification. It must never come back.
//
// Defect B is pinned twice over. First on the pure core: planSocialSave now
// owns the write/delete/skip split, so the rule can be asserted without a
// browser. Then against the real editor over intercepted REST calls — the only
// honest proof is that no DELETE ever leaves the client for a row the user did
// not remove, which is exactly what this spec records.
//
// The fixture-injection pattern (real pages + modes rows passed through,
// blocks/block_items answered with a fixture, writes stubbed so the shared test
// account is never mutated) follows 11-icon-row / 26-icon-contrast.

import { test, expect } from '@playwright/test';
import { planSocialSave } from '../src/lib/social-save';
import { translations } from '../src/hooks/useLanguage';

// ─── 1. The pure core: what a save writes, and what it deletes ───────────────

test.describe('social save plan (TL.SOC.1 — defect B core)', () => {
  // THE REGRESSION. Three seeded onboarding rows carry no link yet; the user
  // adds one real link and saves. Before the fix, `currentIds` came from the
  // URL-filtered list, so all three seeded rows landed in the delete set.
  test('URL-less pre-existing rows are never in the delete set', () => {
    const rows = [
      { id: 'ig', url: '' },
      { id: 'tt', url: '' },
      { id: 'yt', url: '' },
      { id: 'new-1', url: 'https://www.bigo.tv/user/titi' },
    ];
    const plan = planSocialSave(rows, ['ig', 'tt', 'yt']);

    expect(plan.deleteIds).toEqual([]); // ← the bug: this used to be all three
    expect(plan.skipped).toBe(3);
    // Only the row that carries a URL is written, at its slot in the full list.
    expect(plan.writeIndexes).toEqual([3]);
  });

  // The other half of the contract: removal still removes.
  test('only rows the user removed from the list are deleted', () => {
    const plan = planSocialSave(
      [
        { id: 'ig', url: 'https://instagram.com/titi' },
        { id: 'yt', url: '' },
      ],
      ['ig', 'tt', 'yt'],
    );
    // 'tt' is gone from the on-screen list — that absence is the delete signal.
    expect(plan.deleteIds).toEqual(['tt']);
    // 'yt' has no URL but is still on screen: preserved, not written.
    expect(plan.writeIndexes).toEqual([0]);
    expect(plan.skipped).toBe(1);
  });

  test('a URL-less row survives even when every other row is removed', () => {
    const plan = planSocialSave([{ id: 'ig', url: '  ' }], ['ig', 'tt']);
    expect(plan.deleteIds).toEqual(['tt']);
    expect(plan.writeIndexes).toEqual([]); // whitespace is not a URL
    expect(plan.skipped).toBe(1);
  });

  test('unsaved rows are never mistaken for existing ones', () => {
    // A brand-new row has no database identity, so it can neither be kept nor
    // deleted — and a row with no id at all counts as new.
    const plan = planSocialSave(
      [{ id: 'new-9', url: '' }, { url: 'https://x.com/titi' } as { url: string }],
      ['ig'],
    );
    expect(plan.deleteIds).toEqual(['ig']); // 'ig' really was removed
    expect(plan.writeIndexes).toEqual([1]);
  });

  test('order_index slots follow the full list, not the filled subset', () => {
    // Two skipped rows sit above the filled one: it must write index 2, not 0,
    // so it keeps the position the user sees it in.
    const plan = planSocialSave(
      [{ id: 'a', url: '' }, { id: 'b', url: '' }, { id: 'c', url: 'https://c.example' }],
      ['a', 'b', 'c'],
    );
    expect(plan.writeIndexes).toEqual([2]);
    expect(plan.deleteIds).toEqual([]);
  });

  test('an empty editor with nothing seeded deletes nothing', () => {
    expect(planSocialSave([], [])).toEqual({ writeIndexes: [], deleteIds: [], skipped: 0 });
  });
});

// ─── Fixture plumbing (11-icon-row / 26-icon-contrast precedent) ─────────────

const BLOCK_ID = 'soc-block';

type Seed = { id: string; label: string; url: string };

const routeFetchWithRetry = async (
  route: import('@playwright/test').Route,
  attempts = 4,
) => {
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

/** Every non-GET call the editor made to block_items, in order. */
type Write = { method: string; url: string; body: string | null };

const seedEditor = async (page: import('@playwright/test').Page, seeds: Seed[]) => {
  const writes: Write[] = [];

  // The shared test account must never be mutated: replay the page row and
  // swallow PATCHes.
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
    const req = route.request();
    const method = req.method();
    if (method === 'GET') {
      await route.fulfill({
        json: seeds.map((s, i) => ({
          id: s.id, block_id: BLOCK_ID, label: s.label, url: s.url,
          is_adult: false, order_index: i, subtitle: null, badge: null, image_url: null,
        })),
      });
      return;
    }
    // Record — and never forward — every write the editor attempts.
    writes.push({ method, url: req.url(), body: req.postData() });
    await route.fulfill(
      method === 'POST'
        ? { status: 201, contentType: 'application/json', body: '[]' }
        : { status: 204, body: '' },
    );
  });

  return writes;
};

const openPlatformsPanel = async (page: import('@playwright/test').Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  // Route through the Edit Profile menu row — the canvas "+" sits behind the
  // full-width menu overlay on mobile, the menu row works on both projects.
  await page.getByText('Manage Platforms', { exact: false }).filter({ visible: true }).first().click();
  await expect(page.getByRole('button', { name: 'Add Platform' })).toBeVisible();
};

const pickerRow = (page: import('@playwright/test').Page, label: string) =>
  page.getByRole('button', { name: label, exact: true });

const deletes = (writes: Write[]) => writes.filter((w) => w.method === 'DELETE');

// ─── 2. Defect A: the picker stays open for a multi-platform pass ────────────

test.describe('platform picker (TL.SOC.1 — defect A)', () => {
  // A modes/pages passthrough can still be in flight when a test ends; without
  // this, that late route.fetch rejects at teardown and fails an otherwise
  // green test (Playwright's own documented remedy).
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('three platforms are added in one session, then dismissed with X', async ({ page }) => {
    await seedEditor(page, []);
    await openPlatformsPanel(page);

    await page.getByRole('button', { name: 'Add Platform' }).click();
    const search = page.getByPlaceholder('Search platforms...');
    await expect(search).toBeVisible();

    // Expand SOCIAL once — it must stay expanded across all three picks.
    await page.getByText('SOCIAL', { exact: true }).first().click();
    await expect(pickerRow(page, 'Instagram')).toBeVisible();

    const tag = test.info().project.name;
    for (const label of ['Instagram', 'TikTok', 'YouTube']) {
      await pickerRow(page, label).click();
      // The picker itself and its expanded category both survive the pick —
      // this is the whole defect: no re-open, no re-navigation.
      await expect(search).toBeVisible();
      await expect(pickerRow(page, label)).toBeVisible();
      // ...and the platform now reads as added, so it can't be picked twice.
      await expect(pickerRow(page, label)).toBeDisabled();
    }

    await expect(page.getByTestId('social-row')).toHaveCount(3);
    // An untouched neighbour in the same category is still selectable.
    await expect(pickerRow(page, 'Facebook')).toBeEnabled();
    await page.screenshot({ path: `tests/screenshots/${tag}-tlsoc1-picker-multi-add.png` });

    // Explicit dismiss — the picker closes, the three rows stay.
    await page.getByRole('button', { name: 'Close platform picker' }).click();
    await expect(search).toHaveCount(0);
    await expect(page.getByTestId('social-row')).toHaveCount(3);
  });

  test('an already-added platform cannot be picked into a duplicate', async ({ page }) => {
    await seedEditor(page, [
      { id: 'soc-ig', label: 'Instagram', url: 'https://instagram.com/titi' },
    ]);
    await openPlatformsPanel(page);

    await page.getByRole('button', { name: 'Add Platform' }).click();
    // Search is the other entry path into the same rows; it must agree.
    await page.getByPlaceholder('Search platforms...').fill('Instagram');
    await expect(pickerRow(page, 'Instagram')).toBeDisabled();
    await expect(page.getByTestId('social-row')).toHaveCount(1);
  });
});

// ─── 3. Defect B against the real editor: no DELETE for a skipped row ────────

test.describe('social save (TL.SOC.1 — defect B, live editor)', () => {
  // A modes/pages passthrough can still be in flight when a test ends; without
  // this, that late route.fetch rejects at teardown and fails an otherwise
  // green test (Playwright's own documented remedy).
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  const SEEDS: Seed[] = [
    { id: 'soc-ig', label: 'Instagram', url: '' }, // the row that used to die
    { id: 'soc-tt', label: 'TikTok', url: 'https://www.tiktok.com/@titi' },
  ];

  test('saving issues NO delete for a pre-existing row with no link', async ({ page }) => {
    const writes = await seedEditor(page, SEEDS);
    await openPlatformsPanel(page);

    await expect(page.getByTestId('social-row')).toHaveCount(2);
    // The precondition: Instagram really is a URL-less row.
    await expect(page.getByTestId('social-row').filter({ hasText: 'Instagram' }))
      .toContainText('No URL set');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // The toast says skipped...
    await expect(page.getByText(/skipped/i).first()).toBeVisible();
    // ...and skipped means skipped: nothing was destroyed.
    expect(deletes(writes)).toEqual([]);
    await page.screenshot({
      path: `tests/screenshots/${test.info().project.name}-tlsoc1-urlless-row-kept.png`,
    });
    // The filled row was still written, so a real save really happened.
    expect(writes.some((w) => w.method === 'PATCH' && w.url.includes('soc-tt'))).toBe(true);
    // And the untouched row was not rewritten either.
    expect(writes.some((w) => w.url.includes('soc-ig'))).toBe(false);
  });

  test('explicitly removing a row still deletes exactly that row', async ({ page }) => {
    const writes = await seedEditor(page, SEEDS);
    await openPlatformsPanel(page);

    await page.getByTestId('social-row').filter({ hasText: 'Instagram' })
      .getByTestId('social-row-delete').click();
    await expect(page.getByTestId('social-row')).toHaveCount(1);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Social links saved/i).first()).toBeVisible();

    const gone = deletes(writes);
    expect(gone).toHaveLength(1);
    expect(gone[0].url).toContain('soc-ig');
  });
});

// ─── 4. i18n parity for the strings this task introduced ────────────────────

test.describe('platform picker — i18n', () => {
  test('the new picker strings resolve in EN and ES', () => {
    for (const k of ['socialLinksEditor.closePicker', 'socialLinksEditor.added']) {
      expect(translations.en[k], `en:${k}`).toBeTruthy();
      expect(translations.es[k], `es:${k}`).toBeTruthy();
      expect(translations.es[k], `es==en:${k}`).not.toBe(translations.en[k]);
    }
    expect(translations.en['socialLinksEditor.added']).toBe('Added');
    expect(translations.es['socialLinksEditor.added']).toBe('Agregada');
  });
});

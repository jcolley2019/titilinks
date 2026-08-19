// TL.SOC.3 — a platform row with no URL yet is a real state, and the two
// surfaces owe it opposite answers.
//
// Onboarding writes exactly this row (OnboardingFlow.tsx: `url: ''`) so a
// creator can pick their platforms before they have their links. Before this
// change BOTH surfaces rendered those rows identically to linked ones, which
// meant a visitor met a dead icon that went nowhere, and the creator got no
// signal about which platforms still needed a URL.
//
// The ruling:
//   editor canvas  → VISIBLE, marked "needs a link", and tappable straight
//                    through to Manage Platforms where the URL field lives.
//   public page    → HIDDEN until a URL exists. The editor's Visitor toggle
//                    renders through that same non-edit path, so it must agree
//                    with the public page, not with the canvas.
//
// The split is structural, not a flag: the canvas row is SocialIconsCard
// (edit-only) and the public row is the non-edit header path, two separate
// renderers in EditableProfileView. Nothing had to be forced.
//
// Fixture injection follows 26-icon-contrast / 46-social-picker: the real page
// and modes rows pass through, blocks/block_items are answered with a fixture,
// and every write is swallowed so the shared test account is never mutated.

import { test, expect } from '@playwright/test';

const PROFILE = '/joeyc';
const BLOCK = 'soc3-block';
const LINKED = 'https://www.instagram.com/titi';

const routeFetchWithRetry = async (route: import('@playwright/test').Route, attempts = 4) => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await route.fetch({ timeout: 20_000 }); } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('route.fetch failed after retries');
};

type Row = { id: string; label: string; url: string | null };

/** Default cast: one linked row, one empty-string row, one null-url row. */
const ROWS: Row[] = [
  { id: 'soc3-ig', label: 'Instagram', url: LINKED },
  { id: 'soc3-tt', label: 'TikTok', url: '' },
  { id: 'soc3-bigo', label: 'Bigo Live', url: null },
];

const seed = async (page: import('@playwright/test').Page, rows: Row[] = ROWS) => {
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    const res = await routeFetchWithRetry(route);
    await route.fulfill({ response: res, body: JSON.stringify(await res.json()) });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [body];
    modeId = arr.find((m: any) => m?.type === 'page1')?.id ?? arr[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    await route.fulfill({
      json: [{ id: BLOCK, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 }],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    await route.fulfill({
      json: rows.map((r, i) => ({
        id: r.id, block_id: BLOCK, label: r.label, url: r.url,
        is_adult: false, order_index: i, subtitle: null, badge: null, image_url: null,
      })),
    });
  });
};

const shot = (name: string) => `tests/screenshots/${name}.png`;
const suffix = (info: import('@playwright/test').TestInfo) => info.project.name;

const gotoProfile = async (page: import('@playwright/test').Page) => {
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
};

const gotoEditor = async (page: import('@playwright/test').Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(900);
};

/** The canvas placeholder for a URL-less row. */
const placeholder = (page: import('@playwright/test').Page, label: string) =>
  page.locator(`[data-needs-link][title^="${label}"]`);

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

// ─── 1. The public page: no dead icons ──────────────────────────────────────

test.describe('public page', () => {
  test('URL-less rows are absent; the linked row is untouched', async ({ page }, info) => {
    await seed(page);
    await gotoProfile(page);

    const ig = page.locator('a[title="Instagram"]');
    await expect(ig).toHaveCount(1);
    await expect(ig).toHaveAttribute('href', LINKED);

    // Both flavours of "no URL" — '' and null — are gone entirely, not just
    // rendered inert: a visitor should never see the icon at all.
    await expect(page.locator('[title="TikTok"]')).toHaveCount(0);
    await expect(page.locator('[title="Bigo Live"]')).toHaveCount(0);
    // And nothing leaked through as a decorative span either.
    await expect(page.locator('[data-icon-row] > *')).toHaveCount(1);

    await page.locator('[data-icon-row]').screenshot({ path: shot(`${suffix(info)}-soc3-public-row`) });
  });

  // THE LATENT BUG the filter order settles. Dedupe keeps the FIRST row of a
  // label; a leftover URL-less "Instagram" therefore used to shadow the real
  // linked one saved beneath it, and the page showed neither.
  test('a URL-less row no longer shadows a linked row of the same platform', async ({ page }) => {
    await seed(page, [
      { id: 'soc3-ghost', label: 'Instagram', url: '' },
      { id: 'soc3-real', label: 'Instagram', url: LINKED },
    ]);
    await gotoProfile(page);

    const ig = page.locator('a[title="Instagram"]');
    await expect(ig).toHaveCount(1);
    await expect(ig).toHaveAttribute('href', LINKED);
  });

  test('a row whose URL is only whitespace counts as URL-less', async ({ page }) => {
    await seed(page, [{ id: 'soc3-ws', label: 'TikTok', url: '   ' }]);
    await gotoProfile(page);
    // The whole row was the only item, so the icon row drops out completely.
    await expect(page.locator('[title="TikTok"]')).toHaveCount(0);
  });
});

// ─── 2. The editor canvas: visible, marked, and tappable ────────────────────

test.describe('editor canvas', () => {
  test('URL-less rows render as "needs a link"; linked rows stay plain links', async ({ page }, info) => {
    await seed(page);
    await gotoEditor(page);

    // The editor mounts TWO EditableProfileViews (desktop + mobile branches are
    // CSS-hidden, not unmounted), so every canvas node has a twin. Assert on
    // the visible one and count the pair.
    await expect(placeholder(page, 'TikTok')).toHaveCount(2);
    await expect(placeholder(page, 'Bigo Live')).toHaveCount(2);

    const tiktok = placeholder(page, 'TikTok').filter({ visible: true }).first();
    await expect(tiktok).toBeVisible();
    // It reads as unfinished and says so, in the page's language.
    await expect(tiktok).toHaveAttribute('title', 'TikTok — Add link');
    await expect(tiktok).toHaveClass(/opacity-60/);
    await expect(tiktok).toHaveClass(/border-dashed/);
    // It is a button, not a dead anchor — nothing to navigate to.
    expect(await tiktok.evaluate((el) => el.tagName)).toBe('BUTTON');

    // The linked row is untouched: still a plain anchor, no placeholder mark.
    const ig = page.locator('a[title="Instagram"]').filter({ visible: true }).first();
    await expect(ig).toHaveAttribute('href', LINKED);
    await expect(placeholder(page, 'Instagram')).toHaveCount(0);

    await page.screenshot({ path: shot(`${suffix(info)}-soc3-editor-canvas`) });
    // Tight shot of the row itself — the whole-page frame is too small to judge
    // the placeholder treatment on.
    await tiktok.locator('xpath=..').screenshot({ path: shot(`${suffix(info)}-soc3-editor-row`) });
  });

  test('tapping a placeholder opens Manage Platforms', async ({ page }) => {
    await seed(page);
    await gotoEditor(page);

    await placeholder(page, 'TikTok').filter({ visible: true }).first().click();
    // The panel that owns the URL field.
    await expect(page.getByRole('button', { name: 'Add Platform' })).toBeVisible({ timeout: 15_000 });
  });
});

// ─── 3. The Visitor toggle agrees with the public page, not the canvas ──────

test('visitor preview hides the placeholders it shows in edit mode', async ({ page }, info) => {
  // Desktop only, and not to dodge a failure: the whole phone-stage chrome —
  // device frame, device selector, and this toggle — sits inside `hidden
  // lg:block` (Editor.tsx), so on the mobile project the control does not
  // exist to click. The public half of the same guarantee IS covered on both
  // viewports by the public-page tests above.
  test.skip(info.project.name === 'mobile', 'visitor toggle is desktop-stage chrome (hidden lg:block)');
  await seed(page);
  await gotoEditor(page);

  const frame = page.getByTestId('device-frame');
  await expect(placeholder(page, 'TikTok').filter({ visible: true }).first()).toBeVisible();

  await page.getByTestId('preview-mode-toggle').click();
  await page.waitForTimeout(400);

  // Visitor mode renders the non-edit path: the placeholders are gone and the
  // linked row survives — the same answer the public page gives.
  await expect(frame.locator('[data-needs-link]')).toHaveCount(0);
  await expect(frame.locator('[title="Instagram"]').first()).toBeVisible();

  await page.screenshot({ path: shot(`${suffix(info)}-soc3-visitor-preview`) });
});

// ─── 4. TL.SOC.4 — the round trip: pick 3, save, they persist ───────────────
//
// Everything above proves how a URL-less row RENDERS. This proves it can exist
// at all: before TL.SOC.4 the save wrote nothing for a freshly picked platform
// with no link, so no row was ever created and there was nothing to render.
//
// block_items is answered by a stateful in-memory table here rather than a
// fixed fixture, so a re-query really re-reads what the save wrote — a fixture
// that always replies with the same rows could not tell a real INSERT from a
// dropped one. Nothing reaches the shared account either way.

type Stored = { id: string; block_id: string; label: string; url: string; order_index: number };

const seedStateful = async (page: import('@playwright/test').Page, initial: Stored[] = []) => {
  const table: Stored[] = [...initial];
  let seq = 100;

  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    const res = await routeFetchWithRetry(route);
    await route.fulfill({ response: res, body: JSON.stringify(await res.json()) });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [body];
    modeId = arr.find((m: any) => m?.type === 'page1')?.id ?? arr[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    await route.fulfill({
      json: [{ id: BLOCK, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 }],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    const req = route.request();
    const method = req.method();
    const idOf = () => /id=eq\.([^&]+)/.exec(req.url())?.[1];
    const row = (r: Stored) => ({ ...r, is_adult: false, subtitle: null, badge: null, image_url: null });

    if (method === 'GET') {
      await route.fulfill({ json: [...table].sort((a, b) => a.order_index - b.order_index).map(row) });
      return;
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData() || '[]');
      for (const r of (Array.isArray(body) ? body : [body])) {
        table.push({ id: `db-${++seq}`, block_id: BLOCK, label: r.label, url: r.url ?? '', order_index: r.order_index ?? 0 });
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    if (method === 'PATCH') {
      const body = JSON.parse(req.postData() || '{}');
      const hit = table.find((r) => r.id === idOf());
      if (hit) Object.assign(hit, {
        label: body.label ?? hit.label,
        url: body.url ?? '',
        order_index: body.order_index ?? hit.order_index,
      });
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (method === 'DELETE') {
      const i = table.findIndex((r) => r.id === idOf());
      if (i >= 0) table.splice(i, 1);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });

  return { table };
};

const openPlatformsPanel = async (page: import('@playwright/test').Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  const menuRow = page.getByRole('button', { name: /Manage Platforms/ }).filter({ visible: true }).first();
  await expect(menuRow).toBeVisible();
  await menuRow.click();
  await expect(page.getByRole('button', { name: 'Add Platform' })).toBeVisible({ timeout: 15_000 });
};

const pick = async (page: import('@playwright/test').Page, label: string) => {
  await page.getByPlaceholder('Search platforms...').fill(label);
  await page.getByRole('button', { name: label, exact: true }).first().click();
};

test.describe('TL.SOC.4 — URL-less platforms save', () => {
  test('picking 3 platforms with no URLs saves 3 real rows that survive a re-query', async ({ page }, info) => {
    const db = await seedStateful(page);
    await openPlatformsPanel(page);

    await page.getByRole('button', { name: 'Add Platform' }).click();
    for (const label of ['TikTok', 'Instagram', 'Spotify']) await pick(page, label);
    await expect(page.getByTestId('social-row')).toHaveCount(3);

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // The toast tells the truth: saved, and N still need a link.
    const toast = page.getByText(/still need a link/i).first();
    await expect(toast).toBeVisible();
    await expect(page.getByText(/skipped/i)).toHaveCount(0);
    await toast.screenshot({ path: shot(`${suffix(info)}-soc4-saved-toast`) });
    // The re-sync behind this toast must not blank the panel: the rows stay on
    // screen rather than being replaced by a loading spinner.
    await expect(page.getByTestId('social-row')).toHaveCount(3);

    // Three real INSERTs, each carrying an empty URL — the shape onboarding
    // writes, and the shape both TL.SOC.3's filter and the placeholder read.
    await expect.poll(() => db.table.length).toBe(3);
    expect(db.table.map((r) => r.url)).toEqual(['', '', '']);
    expect(db.table.map((r) => r.label).sort()).toEqual(['Instagram', 'Spotify', 'TikTok']);
    // order_index follows the on-screen order rather than collapsing.
    expect(db.table.map((r) => r.order_index)).toEqual([0, 1, 2]);

    // RE-QUERY: a full reload re-reads the table. The rows are still there and
    // render as placeholders in the phone preview.
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(900);
    for (const label of ['TikTok', 'Instagram', 'Spotify']) {
      await expect(placeholder(page, label).filter({ visible: true }).first()).toBeVisible();
    }
    await page.screenshot({ path: shot(`${suffix(info)}-soc4-editor-after-reload`) });

    // ...and a visitor sees none of them.
    await gotoProfile(page);
    await expect(page.locator('[data-needs-link]')).toHaveCount(0);
    for (const label of ['TikTok', 'Instagram', 'Spotify']) {
      await expect(page.locator(`[title="${label}"]`)).toHaveCount(0);
    }
  });

  test('adding a URL to one saved row makes exactly that one go live', async ({ page }, info) => {
    // Start from the state the previous test ends in: three saved, unlinked.
    const db = await seedStateful(page, [
      { id: 'db-1', block_id: BLOCK, label: 'TikTok', url: '', order_index: 0 },
      { id: 'db-2', block_id: BLOCK, label: 'Instagram', url: '', order_index: 1 },
      { id: 'db-3', block_id: BLOCK, label: 'Spotify', url: '', order_index: 2 },
    ]);
    await openPlatformsPanel(page);

    // Expand the Instagram row and type its link, exactly as a creator would.
    const igRow = page.getByTestId('social-row').filter({ hasText: 'Instagram' }).first();
    await igRow.getByText('Instagram', { exact: true }).click();
    await igRow.getByPlaceholder('https://...').fill(LINKED);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Two still need a link; the third is now a real destination.
    await expect(page.getByText(/still need a link/i).first()).toBeVisible();
    await expect.poll(() => db.table.find((r) => r.label === 'Instagram')?.url).toBe(LINKED);
    expect(db.table.filter((r) => r.url === '').map((r) => r.label).sort()).toEqual(['Spotify', 'TikTok']);

    // The public page now shows exactly one icon — the one that got a link.
    await gotoProfile(page);
    const ig = page.locator('a[title="Instagram"]');
    await expect(ig).toHaveCount(1);
    await expect(ig).toHaveAttribute('href', LINKED);
    await expect(page.locator('[data-icon-row] > *')).toHaveCount(1);

    await page.locator('[data-icon-row]').screenshot({ path: shot(`${suffix(info)}-soc4-public-one-live`) });
  });
});

// ─── 5. The View Live notice (creator-only, non-blocking) ───────────────────

test('View Live warns that URL-less icons are hidden, and never blocks', async ({ page }, info) => {
  // A real popup would steal focus mid-assert; neutralise window.open so the
  // assertion is about the notice, not about tab plumbing.
  await page.addInitScript(() => { window.open = () => null; });
  await seed(page);
  await gotoEditor(page);

  const live = page.getByRole('button', { name: /View Live|Live/ }).filter({ visible: true }).first();
  await live.click();

  // TikTok + Bigo Live are hidden; Instagram is linked, so it is not counted.
  const notice = page.getByText(/2 social icons are hidden/i).first();
  await expect(notice).toBeVisible();
  // Non-blocking: the editor canvas behind it is still on screen and usable.
  await expect(placeholder(page, 'TikTok').filter({ visible: true }).first()).toBeVisible();
  await notice.screenshot({ path: shot(`${suffix(info)}-soc4-viewlive-notice`) });
});

// BRAND.1 — custom font upload (PRO), integrated into the page-level pickers.
//
// Under test (all network mocked — nothing real mutates):
//   1. PRO upload flow: picking a .ttf POSTs the file to the 'fonts' storage
//      bucket and PATCHes profiles.brand_json.fonts[] with {family, url};
//      the new family appears in the "Your fonts" group.
//   2. A seeded brand_json font renders in the picker's "Your fonts" group.
//   3. FREE plan: the upload affordance is the lock/upsell (no file input).
//   4. Invalid file type is rejected with the friendly error (no storage POST).
//   5. ES smoke: the affordance + group render in Spanish.
//
// The picker surface exercised is the Name & Handle hub's Fuente tab (a menu
// row → tab route, which works on BOTH projects; the DesignEditor Font tab
// embeds the same shared UserFontsSection component).

import { test, expect, type Page, type Route } from '@playwright/test';

type Plan = 'free' | 'pro' | 'business';

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');

const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface Captured {
  profilePatches: Array<Record<string, unknown>>;
  storagePosts: string[];
}

/**
 * Pin the plan + brand_json on profiles reads, capture profiles PATCHes and
 * fonts-bucket storage POSTs, and swallow every write so nothing real mutates.
 */
async function installFontMocks(
  page: Page,
  opts: { plan?: Plan; brandJson?: Record<string, unknown> | null } = {},
): Promise<Captured> {
  const plan: Plan = opts.plan ?? 'pro';
  const brandJson = opts.brandJson ?? null;
  const captured: Captured = { profilePatches: [], storagePosts: [] };

  await page.route('**/rest/v1/profiles*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      captured.profilePatches.push(JSON.parse(route.request().postData() || '{}'));
      return asJson(route, {});
    }
    if (method !== 'GET') return route.fulfill({ status: 204, body: '' });
    const url = route.request().url();
    if (url.includes('select=plan')) {
      return asJson(route, wantsObject(route) ? { plan } : [{ plan }]);
    }
    if (url.includes('select=brand_json')) {
      const row = { brand_json: brandJson };
      return asJson(route, wantsObject(route) ? row : [row]);
    }
    return route.continue();
  });

  // Storage — accept the upload, remember the object path.
  await page.route('**/storage/v1/object/fonts/**', async (route) => {
    if (route.request().method() === 'POST' || route.request().method() === 'PUT') {
      const path = route.request().url().split('/object/')[1];
      captured.storagePosts.push(path);
      return asJson(route, { Id: 'mock-id', Key: path });
    }
    return route.continue();
  });

  // pages — pass through GET; swallow writes (suite-21 convention).
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    return route.continue();
  });

  return captured;
}

async function openEditProfile(page: Page, editLabel: string | RegExp = 'Edit Profile') {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: editLabel }).filter({ visible: true }).first().click();
}

/** Menu row "Name & Handle" → Fuente/Font tab (the hub's font picker). */
async function openFontTab(
  page: Page,
  rowLabel: string | RegExp = /name & handle/i,
  tabLabel = 'Font',
) {
  await page.getByRole('button', { name: rowLabel }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: tabLabel, exact: true }).click();
}

const TTF = {
  name: 'Brand-Sans.ttf',
  mimeType: 'font/ttf',
  buffer: Buffer.from('00010000-not-a-real-font-but-nobody-parses-it'),
};

test.describe('BRAND.1 — custom font upload', () => {
  test('PRO: uploading a ttf POSTs to the fonts bucket and writes brand_json.fonts', async ({ page }) => {
    const captured = await installFontMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openFontTab(page);

    await expect(page.getByTestId('font-upload-cta')).toBeVisible();
    await page.getByTestId('font-upload-input').setInputFiles(TTF);

    // Storage POST first, then the brand_json PATCH with the parsed family.
    await expect.poll(() => captured.storagePosts.length).toBeGreaterThan(0);
    expect(captured.storagePosts[0]).toContain('fonts/');
    expect(captured.storagePosts[0]).toContain('Brand-Sans.ttf');

    await expect.poll(() => captured.profilePatches.length).toBeGreaterThan(0);
    const patch = captured.profilePatches[0] as {
      brand_json?: { fonts?: Array<{ family?: string; url?: string }> };
    };
    const fonts = patch.brand_json?.fonts ?? [];
    expect(fonts.some((f) => f.family === 'Brand Sans' && (f.url || '').includes('/fonts/'))).toBe(true);

    // The new family appears in the "Your fonts" group.
    await expect(page.getByTestId('user-fonts-group')).toBeVisible();
    await expect(page.getByTestId('user-font-chip').filter({ hasText: 'Brand Sans' })).toBeVisible();
  });

  test('a seeded brand_json font renders in "Your fonts" and is selectable', async ({ page }) => {
    await installFontMocks(page, {
      plan: 'pro',
      brandJson: { fonts: [{ family: 'Seeded Serif', url: 'https://cdn.example.com/storage/v1/object/public/fonts/u1/seeded.woff2' }] },
    });
    await openEditProfile(page);
    await openFontTab(page);

    const chip = page.getByTestId('user-font-chip').filter({ hasText: 'Seeded Serif' });
    await expect(chip).toBeVisible();
    await chip.click(); // selects custom:Seeded Serif into the draft — no crash, stays visible
    await expect(chip).toBeVisible();
  });

  test('FREE: the upload affordance is the PRO lock, with no file input', async ({ page }) => {
    await installFontMocks(page, { plan: 'free' });
    await openEditProfile(page);
    await openFontTab(page);

    await expect(page.getByTestId('font-upload-upsell')).toBeVisible();
    await expect(page.getByTestId('font-upload-input')).toHaveCount(0);
    await expect(page.getByTestId('font-upload-cta')).toHaveCount(0);

    // Tapping raises the upsell toast.
    await page.getByTestId('font-upload-upsell').click();
    await expect(page.getByText('Custom fonts are PRO')).toBeVisible();
  });

  test('PRO: a non-font file is rejected with the friendly error', async ({ page }) => {
    const captured = await installFontMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openFontTab(page);

    await page.getByTestId('font-upload-input').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('89504e47-definitely-a-png'),
    });

    await expect(page.getByText('Not a font file. Use TTF, OTF, WOFF or WOFF2.')).toBeVisible();
    expect(captured.storagePosts).toHaveLength(0);
    expect(captured.profilePatches).toHaveLength(0);
  });

  test('ES: the affordance and "Your fonts" group render in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await installFontMocks(page, {
      plan: 'pro',
      brandJson: { fonts: [{ family: 'Seeded Serif', url: 'https://cdn.example.com/storage/v1/object/public/fonts/u1/seeded.woff2' }] },
    });
    await openEditProfile(page, /editar perfil/i);
    await openFontTab(page, /nombre y usuario/i, 'Fuente');

    await expect(page.getByText('Subir archivo de fuente')).toBeVisible();
    await expect(page.getByText('Tus fuentes')).toBeVisible();
  });
});

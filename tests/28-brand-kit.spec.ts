// BRAND.2 — Brand Kit menu + one-tap snapshot-guarded apply.
//
// Under test (writes mocked — nothing real mutates):
//   1. The Style-group row opens the panel; Save PATCHes profiles.brand_json
//      with the entered colors.
//   2. "Apply my brand" fires the auto snapshot POST FIRST, then writes the
//      mapped theme (primary → buttons fill + derived legible text).
//   3. A partial kit's apply leaves unmapped theme fields untouched.
//   4. ES smoke: row + panel strings render in Spanish.

import { test, expect, type Page, type Route } from '@playwright/test';

type Plan = 'free' | 'pro' | 'business';

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');

const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// The existing theme the apply merges over — unmapped keys must survive.
const THEME_FIXTURE = {
  background: { type: 'gradient', gradient_css: 'linear-gradient(#111, #222)', solid_color: '#123456' },
  buttons: { shape: 'pill', fill_color: '#111111', text_color: '#ffffff', animation: 'pulse' },
  typography: { font: 'lora', text_color: '#eeeeee' },
  headerConfig: { iconSize: 'large' },
};

interface Captured {
  profilePatches: Array<Record<string, unknown>>;
  events: string[]; // ordered: 'snapshot.post' | 'pages.patch'
  pagePatches: Array<Record<string, unknown>>;
}

async function installBrandMocks(
  page: Page,
  opts: { plan?: Plan; brandJson?: Record<string, unknown> | null } = {},
): Promise<Captured> {
  const plan: Plan = opts.plan ?? 'pro';
  const brandJson = opts.brandJson ?? null;
  const captured: Captured = { profilePatches: [], events: [], pagePatches: [] };

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

  // Snapshots — POST minted synthetically (suite-17 convention: valid-but-
  // nonexistent zero-UUID page linkage); reads answered empty so pruneAuto
  // deletes nothing.
  await page.route('**/rest/v1/profile_snapshots*', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      captured.events.push('snapshot.post');
      const row = {
        id: '00000000-0000-0000-0000-000000000001',
        page_id: '00000000-0000-0000-0000-000000000000',
        user_id: '00000000-0000-0000-0000-000000000002',
        name: 'auto',
        kind: 'auto',
        payload: {},
        created_at: new Date().toISOString(),
      };
      return asJson(route, wantsObject(route) ? row : [row], 201);
    }
    if (method === 'GET') return asJson(route, []);
    return route.fulfill({ status: 204, body: '' });
  });

  // pages — the apply's theme read gets the fixture; PATCH is captured; all
  // other GETs stay real (the editor needs its live page).
  await page.route('**/rest/v1/pages*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'PATCH') {
      captured.events.push('pages.patch');
      captured.pagePatches.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ status: 204, body: '' });
    }
    if (method !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (url.includes('select=theme_json') && !url.includes('user_id')) {
      const row = { theme_json: THEME_FIXTURE };
      return asJson(route, wantsObject(route) ? row : [row]);
    }
    return route.continue();
  });

  return captured;
}

async function openEditProfile(page: Page, editLabel: string | RegExp = 'Edit Profile') {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: editLabel }).filter({ visible: true }).first().click();
}

async function openBrandKit(page: Page, rowLabel: string | RegExp = /brand kit/i) {
  await page.getByRole('button', { name: rowLabel }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('brand-kit-panel')).toBeVisible();
}

test.describe('BRAND.2 — Brand Kit', () => {
  test('the Style row opens the panel and Save writes brand_json', async ({ page }) => {
    const captured = await installBrandMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openBrandKit(page);

    await page.getByTestId('brand-color-primary').fill('#ff2266');
    await page.getByTestId('brand-color-background').fill('#0e0c09');
    await page.getByTestId('brand-save').click();

    await expect(page.getByText('Brand kit saved')).toBeVisible();
    await expect.poll(() => captured.profilePatches.length).toBeGreaterThan(0);
    const patch = captured.profilePatches.at(-1) as {
      brand_json?: { colors?: { primary?: string; background?: string } };
    };
    expect(patch.brand_json?.colors?.primary).toBe('#ff2266');
    expect(patch.brand_json?.colors?.background).toBe('#0e0c09');
  });

  test('Apply fires the auto snapshot FIRST, then the mapped theme write', async ({ page }) => {
    const captured = await installBrandMocks(page, {
      plan: 'pro',
      brandJson: { colors: { primary: '#ff2266' } },
    });
    await openEditProfile(page);
    await openBrandKit(page);

    await page.getByTestId('brand-apply').click();

    // Confirmless one-gesture apply; the toast mentions the backup.
    await expect(page.getByText(/backup snapshot was saved first/i)).toBeVisible();

    await expect.poll(() => captured.events.filter((e) => e === 'pages.patch').length).toBeGreaterThan(0);
    const snapIdx = captured.events.indexOf('snapshot.post');
    const patchIdx = captured.events.indexOf('pages.patch');
    expect(snapIdx).toBeGreaterThanOrEqual(0);
    expect(snapIdx).toBeLessThan(patchIdx);

    const body = captured.pagePatches[0] as { theme_json: typeof THEME_FIXTURE };
    // primary → fill + the derived legible pair (dark-red fill → white text).
    expect(body.theme_json.buttons.fill_color).toBe('#ff2266');
    expect(body.theme_json.buttons.text_color).toBe('#ffffff');
  });

  test('a partial kit leaves unmapped theme fields untouched', async ({ page }) => {
    const captured = await installBrandMocks(page, {
      plan: 'pro',
      brandJson: { colors: { primary: '#ff2266' } }, // no accent/background/fonts
    });
    await openEditProfile(page);
    await openBrandKit(page);
    await page.getByTestId('brand-apply').click();
    await expect(page.getByText(/backup snapshot was saved first/i)).toBeVisible();

    await expect.poll(() => captured.pagePatches.length).toBeGreaterThan(0);
    const theme = (captured.pagePatches[0] as { theme_json: typeof THEME_FIXTURE }).theme_json;
    // Untouched sections/keys are byte-identical to the fixture.
    expect(theme.background).toEqual(THEME_FIXTURE.background);
    expect(theme.typography).toEqual(THEME_FIXTURE.typography);
    expect(theme.headerConfig).toEqual(THEME_FIXTURE.headerConfig);
    expect(theme.buttons.shape).toBe('pill');
    expect(theme.buttons.animation).toBe('pulse');
  });

  test('ES: the row and panel render in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await installBrandMocks(page, { plan: 'pro' });
    await openEditProfile(page, /editar perfil/i);
    await openBrandKit(page, /kit de marca/i);

    await expect(page.getByText('Color primario')).toBeVisible();
    await expect(page.getByText('Fuente de títulos')).toBeVisible();
    await expect(page.getByTestId('brand-apply')).toHaveText('Aplicar mi marca');
    await expect(page.getByTestId('brand-save')).toHaveText('Guardar marca');
  });
});

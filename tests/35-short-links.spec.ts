// SHORT.1 — custom (user-chosen slug) link shortener.
//
// A NEW system, separate from the existing /l/:code per-link shortener:
//   • table custom_short_links (user_id + unique slug + target_url + clicks)
//   • resolve_short_link_by_slug(p_slug) security-definer RPC
//   • /s/:slug client redirect (v1)
//   • /dashboard/short-links tool: create (validated) / list / copy / delete,
//     quota-gated by entitlements.maxShortLinks (free 3 / pro 25 / business 100)
//
// Mutation-verified: before SHORT.1 neither /s/:slug nor /dashboard/short-links
// existed (both fell through to the catch-all — a single-segment /:handle can't
// match a two-segment path), so every assertion here fails without the feature.
//
// All Supabase calls are stubbed at the REST layer (route-level fulfill, no live
// passthrough — HOUSE.1 flake lesson) so the flows are deterministic.

import { test, expect, type Page } from '@playwright/test';

type Lang = 'en' | 'es';

const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

// Pin the plan so maxShortLinks is deterministic (free → 3).
async function routeProfilePlan(page: Page, plan: 'free' | 'pro' | 'business') {
  await page.route('**/rest/v1/profiles*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=plan(\b|&|$|%2C|,)/.test(req.url())) {
      return route.fulfill({ json: { plan } });
    }
    return route.continue();
  });
}

type Row = { id: string; user_id: string; slug: string; target_url: string; clicks: number; created_at: string };

// Stateful custom_short_links CRUD backed by an in-memory array.
async function routeShortLinks(page: Page, seed: Row[] = []) {
  let rows = [...seed];
  let n = seed.length;
  await page.route('**/rest/v1/custom_short_links*', async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET') return route.fulfill({ json: rows });
    if (method === 'POST') {
      const raw = JSON.parse(req.postData() || '{}');
      const body = Array.isArray(raw) ? raw[0] : raw;
      n += 1;
      const row: Row = {
        id: `id-${n}`,
        user_id: 'test-user',
        slug: body.slug,
        target_url: body.target_url,
        clicks: 0,
        created_at: `2026-07-24T00:00:0${n}Z`,
      };
      rows = [row, ...rows];
      return route.fulfill({ json: row }); // .single() → single object
    }
    if (method === 'DELETE') {
      const id = (new URL(req.url()).searchParams.get('id') || '').replace('eq.', '');
      rows = rows.filter((r) => r.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
}

const mkRow = (slug: string, i: number): Row => ({
  id: `seed-${i}`,
  user_id: 'test-user',
  slug,
  target_url: `https://example.com/${slug}`,
  clicks: i,
  created_at: `2026-07-24T00:00:0${i}Z`,
});

const rows = (page: Page) => page.getByTestId('short-link-row');

// ─── /s/:slug redirect ──────────────────────────────────────────────────────

test.describe('SHORT.1 — /s/:slug redirect', () => {
  test('resolves a hit and redirects to the destination', async ({ page }) => {
    await page.route('**/rest/v1/rpc/resolve_short_link_by_slug*', (route) =>
      route.fulfill({ json: 'https://example.com/dest' }),
    );
    // Intercept the destination so the test never leaves for a live site.
    await page.route('https://example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }),
    );

    await page.goto('/s/mylink');
    await expect.poll(() => page.url(), { timeout: 10000 }).toContain('example.com/dest');
  });

  test('a miss shows a friendly 404 with a signup CTA', async ({ page }) => {
    await bootLang(page, 'en');
    await page.route('**/rest/v1/rpc/resolve_short_link_by_slug*', (route) =>
      route.fulfill({ json: null }),
    );
    await page.goto('/s/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('404');
    await expect(page.getByRole('link', { name: /Create your own/i })).toBeVisible();
  });
});

// ─── /dashboard/short-links tool ─────────────────────────────────────────────

test.describe('SHORT.1 — short links tool', () => {
  test('lists existing short links', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    await routeShortLinks(page, [mkRow('alpha', 1), mkRow('beta', 2)]);
    await page.goto('/dashboard/short-links');
    await page.waitForLoadState('networkidle');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByText('/s/alpha')).toBeVisible();
  });

  test('creates a new short link', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    await routeShortLinks(page, []);
    await page.goto('/dashboard/short-links');
    await page.waitForLoadState('networkidle');

    await expect(rows(page)).toHaveCount(0);
    await page.getByTestId('short-link-slug').fill('summer-sale');
    await page.getByTestId('short-link-url').fill('example.com/really/long/link');
    await page.getByTestId('short-link-create').click();

    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByText('/s/summer-sale')).toBeVisible();
  });

  test('deletes a short link', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    await routeShortLinks(page, [mkRow('alpha', 1), mkRow('beta', 2)]);
    await page.goto('/dashboard/short-links');
    await page.waitForLoadState('networkidle');

    await expect(rows(page)).toHaveCount(2);
    await rows(page).first().getByRole('button', { name: 'Delete' }).click();
    await expect(rows(page)).toHaveCount(1);
  });

  test('rejects a reserved slug', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    await routeShortLinks(page, []);
    await page.goto('/dashboard/short-links');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('short-link-slug').fill('admin');
    await page.getByTestId('short-link-url').fill('https://example.com');
    await page.getByTestId('short-link-create').click();

    await expect(page.getByTestId('short-link-error')).toBeVisible();
    await expect(page.getByTestId('short-link-error')).toContainText(/reserved/i);
    await expect(rows(page)).toHaveCount(0);
  });

  test('gates creation at the free-plan quota', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    // Free limit is 3 — seed exactly 3 so the account is at quota.
    await routeShortLinks(page, [mkRow('one', 1), mkRow('two', 2), mkRow('three', 3)]);
    await page.goto('/dashboard/short-links');
    await page.waitForLoadState('networkidle');

    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('short-link-quota-reached')).toBeVisible();

    // Even with valid inputs, create stays disabled at quota.
    await page.getByTestId('short-link-slug').fill('four');
    await page.getByTestId('short-link-url').fill('https://example.com/four');
    await expect(page.getByTestId('short-link-create')).toBeDisabled();
  });
});

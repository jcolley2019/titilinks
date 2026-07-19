// PIXELS.1 — tracking pixels (Meta / TikTok / GA4) on the public page, PRO-gated.
//
// Four surfaces, four specs:
//  1. Editor  — a Pro creator opens the panel from the Analytics row and its
//               Save writes the three IDs to profiles (asserted on the PATCH).
//  2. Gating  — a Free creator sees the established lock badge + upsell toast;
//               the panel never opens.
//  3. Public  — the /:handle route injects the base pixel <script> tags when the
//               owner has IDs set (OBVIOUSLY FAKE ids; external hosts blocked so
//               no real endpoint is ever hit — tag presence/attributes only).
//  4. Fence   — the editor AND DP.2's visitor-preview inject NOTHING. Injection
//               is keyed to the PublicProfile route (which the preview never
//               mounts), not to editMode. Spec 3 proves the [data-pixel] selector
//               catches real injection; this spec proves it's absent off-route —
//               together they are the positive/negative pair. (Negative-prove was
//               run at dev time: rendering <TrackingPixels> inside the shared
//               EditableProfileView made THIS spec go red; reverted.)
//
// profiles is owner-only under RLS, so the editor reads/writes it directly while
// the public route reads pixels through the get_public_tracking_pixels RPC —
// both are mocked here so the suite touches no real pixel data.

import { test, expect } from '@playwright/test';

const DESKTOP = { width: 1440, height: 1000 };
const PROFILE = '/joeyc';

// Obviously-fake pixel IDs — shaped to pass the injector's safe charset, but
// unmistakably not real ad accounts.
const FAKE_META = '000000000000000';
const FAKE_TIKTOK = 'FAKETIKTOKPIXEL0000';
const FAKE_GA4 = 'G-FAKE000000';

// External pixel hosts — aborted so a fired base event can never reach a real
// endpoint. The injected tags still land in the DOM (that's what we assert).
const PIXEL_HOSTS = /connect\.facebook\.net|facebook\.com\/tr|analytics\.tiktok\.com|googletagmanager\.com|google-analytics\.com/;

/**
 * Intercept the two profiles reads (plan for entitlements, pixel columns for the
 * editor form) and capture the save PATCH. Unrelated profiles reads (e.g.
 * onboarding status) pass through to the real DB so the editor still boots.
 */
async function routeProfiles(
  page: import('@playwright/test').Page,
  opts: { plan: 'free' | 'pro' | 'business'; onPatch?: (body: Record<string, unknown>) => void },
) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (method === 'GET' && /select=plan(\b|&|$)/.test(url)) {
      return route.fulfill({ json: { plan: opts.plan } });
    }
    if (method === 'GET' && /meta_pixel_id/.test(url)) {
      return route.fulfill({ json: { meta_pixel_id: null, tiktok_pixel_id: null, ga4_id: null } });
    }
    if (method === 'PATCH') {
      try {
        opts.onPatch?.(JSON.parse(req.postData() || '{}'));
      } catch {
        /* ignore */
      }
      return route.fulfill({ status: 200, json: {} });
    }
    return route.continue();
  });
}

const openEditProfile = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
};

test.describe('Tracking Pixels (PIXELS.1)', () => {
  test('Pro creator opens the panel from the Analytics row and Save persists the IDs', async ({ page }) => {
    let patch: Record<string, unknown> | null = null;
    await routeProfiles(page, { plan: 'pro', onPatch: (b) => (patch = b) });

    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    await openEditProfile(page);

    // The Analytics-group row opens the real panel (no coming-soon toast).
    await page.getByRole('button', { name: /tracking pixels/i }).filter({ visible: true }).first().click();
    const panel = page.getByTestId('tracking-pixels-panel');
    await expect(panel).toBeVisible();

    await page.getByTestId('pixel-meta').fill(FAKE_META);
    await page.getByTestId('pixel-tiktok').fill(FAKE_TIKTOK);
    await page.getByTestId('pixel-ga4').fill(FAKE_GA4);
    await page.getByTestId('pixel-save').click();

    // Save confirmed, and the write carried exactly the three IDs to profiles.
    await expect(page.getByText('Tracking pixels saved')).toBeVisible();
    expect(patch).toMatchObject({
      meta_pixel_id: FAKE_META,
      tiktok_pixel_id: FAKE_TIKTOK,
      ga4_id: FAKE_GA4,
    });
  });

  test('Free creator sees the lock badge + upsell; the panel does not open', async ({ page }) => {
    await routeProfiles(page, { plan: 'free' });

    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    await openEditProfile(page);

    // Established lock pattern: the row wears the PRO badge for Free.
    const row = page.getByRole('button', { name: /tracking pixels/i }).filter({ visible: true }).first();
    await expect(row).toContainText('PRO');

    // Tapping it upsells instead of opening the panel.
    await row.click();
    await expect(page.getByText('Tracking pixels are a Pro feature')).toBeVisible();
    await expect(page.getByTestId('tracking-pixels-panel')).toHaveCount(0);
  });

  test('the public route injects the base pixel tags when IDs are set', async ({ page }) => {
    await page.route(PIXEL_HOSTS, (route) => route.abort());
    await page.route('**/rest/v1/rpc/get_public_tracking_pixels*', (route) =>
      route.fulfill({ json: [{ meta_pixel_id: FAKE_META, tiktok_pixel_id: FAKE_TIKTOK, ga4_id: FAKE_GA4 }] }),
    );

    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');

    // Each pixel's tag is present and carries its (fake) ID — assert attributes
    // only; the external loaders were aborted so nothing hit a real endpoint.
    await expect(page.locator('script[data-pixel="meta"]')).toHaveAttribute('data-pixel-id', FAKE_META);
    await expect(page.locator('script[data-pixel="tiktok"]')).toHaveAttribute('data-pixel-id', FAKE_TIKTOK);
    await expect(page.locator('script[data-pixel="ga4"]')).toHaveAttribute('data-pixel-id', FAKE_GA4);
  });

  test('THE FENCE: the editor and the visitor-preview inject nothing', async ({ page }) => {
    // Even in a session where the RPC WOULD serve IDs, the editor route never
    // calls it — injection is keyed to the public route, not to editMode.
    await page.route('**/rest/v1/rpc/get_public_tracking_pixels*', (route) =>
      route.fulfill({ json: [{ meta_pixel_id: FAKE_META, tiktok_pixel_id: FAKE_TIKTOK, ga4_id: FAKE_GA4 }] }),
    );
    await page.setViewportSize(DESKTOP);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    // Edit mode: no injected pixels.
    await expect(page.locator('script[data-pixel]')).toHaveCount(0);

    // Flip to the visitor-preview (shared EditableProfileView, editMode=false).
    // Still nothing — the preview shares the view branch but not the route.
    const toggle = page.getByTestId('preview-mode-toggle');
    await expect(page.getByTestId('device-frame')).toBeVisible();
    await toggle.click();
    await expect(page.locator('script[data-pixel]')).toHaveCount(0);
  });
});

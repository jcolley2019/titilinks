/**
 * TL.ONB.PERF.1 — the onboarding photo uploads when it is PICKED, not when
 * Continue is clicked, and the local preview is never swapped for the uploaded
 * public URL.
 *
 * WHY. PERF.0 measured step 2's Continue with a 5 MB phone photo at ~1.06 s in
 * a harness where the storage POST was answered instantly (~0.42 s with no
 * photo); in production that POST is 2-4 s of uplink with the main thread idle.
 * Back was slow for the other half of the same defect: step 2 swapped
 * avatarPreview for the just-written public URL, so every surface showing the
 * photo dropped its decoded local copy and re-fetched a cold storage object.
 *
 * HOW THIS DRIVES THE WIZARD. Same door as spec 61: the resume guard's two GET
 * reads are answered empty so the wizard boots at step 1, and sessionStorage is
 * cleared through addInitScript. Every write is FULFILLED locally (page routes
 * are consulted before the fixture's context route), so nothing reaches
 * Supabase — the storage POST answers after UPLOAD_MS, which is what makes "is
 * Continue still waiting on it?" observable.
 */
import { test, expect, type Locator, type Page, type Route } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { screenshotPage } from './helpers/auth';

const T = translations.en;

/** How long the mocked storage POST holds before answering. */
const UPLOAD_MS = 1500;

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const MODE_ID = '22222222-2222-4222-8222-222222222222';
const BLOCK_ID = '33333333-3333-4333-8333-333333333333';

interface Harness {
  /** One entry per storage upload POST, in flight order. */
  uploadStarts: string[];
  /** One entry per storage upload POST that has ANSWERED. */
  uploadDones: string[];
  /** Bodies of every pages INSERT. */
  pageInserts: any[];
  /** Any request for a PUBLIC avatar object — the swap this change removes. */
  publicAvatarFetches: string[];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function setupOnboarding(page: Page): Promise<Harness> {
  const h: Harness = { uploadStarts: [], uploadDones: [], pageInserts: [], publicAvatarFetches: [] };

  await page.addInitScript(() => {
    try { window.sessionStorage.clear(); } catch { /* storage disabled */ }
  });

  // The Back fix, observed from outside: if avatarPreview were swapped for the
  // public URL, the preview <img> would fetch this path.
  page.on('request', (req) => {
    if (req.url().includes('/storage/v1/object/public/avatars/')) h.publicAvatarFetches.push(req.url());
  });

  // Storage: answer late, so an upload still in flight is visible in the UI.
  await page.route('**/storage/v1/object/avatars/**', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = route.request().url();
    h.uploadStarts.push(url);
    await new Promise((r) => setTimeout(r, UPLOAD_MS));
    // Recorded AFTER the answer is handed back, so "done" means the client has
    // it — a test that clicks on this signal is not racing the response.
    await json(route, { Key: `avatars/${url.split('/avatars/')[1]}`, Id: 'mock' });
    h.uploadDones.push(url);
  });

  // profiles: resume + availability reads empty, the step-2 write acknowledged.
  await page.route('**/rest/v1/profiles*', async (route) => {
    const m = route.request().method();
    if (m === 'GET') return json(route, []);
    if (m === 'PATCH') return route.fulfill({ status: 204, body: '' });
    return route.fallback();
  });

  // pages: resume + availability reads empty, the step-3 insert captured.
  await page.route('**/rest/v1/pages*', async (route) => {
    const m = route.request().method();
    if (m === 'GET') return json(route, []);
    if (m === 'POST') {
      h.pageInserts.push(route.request().postDataJSON());
      return json(route, {
        id: PAGE_ID, user_id: 'mock-user', handle: 'mock', display_name: 'mock',
        avatar_url: null, avatar_original_url: null, bio: null, theme_json: {},
        goal_primary_offer_item_id: null, goal_secondary_item_id: null,
        created_at: '', updated_at: '',
      }, 201);
    }
    return route.fallback();
  });

  await page.route('**/rest/v1/modes*', async (route) =>
    route.request().method() === 'POST'
      ? json(route, [{ id: MODE_ID, page_id: PAGE_ID, type: 'page1' }], 201)
      : route.fallback());

  // GET [] keeps prefillBlockContent on its "nothing seeded yet" path; the
  // single-row insert readback needs an object, the batch insert ignores it.
  await page.route('**/rest/v1/blocks*', async (route) => {
    const m = route.request().method();
    if (m === 'GET') return json(route, []);
    if (m === 'POST') return json(route, { id: BLOCK_ID }, 201);
    return route.fallback();
  });

  await page.route('**/rest/v1/block_items*', async (route) =>
    route.request().method() === 'POST' ? json(route, [], 201) : route.fallback());

  return h;
}

/** A small photo-like JPEG, built on about:blank before the app is loaded. */
async function makeJpeg(page: Page): Promise<Buffer> {
  await page.goto('about:blank');
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 400, 300);
    g.addColorStop(0, '#3a6ea5'); g.addColorStop(1, '#c9a55c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 400, 300);
    return c.toDataURL('image/jpeg', 0.85);
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Step 1 → step 2, with the profile fields filled and Continue enabled. */
async function toStepTwo(page: Page, desktop: boolean): Promise<Locator | Page> {
  const scope: Locator | Page = desktop ? page.getByTestId('onboarding-panel') : page;
  await page.goto('/onboarding');
  await scope.getByRole('button').filter({ hasText: T['onboardingFlow.styleFullBleed'] }).first().click();
  await scope.getByRole('button', { name: T['onboardingFlow.continue'], exact: true }).click();
  const name = scope.getByPlaceholder(T['onboardingFlow.displayNamePlaceholder']);
  await expect(name).toBeVisible();
  await name.fill('Upload Person');
  await scope.getByPlaceholder(T['onboardingFlow.usernamePlaceholder']).fill('uploadperson');
  await expect(page.getByTestId('onb-continue')).toBeEnabled({ timeout: 15_000 });
  return scope;
}

/** Pick the photo and accept it unchanged, leaving step 2 on screen. */
async function pickPhoto(page: Page, scope: Locator | Page, buf: Buffer) {
  await scope.locator('input[type="file"]').setInputFiles({ name: 'pick.jpg', mimeType: 'image/jpeg', buffer: buf });
  const useOriginal = page.getByRole('button', { name: T['onboardingFlow.useOriginal'], exact: true });
  await expect(useOriginal).toBeVisible({ timeout: 15_000 });
  await useOriginal.click();
  await expect(scope.getByText(T['onboardingFlow.changePhoto'], { exact: true })).toBeVisible({ timeout: 15_000 });
}

test.describe('TL.ONB.PERF.1 — the photo uploads on pick', () => {
  test('the upload starts on pick, before Continue is ever clicked', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    const buf = await makeJpeg(page);
    const h = await setupOnboarding(page);
    const scope = await toStepTwo(page, desktop);

    expect(h.uploadStarts).toHaveLength(0);
    await pickPhoto(page, scope, buf);

    // Nothing has been clicked but the photo affordance: the bytes are moving.
    await expect.poll(() => h.uploadStarts.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: T['onboardingFlow.yourProfile'], exact: true })).toBeVisible();
  });

  test('Continue during the upload says so, then advances when it lands', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    const buf = await makeJpeg(page);
    const h = await setupOnboarding(page);
    const scope = await toStepTwo(page, desktop);
    await pickPhoto(page, scope, buf);

    // Straight into the in-flight window (the mock holds each POST 1.5 s).
    const cont = page.getByTestId('onb-continue');
    await cont.click();
    await expect(cont).toContainText(T['onboardingFlow.uploading']);
    await expect(cont).toBeDisabled();
    await screenshotPage(page, `${testInfo.project.name}-onb-uploading`);

    await expect(scope.getByRole('heading', { name: T['onboardingFlow.chooseButtons'], exact: true }))
      .toBeVisible({ timeout: 30_000 });
    expect(h.uploadDones.length).toBeGreaterThan(0);
  });

  test('with the upload already done, Continue does not wait on the network', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    const buf = await makeJpeg(page);
    const h = await setupOnboarding(page);
    const scope = await toStepTwo(page, desktop);
    await pickPhoto(page, scope, buf);

    // Both objects (display + original) are in the bucket before we click.
    await expect.poll(() => h.uploadDones.length, { timeout: 20_000 }).toBe(2);
    const before = h.uploadStarts.length;

    const t0 = Date.now();
    await page.getByTestId('onb-continue').click();
    await expect(scope.getByRole('heading', { name: T['onboardingFlow.chooseButtons'], exact: true }))
      .toBeVisible({ timeout: 30_000 });
    const elapsed = Date.now() - t0;

    // The invariant, on both projects: Continue re-used the pick-time upload
    // instead of starting another one.
    expect(h.uploadStarts).toHaveLength(before);
    // The budget. Desktop is PERF.0's 420 ms no-photo baseline plus headroom;
    // WebKit's own floor for this transition measured 1149 ms in PERF.0, so the
    // mobile budget is set above that and still far under the 1500 ms an
    // upload-on-Continue would have cost.
    expect(elapsed).toBeLessThan(desktop ? 800 : 2000);
  });

  test('Back keeps the local preview and does not re-disable Continue', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    const buf = await makeJpeg(page);
    const h = await setupOnboarding(page);
    const scope = await toStepTwo(page, desktop);
    await pickPhoto(page, scope, buf);
    await expect.poll(() => h.uploadDones.length, { timeout: 20_000 }).toBe(2);

    await page.getByTestId('onb-continue').click();
    await expect(scope.getByRole('heading', { name: T['onboardingFlow.chooseButtons'], exact: true }))
      .toBeVisible({ timeout: 30_000 });

    await scope.getByRole('button', { name: T['onboardingFlow.back'], exact: true }).click();
    await expect(page.getByRole('heading', { name: T['onboardingFlow.yourProfile'], exact: true })).toBeVisible();

    // Continue is live immediately and STAYS live: no 500 ms re-check window.
    const cont = page.getByTestId('onb-continue');
    const deadline = Date.now() + 400;
    do {
      expect(await cont.isDisabled()).toBe(false);
    } while (Date.now() < deadline);
    await expect(scope.getByText(T['onboardingFlow.available'], { exact: true })).toBeVisible();
    await expect(scope.getByText(T['onboardingFlow.checkingAvailability'], { exact: true })).toHaveCount(0);

    // The photo on screen is still the local copy, and no public object was
    // ever fetched — the swap that made Back wait on cold storage is gone.
    await expect(page.locator('img[src^="data:"]').first()).toBeVisible();
    expect(h.publicAvatarFetches).toEqual([]);
  });

  test('the phone preview still shows the photo after Back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the phone stage is a ≥lg surface');
    await page.setViewportSize({ width: 1440, height: 900 });
    const buf = await makeJpeg(page);
    const h = await setupOnboarding(page);
    const scope = await toStepTwo(page, true);
    await pickPhoto(page, scope, buf);
    await expect.poll(() => h.uploadDones.length, { timeout: 20_000 }).toBe(2);

    const frame = page.getByTestId('device-frame');
    await expect(frame.locator('img[src^="data:"]').first()).toBeVisible();

    await page.getByTestId('onb-continue').click();
    await expect(scope.getByRole('heading', { name: T['onboardingFlow.chooseButtons'], exact: true }))
      .toBeVisible({ timeout: 30_000 });
    await scope.getByRole('button', { name: T['onboardingFlow.back'], exact: true }).click();
    await expect(page.getByRole('heading', { name: T['onboardingFlow.yourProfile'], exact: true })).toBeVisible();

    await expect(frame.locator('img[src^="data:"]').first()).toBeVisible();
    await screenshotPage(page, 'desktop-onb-back-keeps-photo');
  });

  test('the page insert carries the uploaded URL, never a data: URL', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    const buf = await makeJpeg(page);
    const h = await setupOnboarding(page);
    const scope = await toStepTwo(page, desktop);
    await pickPhoto(page, scope, buf);
    await expect.poll(() => h.uploadDones.length, { timeout: 20_000 }).toBe(2);

    await page.getByTestId('onb-continue').click();
    await expect(scope.getByRole('heading', { name: T['onboardingFlow.chooseButtons'], exact: true }))
      .toBeVisible({ timeout: 30_000 });

    // Step 3's Continue is the pages.insert (fulfilled locally, never sent).
    await scope.getByRole('button', { name: T['onboardingFlow.continue'], exact: true }).click();
    await expect.poll(() => h.pageInserts.length, { timeout: 30_000 }).toBe(1);

    const inserted = h.pageInserts[0];
    const avatar = Array.isArray(inserted) ? inserted[0].avatar_url : inserted.avatar_url;
    expect(avatar).toContain('/storage/v1/object/public/avatars/');
    expect(avatar.startsWith('data:')).toBe(false);
  });
});

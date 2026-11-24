/**
 * FRAGILE.COLOR.1 — audit S2: a typed colour is always stored as a valid,
 * opaque six-digit hex, and a mistyped colour already in the database is
 * repaired on read.
 *
 * Before this brick the page-colour and title-colour text boxes saved whatever
 * was typed on every keystroke. `FFC0CB`, `#ff`, `#ffffff80` or `rgba(…)`
 * became invalid or see-through CSS under the hero: the fade died and the page
 * showed a stripe or the dark wrapper.
 *
 * FIXTURE MODEL — battery account, zero real writes. The editor's own `pages`
 * read is passed through with its theme pinned to a known solid colour (the
 * battery's stored theme is not canonical — never assert stored account data
 * as a baseline), and every `pages` write is answered here and recorded, so
 * nothing reaches the database and no allowWrites() opt-in is needed. The
 * public tests run ANONYMOUSLY on the battery handle with the `pages_public`
 * read rewritten the same way and every mutating request aborted. The
 * onboarding test drives the wizard the spec 61/62 way: the resume reads are
 * answered empty and every write is fulfilled locally.
 *
 * normalizeHexColor's accept/reject table lives in scripts/hex-color.test.mjs
 * (the repo's src/lib unit-test pattern, run by `npm run guard`).
 *
 * Desktop viewport + DPR 1 in the editor tests (spec 52's reasoning): canvas
 * queries are scoped to getByTestId('device-frame') so the CSS-hidden mobile
 * render stays out of reach.
 */
import { test, expect, type Locator, type Page, type Route } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { TEST_HANDLE } from './helpers/auth';

test.use({ deviceScaleFactor: 1 });

// A save's onUpdate can still be re-reading through a passthrough route when
// the test ends; drop the routes so that read is ignored.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const EN = translations.en as Record<string, string>;
const DESKTOP = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };
const ANONYMOUS = { cookies: [], origins: [] };
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const START_BG = '#123456';
const START_TEXT = '#EEEEEE';

const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * The stored theme with a known solid background + title colour and the hero
 * layout (per-page styles cleared), so the content panel and the fade paint the
 * page colour on every run whatever the battery's theme happens to be.
 */
function pinTheme(raw: unknown, bg: string, text: string) {
  const t = JSON.parse(JSON.stringify(raw && typeof raw === 'object' ? raw : {}));
  t.background = { ...(t.background || {}), type: 'solid', solid_color: bg, gradient_css: '', image_url: '' };
  t.typography = { ...(t.typography || {}), text_color: text };
  t.pageStyle = 'hero';
  t.auto_contrast = false;
  if (t.pages && typeof t.pages === 'object') {
    for (const id of Object.keys(t.pages)) {
      if (t.pages[id] && typeof t.pages[id] === 'object') delete t.pages[id].style;
    }
  }
  return t;
}

/** Rewrite a REST read's rows (object or array) through `fn`. */
async function rewriteRead(route: Route, fn: (row: any) => any) {
  const res = await route.fetch();
  const body = await res.json();
  const out = Array.isArray(body)
    ? body.map((r) => (r && 'theme_json' in r ? fn(r) : r))
    : body && typeof body === 'object' && 'theme_json' in body ? fn(body) : body;
  await route.fulfill({ response: res, body: JSON.stringify(out) });
}

/** What the page renders under the hero: content panel, fade, root text colour. */
async function surface(scope: Locator | Page) {
  return scope.getByTestId('hero-sticky').first().evaluate((hero) => {
    let panel = hero.nextElementSibling as HTMLElement | null;
    while (panel && panel.style.minHeight !== '60vh') panel = panel.nextElementSibling as HTMLElement | null;
    const fade = panel
      ? (Array.from(panel.children).find((c) => (c as HTMLElement).style.top === '-60px') as HTMLElement | undefined)
      : undefined;
    const root = hero.closest('.max-w-\\[640px\\]') as HTMLElement | null;
    return {
      panel: panel ? getComputedStyle(panel).backgroundColor : null,
      fade: fade ? getComputedStyle(fade).backgroundImage : null,
      text: root ? getComputedStyle(root).color : null,
    };
  });
}

// ── editor harness ───────────────────────────────────────────────────────────

interface EditorFake {
  /** theme_json of every pages PATCH the editor sent, in order. */
  saves: any[];
}

async function seedEditor(page: Page): Promise<EditorFake> {
  const fake: EditorFake = { saves: [] };
  await page.route((url) => url.pathname === '/rest/v1/pages', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return rewriteRead(route, (row) => ({ ...row, theme_json: pinTheme(row.theme_json, START_BG, START_TEXT) }));
    }
    let body: any = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    if (req.method() === 'PATCH') fake.saves.push(body?.theme_json);
    return route.fulfill({ status: 204, body: '' });
  });
  return fake;
}

const frame = (page: Page) => page.getByTestId('device-frame');

async function openDesign(page: Page, tab: 'background' | 'title' = 'background') {
  await page.setViewportSize(DESKTOP);
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await expect(frame(page)).toBeVisible();
  await expect.poll(async () => (await surface(frame(page))).panel, { timeout: 20_000 }).toBe(rgb(START_BG));
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /customize profile/i }).filter({ visible: true }).first().click();
  if (tab === 'title') {
    await page.getByRole('tab', { name: EN['design.tabTitle'] }).filter({ visible: true }).first().click();
  }
}

const bgBox = (page: Page) => page.getByPlaceholder('#000000').filter({ visible: true }).first();
const textBox = (page: Page) => page.getByPlaceholder('#FFFFFF').filter({ visible: true }).first();
const saveButton = (page: Page) =>
  page.getByRole('button', { name: EN['blockEditor.save'], exact: true }).filter({ visible: true }).first();

async function save(page: Page, fake: EditorFake) {
  const before = fake.saves.length;
  await expect(saveButton(page)).toBeEnabled();
  await saveButton(page).click();
  await expect.poll(() => fake.saves.length).toBe(before + 1);
  return fake.saves[before];
}

test.describe('FRAGILE.COLOR.1 — Design editor, page colour', () => {
  test('typing FFC0CB paints the preview pink and saves #ffc0cb', async ({ page }) => {
    const fake = await seedEditor(page);
    await openDesign(page);

    await bgBox(page).fill('FFC0CB');
    await expect.poll(async () => (await surface(frame(page))).panel).toBe('rgb(255, 192, 203)');
    await expect(bgBox(page)).toHaveAttribute('aria-invalid', 'false');
    const fade = (await surface(frame(page))).fade ?? '';
    expect(fade, 'the hero fade is a valid gradient ending on the page colour').toContain('linear-gradient');
    expect(fade).toContain('rgb(255, 192, 203)');

    const saved = await save(page, fake);
    expect(saved.background.solid_color).toBe('#ffc0cb');
  });

  test('#ff is marked invalid, stores nothing, and the box returns to the stored colour on blur', async ({ page }) => {
    const fake = await seedEditor(page);
    await openDesign(page);

    // A valid six-digit entry first (kept exactly as typed), so Save has a draft.
    await bgBox(page).fill('#ABCDEF');
    await expect.poll(async () => (await surface(frame(page))).panel).toBe(rgb('#ABCDEF'));

    await bgBox(page).fill('#ff');
    await expect(bgBox(page)).toHaveValue('#ff');
    await page.waitForTimeout(200);
    expect((await surface(frame(page))).panel, 'the preview keeps the previous colour').toBe(rgb('#ABCDEF'));
    await expect(bgBox(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(bgBox(page)).toHaveClass(/border-red-500/);

    await bgBox(page).blur();
    await expect(bgBox(page)).toHaveValue('#ABCDEF');
    await expect(bgBox(page)).toHaveAttribute('aria-invalid', 'false');

    const saved = await save(page, fake);
    expect(saved.background.solid_color).toBe('#ABCDEF');
  });

  test('#ffffff80 stores #ffffff; rgba(0,0,0,.5) stores nothing new', async ({ page }) => {
    const fake = await seedEditor(page);
    await openDesign(page);

    await bgBox(page).fill('#ffffff80');
    await expect.poll(async () => (await surface(frame(page))).panel).toBe('rgb(255, 255, 255)');
    await expect(bgBox(page)).toHaveAttribute('aria-invalid', 'false');

    await bgBox(page).fill('rgba(0,0,0,.5)');
    await page.waitForTimeout(200);
    expect((await surface(frame(page))).panel).toBe('rgb(255, 255, 255)');
    await expect(bgBox(page)).toHaveAttribute('aria-invalid', 'true');

    const saved = await save(page, fake);
    expect(saved.background.solid_color).toBe('#ffffff');
  });

  test('a picker change while the box is not focused updates the box', async ({ page }) => {
    await seedEditor(page);
    await openDesign(page);

    // Leave the box mid-edit on an invalid value, then use the picker: the box
    // must show the picked (stored) colour, not the abandoned text.
    await bgBox(page).fill('#ff');
    await expect(bgBox(page)).toHaveAttribute('aria-invalid', 'true');

    const sat = page.locator('.react-colorful__saturation').filter({ visible: true }).first();
    const box = await sat.boundingBox();
    if (!box) throw new Error('picker saturation area not found');
    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.2);

    await expect(bgBox(page)).not.toBeFocused();
    await expect(bgBox(page)).toHaveAttribute('aria-invalid', 'false');
    await expect.poll(async () => bgBox(page).inputValue()).toMatch(/^#[0-9a-fA-F]{6}$/);
    const picked = await bgBox(page).inputValue();
    expect(picked.toLowerCase()).not.toBe(START_BG);
    await expect.poll(async () => (await surface(frame(page))).panel).toBe(rgb(picked));
  });
});

test.describe('FRAGILE.COLOR.1 — Design editor, title colour', () => {
  test('C0FFEE is accepted as #c0ffee; "blue" is rejected', async ({ page }) => {
    const fake = await seedEditor(page);
    await openDesign(page, 'title');
    await expect(textBox(page)).toHaveValue(START_TEXT);

    await textBox(page).fill('C0FFEE');
    await expect.poll(async () => (await surface(frame(page))).text).toBe('rgb(192, 255, 238)');
    await expect(textBox(page)).toHaveAttribute('aria-invalid', 'false');

    await textBox(page).fill('blue');
    await page.waitForTimeout(200);
    expect((await surface(frame(page))).text, 'a rejected entry leaves the colour as it was').toBe('rgb(192, 255, 238)');
    await expect(textBox(page)).toHaveAttribute('aria-invalid', 'true');

    await textBox(page).blur();
    await expect(textBox(page)).toHaveValue('#c0ffee');

    const saved = await save(page, fake);
    expect(saved.typography.text_color).toBe('#c0ffee');
  });
});

// ── read repair, public page ────────────────────────────────────────────────

async function blockWrites(page: Page) {
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    if (!MUTATING.has(req.method())) return route.fallback();
    if (req.url().includes('/rest/v1/rpc/get_public_')) return route.fallback();
    return route.abort('blockedbyclient');
  });
}

async function publicWithColour(page: Page, bg: string) {
  await blockWrites(page);
  await page.route('**/rest/v1/pages_public*', async (route) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('handle=eq.')) return route.fallback();
    return rewriteRead(route, (row) => ({ ...row, theme_json: pinTheme(row.theme_json, bg, '#ffffff') }));
  });
  await page.goto(`/${TEST_HANDLE}`);
  await expect(page.getByText(`@${TEST_HANDLE}`).first()).toBeVisible({ timeout: 20_000 });
}

test.describe('FRAGILE.COLOR.1 — a mistyped stored colour is repaired on read', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test('solid_color "FFC0CB" renders pink with a valid hero fade', async ({ page }) => {
    await publicWithColour(page, 'FFC0CB');
    const s = await surface(page);
    expect(s.panel, 'the page colour, not the dark wrapper').toBe('rgb(255, 192, 203)');
    expect(s.fade ?? '').toContain('linear-gradient');
    expect(s.fade ?? '').toContain('rgb(255, 192, 203)');
  });

  test('a valid six-digit colour renders unchanged', async ({ page }) => {
    await publicWithColour(page, '#3A6EA5');
    const s = await surface(page);
    expect(s.panel).toBe('rgb(58, 110, 165)');
    expect(s.fade ?? '').toContain('rgb(58, 110, 165)');
  });
});

// ── onboarding, Choose Your Vibe ────────────────────────────────────────────

const PAGE_ID = '11111111-1111-4111-8111-111111111192';
const MODE_ID = '22222222-2222-4222-8222-222222222192';
const BLOCK_ID = '33333333-3333-4333-8333-333333333192';

async function setupOnboarding(page: Page): Promise<{ pageInserts: any[] }> {
  const h = { pageInserts: [] as any[] };
  await page.addInitScript(() => {
    try { window.sessionStorage.clear(); } catch { /* storage disabled */ }
  });
  await page.route('**/rest/v1/profiles*', async (route) => {
    const m = route.request().method();
    if (m === 'GET') return json(route, []);
    if (m === 'PATCH') return route.fulfill({ status: 204, body: '' });
    return route.fallback();
  });
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
    if (m === 'PATCH') return route.fulfill({ status: 204, body: '' });
    return route.fallback();
  });
  await page.route('**/rest/v1/modes*', async (route) =>
    route.request().method() === 'POST'
      ? json(route, [{ id: MODE_ID, page_id: PAGE_ID, type: 'page1' }], 201)
      : route.fallback());
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

test.describe('FRAGILE.COLOR.1 — onboarding, Choose Your Vibe', () => {
  test('the typed colour stores only valid hex (solid and a gradient stop)', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    const h = await setupOnboarding(page);
    const scope: Locator | Page = desktop ? page.getByTestId('onboarding-panel') : page;

    await page.goto('/onboarding');
    await scope.getByRole('button').filter({ hasText: EN['onboardingFlow.styleHero'] }).first().click();
    await scope.getByRole('button', { name: EN['onboardingFlow.continue'], exact: true }).click();
    const name = scope.getByPlaceholder(EN['onboardingFlow.displayNamePlaceholder']);
    await expect(name).toBeVisible();
    await name.fill('Colour Person');
    await scope.getByPlaceholder(EN['onboardingFlow.usernamePlaceholder']).fill('colourperson');
    await expect(page.getByTestId('onb-continue')).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId('onb-continue').click();
    // A hero page with no photo: the "Add a photo?" nudge, then on the second
    // Continue the skip acknowledgment, which advances.
    await scope.getByRole('button', { name: EN['onboardingFlow.photoNudgeNotNow'], exact: true }).click();
    await page.getByTestId('onb-continue').click();
    await scope.getByRole('button', { name: EN['onboardingFlow.photoSkipContinue'], exact: true }).click();
    await expect(scope.getByRole('heading', { name: 'Choose Your Vibe', exact: true })).toBeVisible({ timeout: 20_000 });

    const box = scope.getByPlaceholder('#000000');
    const swatch = scope.locator('div.h-20.w-full.rounded-2xl');
    await box.fill('FFC0CB');
    await expect(swatch).toHaveCSS('background-color', 'rgb(255, 192, 203)');
    await expect(box).toHaveAttribute('aria-invalid', 'false');

    await box.fill('#ff');
    await page.waitForTimeout(200);
    await expect(swatch).toHaveCSS('background-color', 'rgb(255, 192, 203)');
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await box.blur();
    await expect(box).toHaveValue('#ffc0cb');

    // Gradient: the start stop takes a three-digit entry, expanded.
    await scope.getByRole('button', { name: 'Gradient', exact: true }).click();
    await box.fill('ABC');
    await expect(box).toHaveAttribute('aria-invalid', 'false');
    await box.fill('rgba(1,2,3,.4)');
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await box.blur();
    await expect(box).toHaveValue('#aabbcc');
    await scope.getByRole('button', { name: 'Solid', exact: true }).click();
    await expect(box).toHaveValue('#ffc0cb');

    await scope.getByRole('button', { name: EN['onboardingFlow.continue'], exact: true }).click();
    await expect.poll(() => h.pageInserts.length, { timeout: 20_000 }).toBeGreaterThan(0);
    const bg = h.pageInserts[0].theme_json.background;
    expect(bg.solid_color).toBe('#ffc0cb');
  });
});

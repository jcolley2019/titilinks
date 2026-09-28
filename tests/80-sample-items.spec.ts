// TL.PUB.SAMPLES.1 — a visitor never sees a sample item.
//
// Every new page is seeded with sample blocks and items (OnboardingFlow,
// tpl-presets) so the creator can see what each block looks like in the
// editor. An item whose destination is still a placeholder (example.com, '#',
// '', a numberless wa.me) and that has no image is dropped at the public data
// boundaries — PublicProfile's fetch and the editor's visitor preview — and a
// block left with no items renders nothing. The edit canvas keeps the samples.
// The rule lives in src/lib/placeholder-item.ts; its isRealDestination is a
// verbatim copy of the sitemap's (guard PLACEHOLDER-RULE-PARITY).
//
// 1. The pure rule, imported inside a page served by the dev server (spec 74's
//    in-page import), including the block-type scope: email_subscribe, bio and
//    events rows carry no destination by design and are never filtered.
// 2. The public page, anonymous, with its blocks/block_items reads pinned to a
//    fixture (spec 23's harness: reads pinned, writes swallowed).
// 3. The editor's visitor toggle on the battery account, same fixture.
//
// Writes: none. Every non-GET to the pinned tables is fulfilled locally; the
// real pages/modes rows are only read. Desktop only: nothing here depends on
// the browser engine, and the device frame is desktop chrome.

import { test, expect, type Page } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

const DESKTOP = { width: 1440, height: 1000 };

// Fixture identifiers and labels. The real destination is the battery's shared
// fixture host — a reserved TLD, so nothing can ever resolve it, but it is not
// a placeholder host.
const LINKS_BLOCK_ID = 'pub1-links-block';
const PRODUCTS_BLOCK_ID = 'pub1-products-block';
const CTA_BLOCK_ID = 'pub1-cta-block';
const REAL_URL = 'https://fixture.titilinks.test/pub1';
const REAL_LABEL = 'PUB1 Real Link';
const SAMPLE_LINK_LABEL = 'PUB1 Sample Link';
const PRODUCT_LABELS = ['PUB1 Product A', 'PUB1 Product B', 'PUB1 Product C'];
const CTA_LABEL = 'PUB1 Sample CTA';

const item = (id: string, block_id: string, label: string, url: string, order_index: number) => ({
  id, block_id, label, url, order_index,
  is_adult: false, subtitle: null, badge: null, image_url: null, size: 'medium', style_json: null,
  cta_label: null, archived_at: null,
});

const FIXTURE_ITEMS = [
  item('pub1-link-sample', LINKS_BLOCK_ID, SAMPLE_LINK_LABEL, 'https://example.com', 0),
  item('pub1-link-real', LINKS_BLOCK_ID, REAL_LABEL, REAL_URL, 1),
  ...PRODUCT_LABELS.map((label, i) =>
    item(`pub1-product-${i}`, PRODUCTS_BLOCK_ID, label, `https://example.com/product-${i + 1}`, i)),
  item('pub1-cta', CTA_BLOCK_ID, CTA_LABEL, 'https://example.com/shop', 0),
];

// Pin the page's blocks and items to the fixture. The real pages/modes rows
// load from the database (read only); the page1 mode id is captured so the
// fixture blocks belong to the page being rendered. Writes are swallowed.
const pinSampleFixture = async (page: Page) => {
  let modeId = '';

  await page.route('**/rest/v1/modes*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    const res = await route.fetch();
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [body];
    modeId = (arr.find((m) => m?.type === 'page1') ?? arr[0])?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') {
      // ensure-default-blocks inserts — swallow, never touch the real table.
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (route.request().url().includes('type=in.')) {
      // TL.EVNT.SGL page-singleton graft probe (editor) — nothing to graft.
      return route.fulfill({ json: [] });
    }
    return route.fulfill({
      json: [
        { id: CTA_BLOCK_ID, mode_id: modeId, type: 'primary_cta', title: null, is_enabled: true, order_index: 0 },
        { id: LINKS_BLOCK_ID, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 1 },
        { id: PRODUCTS_BLOCK_ID, mode_id: modeId, type: 'product_cards', title: null, is_enabled: true, order_index: 2 },
      ],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ json: FIXTURE_ITEMS });
  });
};

type Row = { url: string | null; image_url: string | null };

test.describe('TL.PUB.SAMPLES.1 — the pure rule (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'pure function — one project only');
    await page.goto('/');
  });

  test('1. isPlaceholderItem: placeholders are samples, real links and images are not', async ({ page }) => {
    const cases: { row: Row; want: boolean }[] = [
      { row: { url: '', image_url: null }, want: true },
      { row: { url: '#', image_url: null }, want: true },
      { row: { url: 'https://example.com/blog', image_url: null }, want: true },
      { row: { url: 'https://sub.example.com', image_url: null }, want: true },
      { row: { url: 'https://wa.me/', image_url: '' }, want: true },
      { row: { url: 'https://wa.me/?text=x', image_url: '' }, want: true },
      { row: { url: 'https://instagram.com/x', image_url: null }, want: false },
      { row: { url: '', image_url: 'https://cdn.titilinks.test/photo.jpg' }, want: false },
    ];
    const got: boolean[] = await page.evaluate(async (rows) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = await import('/src/lib/placeholder-item.ts');
      return rows.map((r: Row) => m.isPlaceholderItem(r));
    }, cases.map((c) => c.row));
    cases.forEach((c, i) => expect(got[i], `isPlaceholderItem(${JSON.stringify(c.row)})`).toBe(c.want));
  });

  test('2. isSampleItem: only destination blocks drop samples; subscribe, bio and events rows never do', async ({ page }) => {
    const cases: { type: string; row: Row; want: boolean }[] = [
      { type: 'links', row: { url: 'https://example.com', image_url: null }, want: true },
      { type: 'product_cards', row: { url: 'https://example.com/product-1', image_url: null }, want: true },
      { type: 'primary_cta', row: { url: 'https://example.com/shop', image_url: null }, want: true },
      { type: 'social_icon_row', row: { url: '', image_url: null }, want: true },
      // The subscribe form's config row — url '#' unless a redirect is set.
      { type: 'email_subscribe', row: { url: '#', image_url: null }, want: false },
      // The bio text row — url '' and image_url '' by construction.
      { type: 'bio', row: { url: '', image_url: '' }, want: false },
      // An event with no ticket link and no poster is still an event.
      { type: 'events', row: { url: '', image_url: null }, want: false },
    ];
    const got: boolean[] = await page.evaluate(async (list) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = await import('/src/lib/placeholder-item.ts');
      return list.map((c: { type: string; row: Row }) => m.isSampleItem(c.type, c.row));
    }, cases.map(({ type, row }) => ({ type, row })));
    cases.forEach((c, i) => expect(got[i], `isSampleItem('${c.type}', ${JSON.stringify(c.row)})`).toBe(c.want));
  });
});

test.describe('TL.PUB.SAMPLES.1 — the public page drops sample items', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(`/${TEST_HANDLE}: the real link renders; no example.com anchor, no product card, no CTA`, async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop only');
    await pinSampleFixture(page);
    await page.goto(`/${TEST_HANDLE}?page=1`);
    await page.waitForLoadState('networkidle');

    // The real link is on the page — so the negatives below are not vacuous.
    await expect(page.locator('.lb-title', { hasText: REAL_LABEL }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`a[href="${REAL_URL}"]`).first()).toBeVisible();

    await expect(page.locator('a[href*="example.com"]'), 'no anchor points at example.com').toHaveCount(0);
    await expect(page.getByText(SAMPLE_LINK_LABEL), 'the sample link is gone').toHaveCount(0);
    for (const label of PRODUCT_LABELS) {
      await expect(page.getByText(label), `sample product "${label}" is gone`).toHaveCount(0);
    }
    await expect(page.getByText(CTA_LABEL), 'the sample CTA is gone').toHaveCount(0);

    // TL.PUB.SAMPLES.1b: the products block loses every item to this fixture
    // (all three are samples), so it must not linger as an empty <section> in
    // the block column — an empty section still eats a flex gap even with
    // nothing rendered inside it. The CTA block empties the same way for the
    // same reason, leaving the Links block (which keeps its one real item) as
    // the only block that renders a section at all. Scoped to the block
    // column itself (EditableProfileView's view-mode wrapper) — the page also
    // has an unrelated toast-notifications <section> landmark from sonner.
    const blockColumn = page.locator('.px-4.pb-20.flex.flex-col.gap-3');
    await expect(blockColumn.locator('section'), 'the emptied product_cards block renders no section, not just an empty one').toHaveCount(1);
  });
});

test.describe('TL.PUB.SAMPLES.1 — the editor keeps samples; its visitor preview drops them', () => {
  test('edit shows the samples, visitor hides them, back to edit shows them again', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop only');
    await page.setViewportSize(DESKTOP);
    await pinSampleFixture(page);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const frame = page.getByTestId('device-frame');
    const toggle = page.getByTestId('preview-mode-toggle');
    await expect(frame).toBeVisible();

    const samples = [SAMPLE_LINK_LABEL, ...PRODUCT_LABELS, CTA_LABEL];
    const expectSamplesShown = async () => {
      for (const label of samples) {
        await expect(frame.getByText(label).first(), `edit canvas shows "${label}"`).toBeVisible();
      }
    };

    // Edit mode: the canvas shows what each block looks like, samples included.
    await expect(frame.getByText(REAL_LABEL).first()).toBeVisible();
    await expectSamplesShown();

    // Visitor: exactly what the public page shows — the real link only.
    await toggle.click();
    await expect(frame.getByTitle('New photo')).toHaveCount(0);
    await expect(frame.locator(`a[href="${REAL_URL}"]`).first()).toBeVisible();
    for (const label of samples) {
      await expect(frame.getByText(label), `visitor preview hides "${label}"`).toHaveCount(0);
    }
    await expect(frame.locator('a[href*="example.com"]'), 'no anchor points at example.com').toHaveCount(0);

    // Session toggle, no reload: back to edit, the samples return.
    await toggle.click();
    await expect(frame.getByTitle('New photo')).toBeVisible();
    await expectSamplesShown();
  });
});

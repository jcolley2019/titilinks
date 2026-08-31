// TL.SECT.3 — the Sections rail, end to end.
//
// TL.SECT.1 made the edit canvas honest: a block toggled off renders nowhere in
// the phone preview, exactly as it renders nowhere publicly. That took the
// hidden block's canvas card — and its toggle — away with it, so TL.SECT.2 gave
// every block a row in a Sections rail, and TL.SECT.2c moved that rail inline at
// the top of the Add Content panel. This spec pins the whole surface: where the
// rail sits, what a row says, what a toggle does to the canvas, and the three
// pieces of state that are easy to break by accident (the fold, the
// editing-block exemption, and the text-panel's routing through the one
// enable path).
//
// FIXTURE MODEL — a small stateful fake, zero real writes. The blocks route
// answers GETs from an in-memory row list and APPLIES the toggle's PATCH to it,
// so a re-read (TextBlocksPanel does one after every toggle) sees what the app
// just wrote instead of snapping back to a frozen seed. Nothing reaches the
// database, so the spec needs no allowWrites() opt-in at all. The pages route
// is patched rather than mocked, because `theme_json.pages.enabled` decides the
// events row's both-pages note and stored account state is never a safe
// baseline (battery-account rule).
//
// Desktop viewport in every test (the spec 14 convention): the device frame is
// width-gated (lg:block), not project-gated, so forcing 1440 lets this run under
// BOTH projects, and scoping canvas queries to getByTestId('device-frame') keeps
// the CSS-hidden mobile render out of reach.

import { test, expect, type Page } from './fixtures';

const DESKTOP = { width: 1440, height: 1000 };

// Fixture block ids (fixture-injection precedent: tests/14-visitor-preview.spec.ts).
const LINKS_ID = 's52-links';
const GALLERY_ID = 's52-gallery';
const TEXT_ID = 's52-text';
const EVENTS_ID = 's52-events';
const BIO_ID = 's52-bio';
const SOCIAL_ID = 's52-social';

const TEXT_HEADING = 'S52 text heading';

interface Row {
  id: string;
  mode_id: string;
  type: string;
  title: string | null;
  is_enabled: boolean;
  order_index: number;
}

/**
 * Seed the editor's block reads. `page2` forces theme_json.pages.enabled so the
 * events row's both-pages note is asserted against a known page count rather
 * than whatever the shared account happens to carry.
 */
const seed = async (page: Page, opts: { page2: boolean }) => {
  let modeId = '';
  const rows: Row[] = [
    { id: SOCIAL_ID, mode_id: '', type: 'social_links', title: 'Social Links', is_enabled: true, order_index: 0 },
    { id: LINKS_ID, mode_id: '', type: 'links', title: 'Links', is_enabled: true, order_index: 1 },
    { id: GALLERY_ID, mode_id: '', type: 'gallery', title: 'Gallery', is_enabled: false, order_index: 2 },
    { id: TEXT_ID, mode_id: '', type: 'text', title: JSON.stringify({ heading: TEXT_HEADING, body: '' }), is_enabled: false, order_index: 3 },
    { id: EVENTS_ID, mode_id: '', type: 'events', title: null, is_enabled: true, order_index: 4 },
    { id: BIO_ID, mode_id: '', type: 'bio', title: 'Bio', is_enabled: true, order_index: 5 },
  ];

  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const res = await route.fetch();
    const body = await res.json();
    const patch = (p: Record<string, unknown> | null) => {
      if (!p || typeof p !== 'object') return p;
      const theme = { ...((p.theme_json as Record<string, unknown>) ?? {}) };
      theme.pages = { ...((theme.pages as Record<string, unknown>) ?? {}), enabled: opts.page2 };
      return { ...p, theme_json: theme };
    };
    const out = Array.isArray(body) ? body.map(patch) : patch(body);
    await route.fulfill({ response: res, body: JSON.stringify(out) });
  });

  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [];
    modeId = (arr.find((m) => m?.type === 'page1') ?? arr[0])?.id ?? '';
    for (const r of rows) r.mode_id = modeId;
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    if (req.method() === 'PATCH') {
      // The one write this spec cares about: apply it to the fake rows so a
      // later read agrees with the optimistic UI, then answer like PostgREST.
      const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
      const patch = (req.postDataJSON() ?? {}) as Partial<Row>;
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (req.method() !== 'GET') {
      // ensure-default-blocks inserts — swallow, never touch the real table.
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    const typeParam = url.searchParams.get('type') ?? '';
    // TL.EVNT.SGL page-singleton graft probe (`type=in.(events)`) — the fixture
    // page already hosts its events block, so there is nothing to graft.
    if (typeParam.startsWith('in.')) return route.fulfill({ json: [] });
    // TextBlocksPanel reads only its own type.
    if (typeParam.startsWith('eq.')) {
      const t = typeParam.slice(3);
      return route.fulfill({ json: rows.filter((r) => r.type === t) });
    }
    return route.fulfill({ json: [...rows].sort((a, b) => a.order_index - b.order_index) });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ json: [] });
  });
};

const gotoEditor = async (page: Page, opts: { page2?: boolean; lang?: 'en' | 'es' } = {}) => {
  await page.setViewportSize(DESKTOP);
  if (opts.lang === 'es') {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
  }
  await seed(page, { page2: opts.page2 ?? false });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
};

/** Open the Add Content panel (where the rail now lives) and wait for it. */
const openPanel = async (page: Page) => {
  await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).first().click();
  await expect(page.getByTestId('sections-group-toggle')).toBeVisible();
};

/** The panel header's own buttons: [0] back (when a sub-view is open), [-1] X. */
const panelHeaderButtons = (page: Page) =>
  page.locator('.fixed.top-16 .border-b').first().locator('button');

/** Canvas block labels, top to bottom. innerText applies the CSS uppercase. */
const canvasOrder = (page: Page) =>
  page.getByTestId('device-frame').locator('span.uppercase').allInnerTexts();

const railRow = (page: Page, name: string) =>
  page.getByTestId('section-row').filter({ hasText: name });

test.describe('Sections rail (TL.SECT.1+2)', () => {
  test('the rail leads the Add Content panel, above My Links, header socials absent', async ({ page }) => {
    await gotoEditor(page);
    await openPanel(page);

    const rail = page.getByTestId('sections-rail');
    await expect(rail).toBeVisible();

    // Every block EXCEPT the header socials, which are managed in their own
    // editor and render inside the header rather than as a section.
    await expect(page.getByTestId('section-row')).toHaveCount(5);
    await expect(page.locator('[data-section-type="social_links"]')).toHaveCount(0);
    await expect(page.locator('[data-section-type="social_icon_row"]')).toHaveCount(0);

    // The group heading and its rows both precede the first catalog group.
    const order = await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="sections-group-toggle"]') as HTMLElement;
      const rail = document.querySelector('[data-testid="sections-rail"]') as HTMLElement;
      const headings = Array.from(document.querySelectorAll('p.text-lg.font-bold')) as HTMLElement[];
      const myLinks = headings.find((h) => /My Links|Mis enlaces/i.test(h.textContent || ''));
      return {
        toggleTop: toggle.getBoundingClientRect().top,
        railTop: rail.getBoundingClientRect().top,
        myLinksTop: myLinks ? myLinks.getBoundingClientRect().top : -1,
      };
    });
    expect(order.myLinksTop).toBeGreaterThan(0);
    expect(order.toggleTop).toBeLessThan(order.myLinksTop);
    expect(order.railTop).toBeLessThan(order.myLinksTop);

    // Row anatomy: name, status line, and a switch reflecting the block.
    const galleryRow = railRow(page, 'Gallery');
    await expect(galleryRow).toContainText('Gallery');
    await expect(galleryRow).toContainText('Hidden');
    await expect(galleryRow.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');

    const bioRow = railRow(page, 'Bio');
    await expect(bioRow).toContainText('Shown on your page');
    await expect(bioRow.getByRole('switch')).toHaveAttribute('data-state', 'checked');

    // A text block is named by its own heading — the one many-per-mode type,
    // where the type name could not tell two rows apart.
    await expect(railRow(page, TEXT_HEADING)).toBeVisible();
  });

  test('toggling ON from the rail lands the block FIRST in the canvas, with the toast', async ({ page }) => {
    await gotoEditor(page);
    const frame = page.getByTestId('device-frame');
    await expect(frame.getByText('Gallery', { exact: true })).toHaveCount(0);

    await openPanel(page);
    await railRow(page, 'Gallery').getByRole('switch').click();

    await expect(page.getByText(/Block added to the top of your page/i)).toBeVisible();
    // Sonner's own node, so the "no toast" assertion in the disable test below
    // is asserting the absence of something this selector can actually find.
    await expect(page.locator('[data-sonner-toast]')).not.toHaveCount(0);
    await expect(frame.getByText('Gallery', { exact: true })).toBeVisible();
    expect((await canvasOrder(page))[0]).toMatch(/GALLERY/i);

    // The rail mirrors the canvas, so its row moved too — and now reads as shown.
    const first = page.getByTestId('section-row').first();
    await expect(first).toContainText('Gallery');
    await expect(first).toContainText('Shown on your page');
  });

  test('the enable toast and the row status are Spanish in a Spanish session', async ({ page }) => {
    await gotoEditor(page, { lang: 'es' });
    await openPanel(page);

    await expect(railRow(page, 'Galería')).toContainText('Oculta');
    await railRow(page, 'Galería').getByRole('switch').click();

    await expect(page.getByText(/Bloque añadido al principio de tu página/i)).toBeVisible();
    expect((await canvasOrder(page))[0]).toMatch(/GALER[IÍ]A/i);
    await expect(page.getByTestId('section-row').first()).toContainText('Visible en tu página');
  });

  test('toggling OFF removes the block from the canvas, flips the row to Hidden, and says nothing', async ({ page }) => {
    await gotoEditor(page);
    const frame = page.getByTestId('device-frame');
    await expect(frame.getByText('Featured Links', { exact: true })).toBeVisible();

    await openPanel(page);
    await railRow(page, 'Featured Links').getByRole('switch').click();

    await expect(frame.getByText('Featured Links', { exact: true })).toHaveCount(0);
    const row = railRow(page, 'Featured Links');
    await expect(row).toContainText('Hidden');
    await expect(row.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
    // Hiding is silent — only the enable direction explains itself. The
    // assertions above already gave a toast time to mount if one were coming.
    await expect(page.getByText(/Block added to the top of your page/i)).toHaveCount(0);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  });

  test('the fold survives an editor round-trip and a panel reopen, and resets on reload', async ({ page }) => {
    await gotoEditor(page);
    await openPanel(page);

    const toggle = page.getByTestId('sections-group-toggle');
    const rail = page.getByTestId('sections-rail');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Into a block's editor and back out: the group is where it was left.
    await railRow(page, 'Bio').getByRole('button').first().click();
    await expect(rail).toHaveCount(0);
    await panelHeaderButtons(page).first().click();
    await expect(rail).toBeVisible();

    // Folded, the catalog leads; the fold outlives closing the panel.
    await toggle.click();
    await expect(rail).toHaveCount(0);
    await panelHeaderButtons(page).last().click();
    await expect(toggle).toHaveCount(0);
    await openPanel(page);
    await expect(page.getByTestId('sections-rail')).toHaveCount(0);
    await expect(page.getByTestId('sections-group-toggle')).toHaveAttribute('aria-expanded', 'false');

    // Session-only: a reload starts expanded again.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openPanel(page);
    await expect(page.getByTestId('sections-rail')).toBeVisible();
    await expect(page.getByTestId('sections-group-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('a block being edited keeps its preview while the editor is open, and vanishes on close', async ({ page }) => {
    await gotoEditor(page);
    const frame = page.getByTestId('device-frame');
    // The canvas door sets Editor's `editingBlock`, which is what the exemption
    // reads: open the bio editor from its card, then hide the block from that
    // same card. Mid-edit the preview must not yank the thing being edited.
    const bar = frame.locator('div.flex.items-center.gap-3').filter({ hasText: 'Bio' });
    await bar.locator('button').last().click();
    await expect(page.getByTestId('sections-group-toggle')).toHaveCount(0); // an editor, not the list

    const pill = bar.locator('button[class*="w-[33px]"]');
    await expect(pill).toHaveClass(/bg-\[#C9A55C\]/);   // on
    await pill.click();
    await expect(pill).toHaveClass(/bg-white\/20/);      // off — and yet:
    await expect(frame.getByText('Bio', { exact: true })).toBeVisible();

    // Closing the panel clears the exemption — now it obeys its toggle.
    await panelHeaderButtons(page).last().click();
    await expect(frame.getByText('Bio', { exact: true })).toHaveCount(0);
  });

  test('the text-blocks panel enables through the same path: top of the page, same toast', async ({ page }) => {
    await gotoEditor(page);
    const frame = page.getByTestId('device-frame');
    await expect(frame.getByText('Text', { exact: true })).toHaveCount(0);

    await openPanel(page);
    // Catalog row → the standalone text-blocks list (TEXT.1), not the rail.
    await page.getByRole('button', { name: /Add a heading and a paragraph/i }).click();
    const panelRow = page.locator('.fixed.top-16').getByText(TEXT_HEADING);
    await expect(panelRow).toBeVisible();

    await page.locator('.fixed.top-16').getByRole('switch').first().click();

    await expect(page.getByText(/Block added to the top of your page/i)).toBeVisible();
    expect((await canvasOrder(page))[0]).toMatch(/TEXT/i);
  });

  test('the events row names the both-pages contract only when Page 2 exists', async ({ page }) => {
    await gotoEditor(page, { page2: false });
    await openPanel(page);
    await expect(railRow(page, 'Events')).toContainText('Shown on your page');
    await expect(railRow(page, 'Events')).not.toContainText('Both pages');
  });

  test('with Page 2 on, the events row says both pages', async ({ page }) => {
    await gotoEditor(page, { page2: true });
    await openPanel(page);
    await expect(railRow(page, 'Events')).toContainText('Both pages');
    // Still only the events row — the note is a singleton contract, not a style.
    await expect(page.getByTestId('section-row').filter({ hasText: 'Both pages' })).toHaveCount(1);
  });
});

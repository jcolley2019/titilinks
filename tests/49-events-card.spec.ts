// TL.EVNT Stage 1 — the design gate harness.
//
// This file exists to put a REAL events card in front of Joey before the editor
// is built: it renders through the shipping path (EditableProfileView →
// BlockRenderer → EventsBlock, real theme, real device frame) and captures the
// four surfaces the gate needs — public and editor, hero and full_bleed, at
// both viewports.
//
// Why fixtures instead of seeded rows: the harness runs against the real
// Supabase project and has no seeding hook (all SQL is run by hand in the web
// editor — see 05-page-styles for the same constraint). So blocks/block_items
// are answered with a fixture and the shared test account is never mutated;
// non-GET writes are swallowed for the same reason.
//
// Screenshots are ELEMENT-scoped, never fullPage: at mobile DPR 3 a fullPage
// shot of this account busts the 32767 device-pixel cap (TL.SPEC.01.FIX).
//
// Assertions here are deliberately thin — this is a gate harness, not the
// behavioral spec. The real spec 49 (sort order, past-event hiding, sold-out
// inertness) lands with the lifecycle work.

import { test, expect, type Page, type Route } from '@playwright/test';
import { TEST_HANDLE } from './helpers/auth';

const PROFILE = `/${TEST_HANDLE}`;
const BLOCK_ID = 'evnt-stage1-block';

// Retry the live passthrough — see TEST.FLAKE.26.
const routeFetchWithRetry = async (route: Route, attempts = 4) => {
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

/** TL.EVNT Stage 3a — a self-contained poster so the fixture never fetches:
 *  a tall 3:4 composition (the clamp case) as an SVG data URI. */
const POSTER_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">' +
      '<rect width="600" height="800" fill="#C9A55C"/>' +
      '<rect x="40" y="40" width="520" height="720" fill="none" stroke="#0e0c09" stroke-width="4"/>' +
      '<text x="300" y="420" font-size="48" text-anchor="middle" fill="#0e0c09">POSTER</text>' +
      '</svg>',
  );

/** Titi's book launch, plus the three states the card has to prove.
 *  Dates are wall-clock strings — exactly what the editor will write. */
const EVENTS = [
  {
    id: 'evnt-launch',
    block_id: BLOCK_ID,
    label: 'Corazón Abierto — Book Launch',
    subtitle: 'Books & Books · Coral Gables',
    url: 'https://example.com/book-launch-tickets',
    cta_label: 'Get tickets',
    starts_at: '2026-09-12T19:00:00+00:00',
    ends_at: null,
    // Pinned: sorts above everything, gold pin next to the title.
    // Stage 3a: this card also carries the poster — above the text row,
    // uncropped, tap → lightbox.
    style_json: { pinned: true },
    order_index: 0,
    badge: null, image_url: POSTER_DATA_URI, is_adult: false, size: null,
    bg_color: null, title_color: null, price: null, compare_at_price: null, currency: null,
  },
  {
    id: 'evnt-signing',
    block_id: BLOCK_ID,
    label: 'Signing & Meet-and-Greet',
    subtitle: 'Barnes & Noble · Lincoln Road',
    url: 'https://example.com/signing',
    cta_label: 'Get tickets',
    starts_at: '2026-10-03T14:00:00+00:00',
    ends_at: null,
    // Sold out: dimmed, relabelled, and rendered inert (span, not anchor).
    style_json: { sold_out: true },
    order_index: 1,
    badge: null, image_url: null, is_adult: false, size: null,
    bg_color: null, title_color: null, price: null, compare_at_price: null, currency: null,
  },
  {
    id: 'evnt-fair',
    block_id: BLOCK_ID,
    label: 'Miami Book Fair — Author Panel',
    subtitle: 'Miami Dade College · Wolfson Campus',
    url: 'https://example.com/book-fair',
    cta_label: null, // falls back to the localized default
    starts_at: '2026-11-22T00:00:00+00:00',
    ends_at: null,
    // All-day: the time line reads "All day" instead of a clock time.
    style_json: { all_day: true },
    order_index: 2,
    badge: null, image_url: null, is_adult: false, size: null,
    bg_color: null, title_color: null, price: null, compare_at_price: null, currency: null,
  },
  {
    id: 'evnt-nolink',
    block_id: BLOCK_ID,
    label: 'Cumpleaños de Titi — Private Celebration',
    subtitle: 'Secret Garden · Wynwood',
    // TL.EVNT.STAGE2b ruling: no ticket link → the card renders NO pill at all,
    // not an inert one.
    url: '',
    cta_label: null,
    starts_at: '2026-12-05T20:00:00+00:00',
    ends_at: null,
    style_json: null,
    order_index: 4,
    badge: null, image_url: null, is_adult: false, size: null,
    bg_color: null, title_color: null, price: null, compare_at_price: null, currency: null,
  },
  {
    id: 'evnt-past',
    block_id: BLOCK_ID,
    label: 'Summer Reading Night',
    subtitle: 'The Betsy Hotel · South Beach',
    url: 'https://example.com/summer-reading',
    cta_label: 'Get tickets',
    // Already over: hidden on the public page, greyed in the editor.
    starts_at: '2026-07-18T18:30:00+00:00',
    ends_at: '2026-07-18T21:00:00+00:00',
    style_json: null,
    order_index: 3,
    badge: null, image_url: null, is_adult: false, size: null,
    bg_color: null, title_color: null, price: null, compare_at_price: null, currency: null,
  },
];

/** Patch the page's style, then answer blocks/block_items with the fixture. */
const seedEvents = async (page: Page, pageStyle: 'hero' | 'full_bleed') => {
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const patch = (p: Record<string, unknown> | null) => {
      if (!p || typeof p !== 'object') return p;
      const theme = { ...((p.theme_json as Record<string, unknown>) || {}) };
      // Both the profile-level default AND the per-page values, so
      // resolveEffectivePageStyle lands on the same answer whichever it reads.
      theme.pageStyle = pageStyle;
      theme.pages = { page1: { style: pageStyle }, page2: { style: pageStyle } };
      return { ...p, theme_json: theme };
    };
    const next = Array.isArray(body) ? body.map(patch) : patch(body);
    await route.fulfill({ response: res, body: JSON.stringify(next) });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : [body];
    modeId = rows.find((m: { type?: string }) => m?.type === 'page1')?.id ?? rows[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      json: [
        { id: BLOCK_ID, mode_id: modeId, type: 'events', title: 'Events', is_enabled: true, order_index: 0 },
      ],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ json: EVENTS });
  });
};

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
};

/** The editor mounts BOTH the desktop and mobile EditableProfileViews and hides
 *  one with CSS rather than unmounting it, so a bare test-id matches two nodes.
 *  Always take the visible one. */
const visibleBlock = (page: Page) => page.locator('[data-testid="events-block"]:visible').first();

// ─── Public page ────────────────────────────────────────────────────────────

for (const style of ['hero', 'full_bleed'] as const) {
  test(`public events card — ${style}`, async ({ page }, testInfo) => {
    const proj = testInfo.project.name;
    await seedEvents(page, style);
    await page.goto(PROFILE);
    await settle(page);

    const block = visibleBlock(page);
    await expect(block).toBeVisible();

    // The public contract, asserted while we are here: the ended event is gone,
    // the pinned launch leads, and the sold-out card is not a link.
    await expect(block.getByText('Summer Reading Night')).toHaveCount(0);
    await expect(block.locator('> div').first()).toContainText('Corazón Abierto');
    await expect(block.locator('a', { hasText: 'Sold out' })).toHaveCount(0);

    // TL.EVNT.STAGE2b: an event without a ticket link shows its card but NO
    // pill — not the default label, not an inert chip.
    const noLink = block.locator('> div', { hasText: 'Cumpleaños de Titi' });
    await expect(noLink).toBeVisible();
    await expect(noLink.getByText('Get tickets')).toHaveCount(0);

    // TL.EVNT Stage 3a: the poster renders ABOVE the text row on its card, and
    // ONLY there — the other fixtures have no image_url and get no <img>.
    const launch = block.locator('> div', { hasText: 'Corazón Abierto' });
    const posterBtn = launch.getByRole('button', { name: 'View poster' });
    await expect(posterBtn.locator('img')).toBeVisible();
    await expect(noLink.locator('img')).toHaveCount(0);

    // 3a.2 — THE no-crop guard: the fixture poster is 600×800 (aspect 0.75),
    // and the ruling says the FULL composition displays, aspect-preserved,
    // letterboxed if needed. The rendered box must therefore keep the source
    // aspect; any object-cover / fixed-both-dimensions regression breaks this.
    const posterBox = await posterBtn.locator('img').boundingBox();
    expect(posterBox).not.toBeNull();
    expect(Math.abs(posterBox!.width / posterBox!.height - 600 / 800)).toBeLessThan(0.02);

    // Tap → lightbox (full composition), tap again → closed. Plain open/close:
    // a single poster has no strip and no chevrons.
    await posterBtn.click();
    const lightbox = page.getByTestId('event-poster-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator('img')).toBeVisible();
    await lightbox.screenshot({ path: `tests/screenshots/evnt3a-lightbox-${style}-${proj}.png` });
    await lightbox.click();
    await expect(lightbox).toHaveCount(0);

    await block.screenshot({ path: `tests/screenshots/evnt1-public-${style}-${proj}-card.png` });
    await page.screenshot({ path: `tests/screenshots/evnt1-public-${style}-${proj}-page.png` });
  });
}

// ─── Editor — the device preview, both viewports ────────────────────────────

for (const style of ['hero', 'full_bleed'] as const) {
  test(`editor device preview — ${style}`, async ({ page }, testInfo) => {
    const proj = testInfo.project.name;
    await seedEvents(page, style);
    await page.goto('/dashboard/editor');
    await settle(page);

    const block = visibleBlock(page);
    await block.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    await expect(block.getByText('Corazón Abierto — Book Launch')).toBeVisible();

    // RESOLVED the Stage 2 way (was the ⚠️ STAGE 1 GAP): the editor's
    // block-card preview still calls BlockRenderer WITHOUT `editMode` — now
    // DELIBERATELY, because forwarding it would change adult-gate href behavior
    // for every other card block. The creator sees ended events greyed in the
    // EventsEditor PANEL instead, which owns the full list (and is where delete
    // and the Stage 3 archive live). This preview therefore intentionally
    // matches the public page, ended events filtered out — asserted so a future
    // editMode forward doesn't land unnoticed.
    await expect(block.getByText('Summer Reading Night')).toHaveCount(0);

    // TL.EVNT.STAGE3a.2 — the ticket pill really OPENS from the edit canvas
    // (the header-icon precedent; the blanket () => false suppressor left it a
    // dead-looking anchor). target=_blank means a popup page appears and the
    // editor itself never navigates away.
    const pill = block.locator('a', { hasText: 'Get tickets' }).first();
    await expect(pill).toBeVisible();
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 10_000 }),
      pill.click(),
    ]);
    await popup.close();
    await expect(block).toBeVisible(); // the editor stayed put

    await block.screenshot({ path: `tests/screenshots/evnt1-editor-${style}-${proj}-card.png` });

    // The device frame is the DESKTOP branch only — on a phone viewport the
    // editor renders the page surface directly, with no frame to shoot.
    if (proj === 'desktop') {
      const frame = page.getByTestId('device-frame');
      await expect(frame).toBeVisible();
      await frame.screenshot({ path: `tests/screenshots/evnt1-editor-${style}-${proj}-frame.png` });
    } else {
      await page.screenshot({ path: `tests/screenshots/evnt1-editor-${style}-${proj}-panel.png` });
    }
  });
}

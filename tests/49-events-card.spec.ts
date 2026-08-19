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

const PROFILE = '/joeyc';
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
    style_json: { pinned: true },
    order_index: 0,
    badge: null, image_url: null, is_adult: false, size: null,
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

    // ⚠️ STAGE 1 GAP, asserted so it cannot be forgotten. The past-event ruling
    // says the creator keeps seeing ended events, greyed. They do NOT here: the
    // editor's block-card preview calls BlockRenderer WITHOUT `editMode`
    // (EditableProfileView.tsx:1326 — only the `links` branch forwards it), so
    // EventsBlock's editMode branch never lights up on this surface and the
    // ended event is filtered out exactly like on the public page.
    // EventsBlock is already correct; the missing piece is upstream. Resolving
    // it is a Stage 2 call: either forward editMode here (one line in a
    // protected file, and it changes adult-gate href behavior for every other
    // card block too), or let the events EDITOR PANEL own the full list — which
    // is where deleting and archiving will live anyway.
    await expect(block.getByText('Summer Reading Night')).toHaveCount(0);

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

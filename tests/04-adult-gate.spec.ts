// TEST.1c — regression net for the 18+ gate system (ADULT.2a + ADULT.2b).
//
// What this file can and cannot reach, and why it is split the way it is:
//
// The harness runs against the real Supabase project and has no seeding hook
// (all SQL is run by hand in the web editor), so a spec cannot conjure a
// profile with a known OnlyFans link on it. The net is therefore built from
// three angles that are each deterministic on their own:
//
//   1. PREDICATE specs import the real module and pin the gating rule itself —
//      the rule every surface consults. This is where the domain-derived
//      gating ruling is enforced, because it needs no page at all.
//   2. /go ROUTE specs drive the real route in a real browser. The hop's
//      sessionStorage handoff is what makes this possible without the
//      database: the spec plants a destination the way a gate click would.
//   3. PUBLIC DOM specs run against the live test profile and assert the one
//      invariant that holds no matter what data is on it — no adult URL ever
//      appears in a public DOM attribute.
//
// The gap this leaves is honest and worth stating: no spec here drives a real
// gated CARD end to end, because that needs a seeded gated item. The card's
// reveal/re-gate behaviour is covered at the predicate level only, and the
// end-to-end walk stays a manual check.

import { test, expect } from '@playwright/test';
import { isEffectivelyGated, gatedHref, isAdultUrl, hopPath, configHopId } from '../src/lib/adult-gate';

const ADULT_HOSTS = ['onlyfans.com', 'fansly.com', 'privacy.com.br', 'fatalfans.com'];
const PROFILE = '/joeyc';

const HOP_ID = 'test-hop-item-id';
const DEST = 'https://example.com/destination-page';
const handoffKey = (id: string) => `titilinks:hop:${id}`;

// ─── 1. The predicate ───────────────────────────────────────────────────────

test.describe('18+ gate — the rule every surface consults', () => {
  // The Joey ruling: stored state is not trusted; the destination decides.
  test('domain-derived gating: is_adult=false + an adult domain still gates', () => {
    const item = { url: 'https://onlyfans.com/someone', is_adult: false };
    expect(isEffectivelyGated(item)).toBe(true);
    // Public render: the URL is absent from the DOM entirely.
    expect(gatedHref(item.url, item.is_adult)).toBeUndefined();
    // The editor still needs its real links.
    expect(gatedHref(item.url, item.is_adult, true)).toBe(item.url);
  });

  test('every ADULT (18+) catalog platform domain-matches', () => {
    expect(isAdultUrl('https://onlyfans.com/x')).toBe(true);
    expect(isAdultUrl('https://fansly.com/x')).toBe(true);
    expect(isAdultUrl('https://privacy.com.br/x')).toBe(true);
    expect(isAdultUrl('https://fatalfans.com/x')).toBe(true);
    expect(isAdultUrl('https://www.onlyfans.com/x')).toBe(true);
  });

  test('the flag can add gating but never remove it', () => {
    // Flag alone gates a non-adult domain...
    expect(isEffectivelyGated({ url: 'https://example.com/x', is_adult: true })).toBe(true);
    // ...and clearing the flag cannot un-gate an adult domain.
    expect(isEffectivelyGated({ url: 'https://onlyfans.com/x', is_adult: false })).toBe(true);
  });

  test('CONTROL: a normal link is untouched by the gate', () => {
    const item = { url: 'https://open.spotify.com/artist/x', is_adult: false };
    expect(isEffectivelyGated(item)).toBe(false);
    expect(gatedHref(item.url, item.is_adult)).toBe(item.url);
    // The gate is a gate, not a blanket: near-misses must not match.
    expect(isAdultUrl('https://notonlyfans.com/x')).toBe(false);
    expect(isAdultUrl('https://example.com/onlyfans')).toBe(false);
  });

  test('the hop link carries an id and never the destination', () => {
    expect(hopPath('abc-123')).toBe('/go/abc-123');
    expect(hopPath('abc-123')).not.toContain('onlyfans');
    expect(hopPath(configHopId('blk-9'))).toBe('/go/cfg-blk-9');
  });
});

// ─── 2. The /go hop ─────────────────────────────────────────────────────────

test.describe('/go interstitial', () => {
  // Hanging the item lookup pins the hop in its pre-resolve state, so the
  // neutral frame can be asserted without racing the forward.
  const hangResolution = async (page: import('@playwright/test').Page) => {
    await page.route('**/rest/v1/block_items*', () => {
      /* never fulfilled — the hop stays on its neutral frame */
    });
  };

  test('renders neutral copy; destination absent from URL and pre-resolve DOM', async ({ page }) => {
    await hangResolution(page);
    await page.goto(`/go/${HOP_ID}`);

    await expect(page.getByText('Opening your link…')).toBeVisible();

    // The proof: nothing about a destination is in the URL or the DOM.
    expect(page.url()).not.toContain('example.com');
    expect(page.url()).toContain(`/go/${HOP_ID}`);
    const html = await page.content();
    for (const host of [...ADULT_HOSTS, 'example.com']) {
      expect(html).not.toContain(host);
    }
  });

  test('resolves the id and forwards to the destination', async ({ page }) => {
    // Plant the handoff exactly as a gate click would.
    await page.addInitScript(
      ([key, dest]) => sessionStorage.setItem(key, dest),
      [handoffKey(HOP_ID), DEST]
    );
    await page.route('https://example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>ARRIVED</h1>' })
    );

    await page.goto(`/go/${HOP_ID}`);
    await page.waitForURL(DEST, { timeout: 10000 });
    await expect(page.locator('h1')).toHaveText('ARRIVED');
  });

  test('ES: hop copy is localized', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await hangResolution(page);
    await page.goto(`/go/${HOP_ID}`);
    await expect(page.getByText('Preparando tu enlace…')).toBeVisible();
  });

  test('an unresolvable id fails neutrally rather than leaking', async ({ page }) => {
    await page.route('**/rest/v1/block_items*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    );
    await page.goto('/go/does-not-exist');
    await expect(page.getByText("We couldn't open that link.")).toBeVisible({ timeout: 10000 });
  });
});

// ─── 3. The live public DOM ─────────────────────────────────────────────────

// The test profile carries no social block of its own, so these specs inject
// one: the real page and modes rows load from the database, and only the
// blocks/block_items reads are answered with a fixture. That keeps the whole
// render path — PublicProfile -> EditableProfileView -> the header icon row —
// exactly as it ships, while pinning the two cases that matter.
const SPOTIFY_URL = 'https://open.spotify.com/artist/test-control';
const ONLYFANS_URL = 'https://onlyfans.com/test-creator';
const BLOCK_ID = 'test-social-block';
const CARD_BLOCK_ID = 'test-links-block';
const GATED_ITEM_ID = 'test-item-onlyfans';
const GATED_CARD_ID = 'test-card-gated';

// Strings the retired at-rest card disclaimer used to render. ADULT.2c ruled
// that a gated card shows NOTHING until tapped, so these must never appear on
// a page at rest — this is the ruling expressed as an assertion.
const RETIRED_DISCLAIMER_TEXT = ['Mature Content Disclaimer', '18+ only', 'Aviso de contenido para adultos'];

const seedSocialIcons = async (page: import('@playwright/test').Page) => {
  let modeId = '';

  // Pass the real modes through, but capture an id to hang the fixture off.
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    modeId = Array.isArray(body) ? body[0]?.id ?? '' : '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    await route.fulfill({
      json: [
        { id: BLOCK_ID, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 },
        { id: CARD_BLOCK_ID, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 1 },
      ],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    await route.fulfill({
      json: [
        // --- header icons ---
        // CONTROL: an ordinary platform, untouched by the gate.
        { id: 'test-item-spotify', block_id: BLOCK_ID, label: 'Spotify', url: SPOTIFY_URL, is_adult: false, order_index: 0, subtitle: null, badge: null, image_url: null },
        // THE RULING: flagged false, but the domain is adult. Must still gate.
        { id: GATED_ITEM_ID, block_id: BLOCK_ID, label: 'OnlyFans', url: ONLYFANS_URL, is_adult: false, order_index: 1, subtitle: null, badge: null, image_url: null },
        // --- link cards ---
        { id: 'test-card-normal', block_id: CARD_BLOCK_ID, label: 'Normal Card', url: SPOTIFY_URL, is_adult: false, order_index: 0, subtitle: null, badge: null, image_url: null, size: 'medium', style_json: null },
        { id: GATED_CARD_ID, block_id: CARD_BLOCK_ID, label: 'Gated Card', url: ONLYFANS_URL, is_adult: false, order_index: 1, subtitle: null, badge: null, image_url: null, size: 'medium', style_json: null },
      ],
    });
  });
};

const gotoSeededProfile = async (page: import('@playwright/test').Page) => {
  await seedSocialIcons(page);
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
};

test.describe('public profile — the icon row', () => {
  test('ungated icon is a real link (the icons-alive regression)', async ({ page }) => {
    await gotoSeededProfile(page);

    // Before this work these were bare <span>s: no href, no onClick, purely
    // decorative. A real anchor here is the regression this guards.
    const spotify = page.locator('a[title="Spotify"]');
    await expect(spotify).toHaveAttribute('href', SPOTIFY_URL);
    await expect(spotify).toHaveAttribute('target', '_blank');
    await expect(spotify).toHaveAttribute('rel', /noopener/);
  });

  test('domain-derived gating: is_adult=false + adult domain still gates in the live DOM', async ({ page }) => {
    await gotoSeededProfile(page);

    const onlyfans = page.locator('a[title="OnlyFans"]');
    await expect(onlyfans).toBeVisible();
    // Stored state says "not adult". The render-time check overrules it.
    await expect(onlyfans).not.toHaveAttribute('href', /.*/);
    await expect(onlyfans).toHaveAttribute('role', 'button');
  });

  test('zero adult-URL attributes in the public DOM, gated icon present', async ({ page }) => {
    await gotoSeededProfile(page);
    await expect(page.locator('a[title="OnlyFans"]')).toBeVisible();

    // The compliance assertion: the item IS on the page, and a crawler
    // reading this DOM still finds no adult domain anywhere in it.
    const html = await page.content();
    for (const host of ADULT_HOSTS) {
      expect(html, `adult host ${host} must never reach the public DOM`).not.toContain(host);
    }
  });

  test('tapping a gated icon opens the modal and does not navigate', async ({ page }) => {
    await gotoSeededProfile(page);
    const before = page.url();

    await page.locator('a[title="OnlyFans"]').click();

    await expect(page.getByText('18+ Content Warning')).toBeVisible();
    expect(page.url()).toBe(before);
    // Still no destination, even with the gate open.
    expect(await page.content()).not.toContain('onlyfans.com');
  });

  test('Continue forwards to the /go hop by id', async ({ page }) => {
    await gotoSeededProfile(page);
    await page.locator('a[title="OnlyFans"]').click();
    await expect(page.getByText('18+ Content Warning')).toBeVisible();

    await page.getByRole('button', { name: 'Continue (18+)' }).click();

    await page.waitForURL(`**/go/${GATED_ITEM_ID}`, { timeout: 10000 });
    expect(page.url()).not.toContain('onlyfans.com');
  });

  test('ES: the gate modal is localized', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await gotoSeededProfile(page);

    await page.locator('a[title="OnlyFans"]').click();
    await expect(page.getByText('Aviso de contenido +18')).toBeVisible();
  });
});

// ─── 4. Link cards — the ADULT.2c ruling ────────────────────────────────────
//
// The ruling: a gated card is an ordinary card until it is tapped. No
// disclaimer, no age wall, nothing at rest. Tap raises the same modal the
// icons use; Continue forwards to /go/<id>.

test.describe('link cards — no warning until clicked', () => {
  test('a gated card renders as a NORMAL card at rest', async ({ page }) => {
    await gotoSeededProfile(page);

    // It is simply there, labelled, like any other card.
    await expect(page.getByText('Gated Card')).toBeVisible();

    // And nothing warns at rest — the retired disclaimer must be gone.
    const html = await page.content();
    for (const text of RETIRED_DISCLAIMER_TEXT) {
      expect(html, `no at-rest disclaimer: "${text}" must not render`).not.toContain(text);
    }
  });

  test('a gated card is href-clean while an ordinary card keeps its link', async ({ page }) => {
    await gotoSeededProfile(page);

    // Indistinguishable to the eye, opposite in the DOM: the gated card's
    // destination is absent, the normal card's is intact.
    const gatedCard = page.locator('a', { hasText: 'Gated Card' }).first();
    await expect(gatedCard).not.toHaveAttribute('href', /.*/);

    const normalCard = page.locator('a', { hasText: 'Normal Card' }).first();
    await expect(normalCard).toHaveAttribute('href', SPOTIFY_URL);

    expect(await page.content()).not.toContain('onlyfans.com');
  });

  test('tapping a gated card opens the same modal and does not navigate', async ({ page }) => {
    await gotoSeededProfile(page);
    const before = page.url();

    await page.locator('a', { hasText: 'Gated Card' }).first().click();

    await expect(page.getByText('18+ Content Warning')).toBeVisible();
    expect(page.url()).toBe(before);
    expect(await page.content()).not.toContain('onlyfans.com');
  });

  test('card Continue forwards to the /go hop by id', async ({ page }) => {
    await gotoSeededProfile(page);
    await page.locator('a', { hasText: 'Gated Card' }).first().click();
    await expect(page.getByText('18+ Content Warning')).toBeVisible();

    await page.getByRole('button', { name: 'Continue (18+)' }).click();

    await page.waitForURL(`**/go/${GATED_CARD_ID}`, { timeout: 10000 });
    expect(page.url()).not.toContain('onlyfans.com');
  });

  test('Go back dismisses and does nothing else — the card re-gates', async ({ page }) => {
    await gotoSeededProfile(page);
    const before = page.url();

    await page.locator('a', { hasText: 'Gated Card' }).first().click();
    await expect(page.getByText('18+ Content Warning')).toBeVisible();
    await page.getByRole('button', { name: 'Go back' }).click();

    await expect(page.getByText('18+ Content Warning')).not.toBeVisible();
    expect(page.url()).toBe(before);

    // No reveal state survives the dismiss: a re-tap gates again.
    await page.locator('a', { hasText: 'Gated Card' }).first().click();
    await expect(page.getByText('18+ Content Warning')).toBeVisible();
  });
});

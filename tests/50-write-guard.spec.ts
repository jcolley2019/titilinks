// TL.ISO.2 — the write guard's own regression test.
//
// The fixture in tests/fixtures.ts must ABORT every un-opted-in Supabase
// mutation from page context, let an allowWrites() opt-in through, and answer
// track_event from its global stub. If any of the three drifts, this spec is
// the alarm — not a mystery timeout in some unrelated suite.
//
// The probe URL is the real production REST endpoint on purpose: a canary
// aimed at a fake host could never tell "the guard aborted it" from "DNS
// failed". The probes carry NO apikey and NO auth header, so even a fully
// broken guard hands PostgREST/Kong an unauthenticated junk request that
// bounces at the door — the opt-in probe below relies on exactly that. The
// bodies avoid a JSON content-type so no CORS preflight muddies the waters.
import { test, expect, allowWrites, type Page } from './fixtures';

const REST_BLOCKS = 'https://ohmvlypcbrfkuudcuqub.supabase.co/rest/v1/blocks';
const RPC_TRACK_EVENT = 'https://ohmvlypcbrfkuudcuqub.supabase.co/rest/v1/rpc/track_event';

// Fire a POST from PAGE context and swallow the client-side rejection — the
// verdict is read from the Playwright network events, not the fetch result.
const firePost = (page: Page, url: string) =>
  page.evaluate(
    (u) => fetch(u, { method: 'POST', body: 'iso2-canary' }).catch(() => {}),
    url
  );

test.describe('TL.ISO.2 — default-deny write guard canary', () => {
  test('an un-opted-in POST to rest/v1/blocks is aborted', async ({ page }) => {
    await page.goto('/');
    const failed = page.waitForEvent('requestfailed', {
      predicate: (r) => r.url().startsWith(REST_BLOCKS) && r.method() === 'POST',
      timeout: 15_000,
    });
    await firePost(page, REST_BLOCKS);
    const req = await failed;
    // Aborted at the routing layer — the request never produced a response.
    expect(req.failure(), 'the guard aborted the request').not.toBeNull();
    expect(await req.response(), 'no response ever came back').toBeNull();
  });

  test('allowWrites() opts the same POST back in', async ({ page }) => {
    await page.goto('/');
    await allowWrites(page, ['rest/v1/blocks']);
    const answered = page.waitForResponse(
      (r) => r.url().startsWith(REST_BLOCKS) && r.request().method() === 'POST',
      { timeout: 15_000 }
    );
    await firePost(page, REST_BLOCKS);
    const res = await answered;
    // The request reached the real server — which bounces the unauthenticated
    // junk at the door. Any status proves the deny layer stepped aside; 4xx
    // proves no row was ever at risk.
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('track_event is answered by the global stub, not the network', async ({ page }) => {
    await page.goto('/');
    const answered = page.waitForResponse(
      (r) => r.url().startsWith(RPC_TRACK_EVENT) && r.request().method() === 'POST',
      { timeout: 15_000 }
    );
    await firePost(page, RPC_TRACK_EVENT);
    const res = await answered;
    // The fixture's stub fulfills 200 (empty body, a void-RPC success to
    // supabase-js); the real endpoint answers 204 on success and an auth
    // error for this unauthenticated junk — so status 200 alone is the
    // stub's fingerprint. The body itself is NOT read: Chromium refuses
    // getResponseBody for a fulfilled empty cross-origin response
    // ("No data found for resource with given identifier").
    expect(res.status()).toBe(200);
  });
});

/**
 * TL.ISO.2 — default-deny write guard for the battery.
 *
 * Every spec imports { test, expect } (and Playwright types) from THIS file,
 * never from '@playwright/test' — guard invariant PW-ONE-DOOR enforces it.
 * The extended `context` fixture installs a context-level route that ABORTS
 * every mutating request (POST/PATCH/PUT/DELETE) to *.supabase.co — REST,
 * storage, edge functions, auth signup — unless the spec opted in through
 * allowWrites(). After TL.ISO.2 a badly written spec cannot write ANYWHERE,
 * not even to the battery account, without declaring it. Two standing
 * exceptions, both scoped to the battery's OWN session and both incapable of
 * touching account data:
 *   - POST auth/v1/token   the setup login and session refreshes.
 *   - POST auth/v1/logout  TL.ISO.5. Spec 39 mocks the delete-account edge
 *     function, and the app then signs the (still-alive) session out for real.
 *     Revoking the battery's own session is harmless — auth.setup.ts mints a
 *     fresh one per run — and denying it logged a [write-guard] DENIED line on
 *     a passing test. Keeping real denials high-signal is worth more than
 *     denying a logout that costs nothing.
 *
 * ROUTE PRECEDENCE — how this layer composes with spec-level routes:
 *   - page.route handlers run BEFORE context.route handlers; within each
 *     level the LAST registered matching handler runs first.
 *   - route.fulfill() / route.abort() END the request. The deny layer never
 *     sees traffic a spec already mocks — spec 10's fulfill-all and spec 49's
 *     method-gated mocks compose unchanged.
 *   - route.fallback() hands the request to the NEXT matching handler: later
 *     page routes fall to earlier ones first (spec 22's non-GET fallback
 *     lands in its own earlier 204 no-op handler, never here), then to this
 *     context route, then the network. Unrouted or fallen-through mutations
 *     are exactly what this layer rules on.
 *   - route.continue() and route.fetch() SKIP every remaining handler and go
 *     straight to the network — they BYPASS this guard. The TL.ISO.0 recon
 *     ruled that hole not fully closable in-process; the PW-WRITE-BYPASS
 *     guard invariant flags the grep-able non-GET idiom, review owns the
 *     rest. Same for browser.newContext() made inside a spec (the gallery
 *     rescue contexts): a hand-rolled context carries no fixture routes.
 *
 * track_event RULING (TL.ISO.0): the analytics RPC is stubbed globally here
 * (200, empty body — supabase-js treats any 2xx + empty text as a void RPC
 * success), so specs stop minting real analytics rows entirely.
 */
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';

// The one door: specs pull the runner AND the types from here.
export { expect };
export type {
  Page,
  Route,
  Locator,
  Browser,
  BrowserContext,
  TestInfo,
} from '@playwright/test';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SUPABASE_HOST = /^https?:\/\/[^/]+\.supabase\.co\//;

/** Per-context opt-in allowlist of path prefixes (no leading slash). */
const contextAllow = new WeakMap<BrowserContext, Set<string>>();

/**
 * Opt this spec's context in to specific Supabase writes. Path-prefix entries
 * against the URL pathname, e.g. 'rest/v1/blocks', 'rest/v1/block_items',
 * 'storage/v1/object/products', 'rest/v1/rpc/claim_referral'. Everything not
 * listed stays denied. Call it before the write fires (top of the test or in
 * a beforeEach) — it applies to every page of the test's context.
 */
export async function allowWrites(page: Page, prefixes: string[]): Promise<void> {
  const ctx = page.context();
  const set = contextAllow.get(ctx) ?? new Set<string>();
  for (const p of prefixes) set.add(p.replace(/^\/+/, ''));
  contextAllow.set(ctx, set);
}

export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    const denied: string[] = [];

    // Default-deny. Registered FIRST so the more specific track_event stub
    // below (registered last, therefore consulted first) wins for that RPC.
    await context.route(SUPABASE_HOST, async (route) => {
      const req = route.request();
      const method = req.method();
      if (!MUTATING.has(method)) return route.fallback();

      const path = new URL(req.url()).pathname.replace(/^\/+/, '');

      // Standing exceptions: the setup login/refresh, and the app's own logout
      // (spec 39's mocked account delete signs the session out). Both act on
      // the battery's session only — see the header note.
      if (
        method === 'POST' &&
        (path.startsWith('auth/v1/token') || path.startsWith('auth/v1/logout'))
      ) {
        return route.fallback();
      }

      // PostgREST invokes EVERY rpc via POST — read-only readbacks included.
      // The app's read RPCs (the get_public_* readbacks and the slug
      // resolver) are SELECT-shaped; denying them blanks every public page.
      // They pass as a standing class. The write-capable RPCs —
      // subscribe_to_page, claim_referral, and anything new that doesn't
      // match the read-naming convention — stay denied unless opted in
      // (track_event never gets here: the stub below answers it first).
      // RESIDUAL (TL.ISO.5, on the record): this exception is a NAMING
      // convention, not a proof. A future write-capable RPC named
      // `get_public_*` would be waved through by this regex — if one is ever
      // added, it must be excluded here by name, not trusted to its prefix.
      if (
        method === 'POST' &&
        /^rest\/v1\/rpc\/(get_public_[a-z0-9_]+|resolve_short_link_by_slug)$/.test(path)
      ) {
        return route.fallback();
      }

      const allow = contextAllow.get(context);
      if (allow && [...allow].some((prefix) => path.startsWith(prefix))) {
        return route.fallback();
      }

      // LOUD by design: a denied write must read as "the guard caught
      // something", never as a mystery timeout. One line to the spec's
      // output; the full list is attached to the test report in teardown.
      const line = `[write-guard] DENIED ${method} ${req.url()}`;
      console.log(
        `${line}\n[write-guard] un-opted-in Supabase write aborted by tests/fixtures.ts — ` +
          `if this spec legitimately mutates '${path}', declare it: await allowWrites(page, ['${path}'])`
      );
      denied.push(line);
      return route.abort('accessdenied');
    });

    // track_event stub — the battery mints no real analytics rows.
    await context.route(/\/rest\/v1\/rpc\/track_event/, (route) =>
      route.fulfill({ status: 200, body: '' })
    );

    await use(context);

    if (denied.length) {
      await testInfo.attach('write-guard-denials', {
        body: denied.join('\n'),
        contentType: 'text/plain',
      });
    }
  },
});

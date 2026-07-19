import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * SNAP.1d — Profile Snapshots suite.
 *
 * Authenticated via the shared project-level storageState (see
 * playwright.config.ts / auth.setup.ts) — specs just navigate and drive the UI.
 *
 * Non-destructive by construction: the profile_snapshots table is fully mocked
 * with an in-memory store, and every DESTRUCTIVE write on the content tree
 * (blocks / block_items / modes / pages PATCH) is intercepted and no-op'd so a
 * template apply or a restore can be exercised end-to-end without ever mutating
 * the real page. Reads (GET) on pages/modes/blocks/block_items pass through to
 * real Supabase, exactly like the editor's normal load.
 */

type Plan = 'free' | 'pro' | 'business';

/** The synthetic page id carried by seeded/created snapshots. A restore reads
 *  its page by this id; the mock answers it so no real page row is touched. A
 *  valid-but-nonexistent UUID so the content-tree reads a restore fans out
 *  (modes/blocks by this id) return [] from real Supabase instead of a uuid
 *  cast error. */
const PAGE_ID = '00000000-0000-0000-0000-000000000000';

interface SnapRow {
  id: string;
  user_id: string;
  page_id: string;
  name: string;
  kind: 'manual' | 'auto';
  payload: unknown;
  created_at: string;
}

let seq = 0;
function makeRow(over: Partial<SnapRow> = {}): SnapRow {
  seq += 1;
  return {
    id: `snap-${seq}`,
    user_id: 'test-user',
    page_id: PAGE_ID,
    name: `Snapshot ${seq}`,
    kind: 'manual',
    payload: { v: 1, theme_json: {}, modes: [] },
    created_at: new Date(Date.now() - seq * 1000).toISOString(),
    ...over,
  };
}

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');

const asJson = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

/**
 * Install the snapshot + write-guard mocks. Returns accessors over the live
 * in-memory store.
 */
async function installSnapshotMocks(
  page: Page,
  opts: { plan?: Plan; seed?: SnapRow[] } = {},
) {
  const plan: Plan = opts.plan ?? 'free';
  const store: SnapRow[] = [...(opts.seed ?? [])];

  // profiles — answer only the plan query; let anything else hit real Supabase.
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan } : [{ plan }]);
  });

  // profile_snapshots — fully mocked, stateful.
  await page.route('**/rest/v1/profile_snapshots*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    // Quota count query: captureSnapshot uses head:true → HTTP HEAD; count is
    // read from the Content-Range header.
    if (method === 'HEAD') {
      const manual = store.filter((r) => r.kind === 'manual').length;
      return route.fulfill({ status: 200, headers: { 'content-range': `*/${manual}` }, body: '' });
    }

    if (method === 'POST') {
      const raw = route.request().postDataJSON();
      const input = Array.isArray(raw) ? raw[0] : raw;
      const row = makeRow({
        user_id: input.user_id,
        page_id: input.page_id,
        name: input.name,
        kind: input.kind ?? 'manual',
        payload: input.payload,
        created_at: new Date().toISOString(),
      });
      store.unshift(row); // newest first
      return asJson(route, wantsObject(route) ? row : [row], 201);
    }

    if (method === 'DELETE') {
      for (let i = store.length - 1; i >= 0; i--) {
        if (url.includes(store[i].id)) store.splice(i, 1);
      }
      return route.fulfill({ status: 204, body: '' });
    }

    // GET — single (restore load) or list.
    const rows = [...store].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (wantsObject(route)) {
      const m = url.match(/id=eq\.([^&]+)/);
      const found = m ? store.find((r) => r.id === decodeURIComponent(m[1])) : rows[0];
      return found ? asJson(route, found) : route.fulfill({ status: 406, body: '' });
    }
    return asJson(route, rows);
  });

  // pages: GET passes through, EXCEPT the synthetic read for the mock page id a
  // seeded snapshot carries (so a restore's page read resolves without touching
  // a real row). Any PATCH is no-op'd — theme writes never hit the real page.
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (route.request().url().includes(`id=eq.${PAGE_ID}`)) {
      const row = { user_id: 'test-user', theme_json: {} };
      return asJson(route, wantsObject(route) ? row : [row]);
    }
    return route.continue();
  });

  // Content-tree writes are no-op'd (reads pass through) so a template apply or
  // restore never mutates the real page.
  for (const tbl of ['modes', 'blocks', 'block_items']) {
    await page.route(`**/rest/v1/${tbl}*`, async (route) => {
      if (route.request().method() === 'GET') return route.continue();
      return route.fulfill({ status: 204, body: '' });
    });
  }

  return {
    store,
    manualCount: () => store.filter((r) => r.kind === 'manual').length,
  };
}

async function openEditProfile(page: Page) {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
}

async function openSnapshotsPanel(page: Page) {
  await page.getByRole('button', { name: /snapshots/i }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('snapshots-panel')).toBeVisible();
}

test.describe('Profile Snapshots (SNAP.1)', () => {
  test('panel opens with the quota line and an empty state', async ({ page }) => {
    await installSnapshotMocks(page, { plan: 'free', seed: [] });
    await openEditProfile(page);
    await openSnapshotsPanel(page);

    // Free plan → "0 of 1 used".
    await expect(page.getByTestId('snapshots-quota')).toHaveText(/0\s+of\s+1\s+used/i);
    await expect(page.getByTestId('snapshots-empty')).toBeVisible();
    // Under quota → the Save action is present (not the upsell).
    await expect(page.getByTestId('snapshot-save')).toBeVisible();
    await expect(page.getByTestId('snapshots-upsell')).toHaveCount(0);
  });

  test('creating a named snapshot adds it to the list', async ({ page }) => {
    await installSnapshotMocks(page, { plan: 'pro', seed: [] });
    await openEditProfile(page);
    await openSnapshotsPanel(page);

    const NAME = 'My Launch Look';
    await page.getByTestId('snapshot-name').fill(NAME);
    await page.getByTestId('snapshot-save').click();

    // Reloaded list shows the new manual snapshot.
    const row = page.getByTestId('snapshot-row').filter({ hasText: NAME });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-kind', 'manual');
  });

  test('restoring a snapshot writes its captured theme back to the page', async ({ page }) => {
    const SENTINEL = { background: { type: 'solid', solid_color: '#0d1b2a' }, __snapTest: 'SNAP1D' };
    const seed = makeRow({
      name: 'Original Look',
      kind: 'manual',
      payload: { v: 1, theme_json: SENTINEL, modes: [] },
    });
    await installSnapshotMocks(page, { plan: 'pro', seed: [seed] });
    await openEditProfile(page);
    await openSnapshotsPanel(page);

    // Kick off the restore and capture the page theme write it produces.
    const patchReq = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/pages') && r.method() === 'PATCH',
    );
    await page.getByTestId('snapshot-restore').first().click();
    await expect(page.getByTestId('snapshot-confirm')).toBeVisible();
    await page.getByTestId('snapshot-confirm-go').click();

    const body = (await patchReq).postDataJSON();
    // Round-trip proof: restore writes the snapshot's ORIGINAL theme_json back.
    expect(body.theme_json).toEqual(SENTINEL);
  });

  test('applying a template creates an auto snapshot that shows in the panel', async ({ page }) => {
    await installSnapshotMocks(page, { plan: 'pro', seed: [] });
    await openEditProfile(page);

    // Open the Template Gallery, hover the first card, apply it.
    await page.getByRole('button', { name: /template gallery/i }).filter({ visible: true }).first().click();
    // TPL.3: the gallery now defaults to the Layouts tab; the legacy template
    // grid lives under the Styles tab, so switch to it before locating a card.
    await page.getByTestId('gallery-tab-styles').click();
    // Scope to the gallery grid (grid-cols-2 sm:grid-cols-3) — NOT the preview's
    // product/link cards, which also carry a `.group` class.
    const card = page.locator('div.grid.grid-cols-2.sm\\:grid-cols-3 > div.group').first();
    await expect(card).toBeVisible();
    await card.hover();
    const autoPost = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/profile_snapshots') && r.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Apply' }).first().click();

    // SNAP.1c: the pre-apply safety net is an auto snapshot named for the template.
    const posted = (await autoPost).postDataJSON();
    const inserted = Array.isArray(posted) ? posted[0] : posted;
    expect(inserted.kind).toBe('auto');
    expect(inserted.name).toMatch(/^Before template:/);

    // It then shows in the Snapshots panel with the Auto badge. Reopen the
    // editor fresh (the auto snapshot persists in the mock store) and open the
    // Snapshots panel — avoids fiddling the gallery's back-chevron.
    await openEditProfile(page);
    await openSnapshotsPanel(page);
    const autoRow = page.getByTestId('snapshot-row').filter({ hasText: /Before template/ });
    await expect(autoRow).toBeVisible();
    await expect(autoRow).toHaveAttribute('data-kind', 'auto');
    await expect(autoRow.getByText('Auto', { exact: true })).toBeVisible();
  });

  test('at the free-plan quota the Save action becomes the PRO upsell', async ({ page }) => {
    const seed = makeRow({ name: 'My only snapshot', kind: 'manual' });
    await installSnapshotMocks(page, { plan: 'free', seed: [seed] });
    await openEditProfile(page);
    await openSnapshotsPanel(page);

    // Free = 1 snapshot; with 1 used the footer swaps to the upsell.
    await expect(page.getByTestId('snapshots-quota')).toHaveText(/1\s+of\s+1\s+used/i);
    await expect(page.getByTestId('snapshots-upsell')).toBeVisible();
    await expect(page.getByTestId('snapshot-save')).toHaveCount(0);
    await expect(page.getByTestId('snapshot-name')).toHaveCount(0);
  });
});

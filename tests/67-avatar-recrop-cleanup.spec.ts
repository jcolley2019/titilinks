// TL.STOR.8.1 — the page-1 hero photo save deletes the object it supersedes.
//
// AUDIT_rev6 §2.4 found 23 orphaned `avatars/<uid>/…` objects on one account.
// Every hero save mints a FRESH uuid (`upsert: true` never overwrites, because
// the name is never reused), writes pages.avatar_url / avatar_original_url, and
// used to walk away from the previous object — so each re-crop leaked two files
// forever. handlePhotoSave now calls removePublicObject('avatars', …) for the
// superseded pair, AFTER the row write succeeds and never before.
//
// THE TRAP THIS SPEC IS BUILT AROUND (TL.STOR.4, on the record): a storage
// delete with no DELETE policy behind it returns data:[] with error:null. Wired
// to the fire-and-forget `.catch(() => {})` idiom it typechecks, passes guard,
// and silently removes nothing. And the public URL keeps serving a really-deleted
// object from the CDN for up to an hour. So absence is proved by list() only —
// never by an error, never by an HTTP fetch of the public URL.
//
// The account ends the run holding the second photo this spec uploads as its
// page-1 hero. That is deliberate and safe: no spec pins the battery account's
// avatar_url or hero image content (24-desktop-stage and 62-onboarding both
// mock the pages route and stamp their own HERO_PHOTO; 22-page-setup-wizard
// explicitly documents that it does NOT pin avatar_url).
import { test, expect, allowWrites, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { PINNED_TEST_USER_ID } from './helpers/auth';

const T = translations.en;

/** Run a supabase query with the app's own client (RLS as the signed-in user).
 *  Re-imported per call: every navigation wipes anything cached on window. */
const sb = <T,>(page: Page, fn: string, arg?: unknown): Promise<T> => page.evaluate(
  async ({ body, a }) => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
  },
  { body: fn, a: arg ?? null },
);

/** Every object under the account's own avatars folder, by bare file name. */
const listNames = (page: Page): Promise<string[]> => sb<string[]>(
  page,
  `const { data, error } = await sb.storage.from('avatars').list(arg, { limit: 1000 });
   if (error) throw error;
   return data.map((o) => o.name);`,
  PINNED_TEST_USER_ID,
);

type HeroRow = { avatar_url: string | null; avatar_original_url: string | null };

/** The ONE pages row for this account — Editor.fetchPageData uses maybeSingle(),
 *  so more than one would already be a broken account, not an ambiguous read. */
const readRow = (page: Page): Promise<HeroRow> => sb<HeroRow>(
  page,
  `const { data, error } = await sb.from('pages')
     .select('avatar_url,avatar_original_url').eq('user_id', arg).maybeSingle();
   if (error) throw error;
   return data;`,
  PINNED_TEST_USER_ID,
);

/** The object name behind a public avatars URL, relative to the uid folder —
 *  the same key list() reports. Fails loudly on a URL from anywhere else. */
function nameOf(url: string | null, label: string): string {
  const marker = `/object/public/avatars/${PINNED_TEST_USER_ID}/`;
  const idx = (url || '').indexOf(marker);
  expect(idx, `${label} is not an object in the pinned account's avatars folder: ${url}`)
    .toBeGreaterThan(-1);
  return decodeURIComponent((url as string).slice(idx + marker.length).split('?')[0]);
}

/**
 * Pick a fresh photo and save it from the CHOOSE step — the plain "Save"
 * (no manual crop). A fresh pick sets photoOriginalFile, so this uploads TWO
 * objects: the display image and the full-size original kept for re-cropping.
 */
async function saveFreshPhoto(page: Page, fill: string): Promise<void> {
  // A real 600×600 PNG minted in-page, handed to the hidden combined
  // image+video hero picker (spec 13's fixture recipe, different fill so the
  // two saves cannot be confused for one another).
  const dataUrl = await page.evaluate((color) => {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 600;
    const x = c.getContext('2d')!;
    x.fillStyle = color;
    x.fillRect(0, 0, 600, 600);
    return c.toDataURL('image/png');
  }, fill);
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');

  // The editor mounts EditableProfileView twice (desktop preview + mobile
  // layout), so two identical inputs exist; photoStep is per-instance state and
  // the overlay is a body-portal, so triggering either opens exactly one.
  await page
    .locator('input[type="file"][accept*="image/jpeg"][accept*="video/mp4"]')
    .first()
    .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer });

  const overlay = page.locator('[class*="z-[130]"]');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: T['editor.hero.save'], exact: true }).click();
  await expect(page.getByText(T['editor.hero.photoUpdated'], { exact: true }))
    .toBeVisible({ timeout: 30_000 });
}

/** Poll the row until avatar_url has moved off `previous` — the save landed. */
async function rowAfterSave(page: Page, previous: string | null): Promise<HeroRow> {
  await expect.poll(
    async () => (await readRow(page)).avatar_url,
    {
      timeout: 30_000,
      message: 'pages.avatar_url should have moved to the newly saved hero (page-1 branch)',
    },
  ).not.toBe(previous);
  return readRow(page);
}

test.describe('page-1 hero save removes the superseded avatar objects (TL.STOR.8.1)', () => {
  test('two saves in a row leave two objects, not four', async ({ page }) => {
    // TL.ISO.2 write opt-in — this spec REALLY writes: the hero save POSTs two
    // objects to the avatars bucket, PATCHes the pages row, and then DELETEs the
    // two objects the save superseded. list() is a POST to
    // storage/v1/object/list/avatars, and the guard treats POST as mutating, so
    // the read has to be declared too.
    await allowWrites(page, [
      'rest/v1/pages',
      'storage/v1/object/avatars',
      'storage/v1/object/list/avatars',
    ]);

    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    const before = await listNames(page);
    const row0 = await readRow(page);

    // ── SAVE 1 ──────────────────────────────────────────────────────────────
    await saveFreshPhoto(page, '#8a8a8a');
    const row1 = await rowAfterSave(page, row0.avatar_url);
    const name1 = nameOf(row1.avatar_url, 'row1.avatar_url');
    const name1Orig = nameOf(row1.avatar_original_url, 'row1.avatar_original_url');

    // Both objects the first save uploaded really exist.
    await expect.poll(
      async () => {
        const names = await listNames(page);
        return names.includes(name1) && names.includes(name1Orig);
      },
      { timeout: 10_000, message: 'save 1 should have uploaded both hero objects' },
    ).toBe(true);
    const after1 = await listNames(page);

    // Reload before save 2. handlePhotoSave reads the SUPERSEDED urls off the
    // `page` prop, and the prop is refreshed by Editor.refreshPage() after the
    // save — but handlePhotoSave also calls setLocalHeroImages() with the new
    // url immediately, so the DOM shows the new hero whether the prop landed or
    // not and cannot witness the refresh. A fresh mount can: it reads the row
    // this spec just polled. Save 2 therefore supersedes row1 by construction.
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    // ── SAVE 2 ──────────────────────────────────────────────────────────────
    await saveFreshPhoto(page, '#1e5aa8');
    const row2 = await rowAfterSave(page, row1.avatar_url);
    const name2 = nameOf(row2.avatar_url, 'row2.avatar_url');
    const name2Orig = nameOf(row2.avatar_original_url, 'row2.avatar_original_url');

    // A fresh pick never reuses a name — both columns moved.
    expect(row2.avatar_url).not.toBe(row1.avatar_url);
    expect(row2.avatar_original_url).not.toBe(row1.avatar_original_url);

    // THE CLEANUP PROOF. removePublicObject is fire-and-forget and nothing
    // awaits it, so give it room — but prove it by ABSENCE FROM list(), which
    // goes through RLS and reports the bucket's real contents. Never by an HTTP
    // fetch: the CDN keeps serving a deleted object's public URL for ~an hour.
    await expect.poll(
      async () => (await listNames(page)).filter((n) => n === name1 || n === name1Orig),
      {
        timeout: 10_000,
        message:
          'the superseded page-1 hero objects must be GONE from list(). If they are ' +
          'still here, the DELETE silently no-opped — the STOR.4 trap: a storage ' +
          'delete with no policy behind it returns data:[] with error:null.',
      },
    ).toEqual([]);

    const after2 = await listNames(page);
    console.log(
      `[STOR.8.1] avatars/${PINNED_TEST_USER_ID} — before=${before.length} ` +
        `after1=${after1.length} after2=${after2.length}\n` +
        `[STOR.8.1] save 1 wrote: ${name1}, ${name1Orig}\n` +
        `[STOR.8.1] save 2 wrote: ${name2}, ${name2Orig}\n` +
        `[STOR.8.1] removed by save 2: ${name1}, ${name1Orig}`,
    );

    // The new pair is there…
    expect(after2, 'save 2 hero object missing from the bucket').toContain(name2);
    expect(after2, 'save 2 original object missing from the bucket').toContain(name2Orig);
    // …the old pair is not…
    expect(after2, 'the superseded hero object survived save 2').not.toContain(name1);
    expect(after2, 'the superseded original survived save 2').not.toContain(name1Orig);
    // …and the folder did not grow: two in, two out.
    expect(after2.length, 'two objects in, two objects out — the folder must not grow')
      .toBe(after1.length);

    await page.screenshot({ path: 'tests/screenshots/67-avatar-recrop-cleanup.png' });
  });
});

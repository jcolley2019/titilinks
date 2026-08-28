// TL.ISO.4 — the canonical ASSET seam for the Playwright battery account.
//
// SQL cannot upload files. The gallery fixtures the battery needs are real
// objects in the `products` storage bucket, and `block_items.image_url` in the
// reseed SQL is just a URL pointing at them. So the restore is TWO steps, and
// this script is step ①:
//
//   ① node scripts/seed-test-account-assets.mjs --upload   ← this file
//   ② paste the SQL from scripts/reset-test-account.mjs into the Supabase
//      web SQL editor and run it
//   ③ npm test
//
// The objects are uploaded ONCE and never change. They live at stable,
// hand-written paths (not the app's `{uid}/{uuid}.{ext}`), so the SQL in step ②
// can hardcode their URLs and stay a pure paste.
//
// RE-RUNNING --upload (TL.ISO.5). It used to call upload({ upsert: true }) and
// claim an idempotency it did not have: the second run died on
//   "new row violates row-level security policy"
// because the products bucket carries INSERT / SELECT / DELETE policies but no
// UPDATE policy, and upsert's overwrite path needs UPDATE. Two ways out, and
// this script takes the second:
//   (a) add a scoped UPDATE policy to the bucket - a change to PRODUCTION RLS,
//       widening what every real creator's session may do to their own objects,
//       bought solely to make a test script re-runnable;
//   (b) DELETE the object, then INSERT it - uses only policies that already
//       exist (STOR.4 shipped the owner-folder DELETE policy behind the
//       gallery's own delete button) and changes nothing outside this file.
// (b) it is: a test-harness convenience does not get to widen a production
// policy. --upload is therefore delete-then-upload, and genuinely re-runnable.
//
// One caveat that comes with (b): Supabase serves these public URLs through a
// CDN that keeps a deleted object's bytes cached for up to an hour. Identical
// bytes at an identical path make that invisible - which is the normal case,
// the PNGs being deterministic output of the manifest below. If the manifest
// ever CHANGES, expect the public URL to keep serving the old image for a while
// after a successful re-upload.
//
// WHAT IT CONNECTS TO. Unlike the SQL emitter (which connects to nothing), this
// script really does talk to the production Supabase project — that is the whole
// point of the seam, and it is why every mutating mode sits behind an explicit
// flag, is confined to ONE folder, and re-checks the TL.ISO.1 identity pin
// against the freshly-minted session before writing a single byte.
//
// Credentials come from the same two gitignored files the harness already uses
// (.env for the project URL + publishable key, .env.test for the battery account
// login), read with the dependency-free loader playwright.config.ts established.
// Nothing is hardcoded here but non-secret identifiers.
//
// MODES
//   --generate       (re)write tests/fixtures-assets/*.png from the manifest.
//                    Offline. The PNGs are tracked, so Joey never needs this.
//   --upload         sign in as the battery account and (re)place every fixture.
//   --list-orphans   read-only: list objects under the account's products folder
//                    that are NOT canonical fixtures (litter from a killed run).
//   --dry-run        with --upload / --list-orphans: print the plan, connect to
//                    nothing.
//   (no flag)        print the runbook and exit 0.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = path.join(ROOT, 'tests', 'fixtures-assets');

// ── Identity (non-secret; already committed in tests/helpers/auth.ts) ────────
export const BATTERY_USER_ID = 'd3f1cfce-d15a-4f4a-ba5c-908e3e959e58';
export const BATTERY_HANDLE = 'joey2019pwtestbattery';
/** Joey's PERSONAL account — TL.ISO.1. Never a write target. */
export const OLD_JOEYC_USER_ID = '3eb457d7-8a07-4b2b-88e6-22222debfdc1';
export const SUPABASE_PROJECT_REF = 'ohmvlypcbrfkuudcuqub';
export const SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

/** The bucket gallery photos live in — GalleryEditor.uploadImage, verbatim. */
export const GALLERY_BUCKET = 'products';
/** One folder, under the account's own uid so the bucket's RLS insert policy
 *  (`auth.uid()::text = (storage.foldername(name))[1]`) accepts the write. */
export const FIXTURE_PREFIX = `${BATTERY_USER_ID}/iso4`;
export const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public/${GALLERY_BUCKET}`;

/**
 * The canonical gallery fixtures.
 *
 * FIVE, because spec 42 opens the lightbox on `items[2]` and then steps
 * FORWARD — so a fourth photo has to exist for that step to land on. Five gives
 * the wrap-around tests a lap with room to spare, and gives the filmstrip enough
 * width to actually glide (spec 43 measures px/sec on a strip of `w-[72%]`
 * tiles; three would barely overflow the viewport).
 *
 * Deliberately MIXED aspect ratios: the crop sheet's cover-fit floor behaves
 * differently on a tall photo (width-fills, pans vertically only) than on a wide
 * one, and spec 41 asserts "no tile background" on whichever photo is FIRST. A
 * portrait first photo exercises the interesting half of that floor.
 *
 * Solid colour + a numeral + a white band across 45–55% of the height: the
 * numeral makes a mis-ordered preview legible in a screenshot rather than a diff
 * of hashes, and the band makes a vertical mis-offset visible at a glance — the
 * same marker specs 41 and 44 paint into their own staged canvases.
 */
export const GALLERY_FIXTURES = [
  { n: 1, file: 'iso4-gallery-01.png', w: 540, h: 960, rgb: [201, 165, 92], note: '9:16 portrait' },
  { n: 2, file: 'iso4-gallery-02.png', w: 960, h: 540, rgb: [46, 111, 158], note: '16:9 landscape' },
  { n: 3, file: 'iso4-gallery-03.png', w: 800, h: 800, rgb: [62, 142, 90], note: '1:1 square — carries the canonical crop' },
  { n: 4, file: 'iso4-gallery-04.png', w: 600, h: 800, rgb: [122, 46, 142], note: '3:4 portrait' },
  { n: 5, file: 'iso4-gallery-05.png', w: 800, h: 600, rgb: [180, 68, 47], note: '4:3 landscape' },
].map((f) => ({
  ...f,
  localPath: path.join(ASSET_DIR, f.file),
  storagePath: `${FIXTURE_PREFIX}/${f.file}`,
  publicUrl: `${PUBLIC_BASE}/${FIXTURE_PREFIX}/${f.file}`,
}));

// ── PNG generation ──────────────────────────────────────────────────────────
// A 5x7 bitmap for the digits 1-5. Hand-rolled rather than pulled from a font:
// the only text these fixtures carry is a single numeral, and a font dependency
// for five glyphs would be a package.json change for nothing.
const GLYPHS = {
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
};

function renderFixture({ w, h, rgb, n }) {
  const png = new PNG({ width: w, height: h });
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (w * y + x) << 2;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  };

  const WHITE = [255, 255, 255];

  // Ground.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, rgb);

  // The 45–55% band: a vertical mis-offset shows as the band off centre.
  for (let y = Math.round(h * 0.45); y < Math.round(h * 0.55); y++) {
    for (let x = 0; x < w; x++) put(x, y, WHITE);
  }

  // The numeral, in the TOP third — clear of the band, so a crop that keeps the
  // number but loses the band (or vice versa) says exactly which part of the
  // photo the tile is showing.
  const rows = GLYPHS[n];
  const px = Math.max(3, Math.round(Math.min(w, h) * 0.05));
  const ox = Math.round((w - 5 * px) / 2);
  const oy = Math.round(h * 0.18);
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
    if (rows[gy][gx] !== '1') continue;
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
      put(ox + gx * px + dx, oy + gy * px + dy, WHITE);
    }
  }

  // Border LAST, so it survives the band and reads as the photo's own edge —
  // which is how a stray strip of tile background becomes visible in a
  // screenshot instead of blending into a white margin.
  const bw = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < bw || y < bw || x >= w - bw || y >= h - bw) {
      put(x, y, [Math.round(rgb[0] * 0.45), Math.round(rgb[1] * 0.45), Math.round(rgb[2] * 0.45)]);
    }
  }
  return PNG.sync.write(png);
}

function generate() {
  if (!existsSync(ASSET_DIR)) mkdirSync(ASSET_DIR, { recursive: true });
  for (const f of GALLERY_FIXTURES) {
    const buf = renderFixture(f);
    writeFileSync(f.localPath, buf);
    console.log(`wrote ${path.relative(ROOT, f.localPath)}  ${f.w}x${f.h}  ${buf.length} bytes  (${f.note})`);
  }
  console.log(`\n${GALLERY_FIXTURES.length} fixtures generated. They are TRACKED — commit them.`);
}

// ── env ─────────────────────────────────────────────────────────────────────
// Dependency-free loader, the playwright.config.ts precedent: a value already in
// the real environment always wins.
function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

function requireEnv() {
  loadEnv('.env');
  loadEnv('.env.test');
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `Missing ${missing.join(', ')}.\n` +
      '  .env      -> VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY\n' +
      '  .env.test -> TEST_USER_EMAIL, TEST_USER_PASSWORD (see .env.test.example)',
    );
    process.exit(1);
  }
  if (process.env.VITE_SUPABASE_URL !== SUPABASE_URL) {
    console.error(
      `REFUSED: .env points at ${process.env.VITE_SUPABASE_URL}, not the production project ` +
      `${SUPABASE_URL}. The fixture URLs this script mints are baked into the reseed SQL; ` +
      'uploading them anywhere else would leave that SQL pointing at 404s.',
    );
    process.exit(1);
  }
}

/** Sign in as the battery account and re-check the TL.ISO.1 identity pin. */
async function signIn() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
  });
  if (error) { console.error(`Login failed: ${error.message}`); process.exit(1); }

  const id = data.user?.id ?? '';
  // The same pin auth.setup.ts applies, for a sharper reason: this script
  // WRITES, and a drifted .env.test would write into a real page's bucket.
  if (id === OLD_JOEYC_USER_ID) {
    console.error(
      `REFUSED: .env.test holds credentials for Joey's PERSONAL account (${data.user.email}). ` +
      'TL.ISO.1 — that is the Aug 18-19 incident class. Nothing was written.',
    );
    process.exit(1);
  }
  if (id !== BATTERY_USER_ID) {
    console.error(
      `REFUSED: signed in as ${data.user?.email} (${id}), not the pinned battery account ` +
      `${BATTERY_USER_ID}. Fix .env.test. Nothing was written.`,
    );
    process.exit(1);
  }
  console.log(`ok  signed in as the battery account ${data.user.email} (${id})`);
  return sb;
}

async function upload({ dryRun }) {
  for (const f of GALLERY_FIXTURES) {
    if (!existsSync(f.localPath)) {
      console.error(`Missing ${path.relative(ROOT, f.localPath)} — run --generate first.`);
      process.exit(1);
    }
  }
  requireEnv();
  console.log(
    `\nTarget: ${GALLERY_BUCKET}/${FIXTURE_PREFIX}/  ` +
    `(${GALLERY_FIXTURES.length} objects, delete-then-upload)\n`,
  );
  if (dryRun) {
    for (const f of GALLERY_FIXTURES) {
      console.log(`  would delete (if present) then upload ${path.relative(ROOT, f.localPath)}`);
      console.log(`    -> ${f.publicUrl}`);
    }
    console.log('\n--dry-run: nothing was uploaded and no connection was made.');
    return;
  }

  const sb = await signIn();
  const store = sb.storage.from(GALLERY_BUCKET);

  /** Which canonical fixtures are objects in the bucket right now. */
  const present = async () => {
    const { data, error } = await store.list(FIXTURE_PREFIX, { limit: 1000 });
    if (error) { console.error(`  x  list ${FIXTURE_PREFIX}: ${error.message}`); process.exit(1); }
    const names = new Set((data ?? []).filter((e) => e.id !== null).map((e) => e.name));
    return GALLERY_FIXTURES.filter((f) => names.has(f.file));
  };

  // 1. Clear the way. See the RE-RUNNING note in the header: overwriting in
  //    place would need an UPDATE policy this bucket does not have.
  const stale = await present();
  if (stale.length) {
    const { error } = await store.remove(stale.map((f) => f.storagePath));
    if (error) { console.error(`  x  delete: ${error.message}`); process.exit(1); }
    // A remove() that RLS refuses comes back data: [], error: null - a SILENT
    // no-op (the STOR.4 trap). The only honest confirmation is to look again.
    const left = await present();
    if (left.length) {
      console.error(
        `  x  delete was a no-op - ${left.length} object(s) survived: ` +
        `${left.map((f) => f.file).join(', ')}.\n` +
        '     The products bucket owner-folder DELETE policy (STOR.4) is missing or has ' +
        'drifted; storage.remove() reports success either way. Nothing was uploaded.',
      );
      process.exit(1);
    }
    console.log(`  ok deleted ${stale.length} existing object(s)`);
  }

  // 2. Fresh INSERTs. upsert stays FALSE on purpose: after step 1 the path is
  //    empty, so a duplicate error here is a real surprise worth failing on,
  //    not the routine overwrite the old upsert:true was quietly hiding.
  for (const f of GALLERY_FIXTURES) {
    const body = readFileSync(f.localPath);
    const { error } = await store.upload(f.storagePath, body, {
      upsert: false,
      contentType: 'image/png',
    });
    if (error) { console.error(`  x  ${f.file}: ${error.message}`); process.exit(1); }
    console.log(`  ok ${f.file} -> ${f.publicUrl}`);
  }
  console.log(
    `\n${GALLERY_FIXTURES.length} fixtures uploaded.\n` +
    'These exact URLs are already hardcoded in the reseed SQL — step 2 needs no edit.\n' +
    'Next: node scripts/reset-test-account.mjs   (then paste the SQL into the Supabase editor)',
  );
}

async function listOrphans({ dryRun }) {
  requireEnv();
  if (dryRun) {
    console.log(
      `--dry-run: would list ${GALLERY_BUCKET}/${BATTERY_USER_ID}/ and report every object ` +
      `outside ${FIXTURE_PREFIX}/. No connection was made.`,
    );
    return;
  }
  const sb = await signIn();
  const canonical = new Set(GALLERY_FIXTURES.map((f) => f.storagePath));
  const found = [];
  // One level of folders under the uid, then the objects inside each. The app
  // writes flat (`{uid}/{uuid}.png`); this script writes one folder deeper.
  const walk = async (prefix) => {
    const { data, error } = await sb.storage.from(GALLERY_BUCKET).list(prefix, { limit: 1000 });
    if (error) { console.error(`list ${prefix}: ${error.message}`); process.exit(1); }
    for (const e of data ?? []) {
      const full = `${prefix}/${e.name}`;
      if (e.id === null) await walk(full);       // a folder placeholder carries no id
      else if (!canonical.has(full)) found.push(full);
    }
  };
  await walk(BATTERY_USER_ID);
  if (!found.length) {
    console.log(`\nNo orphans: every object under ${GALLERY_BUCKET}/${BATTERY_USER_ID}/ is a canonical fixture.`);
    return;
  }
  console.log(`\n${found.length} non-canonical object(s) — litter from a battery run that was killed:`);
  for (const f of found) console.log(`  ${f}`);
  console.log(
    '\nREAD-ONLY. Nothing was deleted. A reseed orphans these (the rows go, the objects stay);\n' +
    'delete them by hand in the Supabase Storage browser if the bucket needs tidying.',
  );
}

function usage() {
  console.log(`
TL.ISO.4 - canonical asset seam for the battery account (${BATTERY_HANDLE}).

  node scripts/seed-test-account-assets.mjs --upload
      Sign in as the battery account and (re)place the ${GALLERY_FIXTURES.length} gallery fixtures in
      ${GALLERY_BUCKET}/${FIXTURE_PREFIX}/. This is STEP 1 of the restore runbook.
      Re-runnable: any existing copy is DELETED first (the bucket has no UPDATE
      policy, so an in-place overwrite fails RLS), then re-uploaded to the same
      path. Same paths, same bytes, same public URLs, every time.

  node scripts/seed-test-account-assets.mjs --generate
      Re-render tests/fixtures-assets/*.png from the manifest in this file.
      Offline. The PNGs are tracked, so this is only needed if the manifest moves.

  node scripts/seed-test-account-assets.mjs --list-orphans
      Read-only. List objects under ${GALLERY_BUCKET}/${BATTERY_USER_ID}/
      that are not canonical fixtures - litter from a battery run that was killed.

  Add --dry-run to --upload / --list-orphans to print the plan and connect to nothing.

THE FULL RESTORE RUNBOOK (PowerShell, from C:\\dev\\titilinks):
  1  node scripts/seed-test-account-assets.mjs --upload
  2  node scripts/reset-test-account.mjs        # prints SQL - paste it into the
                                                # Supabase web SQL editor and Run
  3  npm test
`);
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const dryRun = argv.has('--dry-run');
  if (argv.has('--generate')) return generate();
  if (argv.has('--upload')) return upload({ dryRun });
  if (argv.has('--list-orphans')) return listOrphans({ dryRun });
  usage();
}

// CLI only when run directly — reset-test-account.mjs imports the manifest from
// here, so the URLs in the SQL and the bytes on disk can never drift apart.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

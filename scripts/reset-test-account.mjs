// TL.ISO.4 — canonical reseed SQL emitter for the Playwright battery account.
// (HOUSE.1 originally; extended from a plan/badge patch to a whole-tree restore.)
//
// PRINTS the SQL that restores the dedicated battery account
// (joey2019pwtest+battery@gmail.com, public handle "joey2019pwtestbattery",
// user id d3f1cfce-d15a-4f4a-ba5c-908e3e959e58 — TL.ISO.1) to its CANONICAL
// state. It does NOT connect to any database and holds no secrets: Joey pastes
// the output into the Supabase web SQL editor (prod ref ohmvlypcbrfkuudcuqub),
// the only sanctioned place SQL is ever run here.
//
// The FORMER battery account (joey2019pwtest, handle "joeyc") is Joey's PERSONAL
// page since TL.ISO.1 — this script refuses to emit SQL for it, and the emitted
// SQL re-checks the identity pin server-side before it changes a single row.
//
// ── WHY THE TREE, NOT JUST THE PLAN ──────────────────────────────────────────
// The gallery suite (specs 41-45, 30 tests across the two projects) does not
// create the content it measures: it BORROWS the account's own gallery block,
// re-configures it, and puts the configuration back. On an account with no
// gallery photos every one of them dies on `no gallery block is rendered`.
// Spec 45 is the same story one step removed — it locates the page's mode by
// finding the gallery whose photos are on screen. So the fixture the battery
// needs is a whole content tree, and this emitter is where it is written down.
//
// ── THE TWO-STEP RESTORE ─────────────────────────────────────────────────────
// SQL cannot upload files, and gallery photos are real objects in the `products`
// bucket. So the assets are seeded by a separate Node script FIRST, at stable
// paths, and the SQL below just references those URLs. The manifest is imported
// from that script rather than retyped, so the two halves cannot drift.
//
// ── CANONICAL STATE ──────────────────────────────────────────────────────────
//   profiles.plan       = 'pro'    → PRO entitlements (snapshots, animations…)
//   profiles.show_badge = true     → "Made with TitiLinks" badge (PROMO.TOGGLE.1)
//   page1 mode          = 9 blocks, the app's own default composition
//                         (BLOCK_PRESETS default + the two header social blocks)
//                         plus an email_subscribe block, with content
//   page2 mode          = the born-complete set from ensureSecondPage, NO items
//                         (so `liveGallery`'s "the gallery whose photos are on
//                         screen" discriminator can never pick the wrong block)
//
// What this deliberately does NOT touch: pages.theme_json, pages.avatar_url /
// avatar_original_url, profiles.brand_json, snapshots, short links. The hero
// photo in particular is load-bearing for spec 33 (full_bleed sticky layer) and
// is a real uploaded asset, not something SQL can restore — so the verification
// block flags it rather than clearing it.
//
// ── THE SINGLETON INDEX ──────────────────────────────────────────────────────
// blocks_mode_type_singleton_uidx (TL.BLOCK.1) is a partial unique index on
// (mode_id, type) where type <> 'text'. The reseed is therefore a full
// delete-then-insert inside ONE transaction rather than any kind of blind
// INSERT: every canonical type appears exactly once per mode, and the tear-down
// runs first so a re-run can never collide with what it is replacing.
//
// Usage:
//   node scripts/reset-test-account.mjs             → full canonical reseed SQL
//   node scripts/reset-test-account.mjs --plan-only → just the plan/badge patch
//                                                     (the original HOUSE.1 SQL)
//   node scripts/reset-test-account.mjs somehandle  → plan/badge patch for
//                                                     another handle
import {
  BATTERY_HANDLE,
  BATTERY_USER_ID,
  GALLERY_FIXTURES,
  SUPABASE_PROJECT_REF,
} from './seed-test-account-assets.mjs';

const args = process.argv.slice(2);
const planOnly = args.includes('--plan-only');
const handleArg = args.find((a) => !a.startsWith('--'))?.trim();
const handle = handleArg || BATTERY_HANDLE;

if (handle === 'joeyc') {
  console.error(
    'REFUSED: "joeyc" is Joey\'s PERSONAL page (TL.ISO.1). The battery account is "joey2019pwtestbattery".'
  );
  process.exit(1);
}

// Escape single quotes for a safe SQL string literal.
const esc = (s) => String(s).replace(/'/g, "''");
const q = (v) => (v === null || v === undefined ? 'null' : `'${esc(v)}'`);
const h = esc(handle);

// ── The plan/badge patch (the original HOUSE.1 emitter) ─────────────────────
const planSql = () => `-- HOUSE.1 reset — restore the Playwright test account's plan and badge.
-- Target: public.profiles for the account behind handle '${h}'.
-- Canonical: plan = 'pro', show_badge = true.
-- Run in the Supabase SQL editor (prod ref ${SUPABASE_PROJECT_REF}). Read-only
-- SELECTs bracket the UPDATE so you can eyeball the row before and after.
--
-- This is the LIGHT restore. For the full canonical content tree (what the
-- gallery suite needs), run: node scripts/reset-test-account.mjs

-- 1. BEFORE — confirm you are about to touch exactly one, correct row.
select p.id, pg.handle, p.plan, p.show_badge
from public.profiles p
join public.pages pg on pg.user_id = p.id
where pg.handle = '${h}';

-- 2. RESET — put plan and badge back to canonical.
update public.profiles
set plan = 'pro',
    show_badge = true
where id = (
  select user_id from public.pages where handle = '${h}' limit 1
);

-- 3. AFTER — verify the reset landed.
select p.id, pg.handle, p.plan, p.show_badge
from public.profiles p
join public.pages pg on pg.user_id = p.id
where pg.handle = '${h}';
`;

if (planOnly || handle !== BATTERY_HANDLE) {
  if (handle !== BATTERY_HANDLE && !planOnly) {
    console.error(
      `-- NOTE: '${handle}' is not the battery account. The full canonical reseed is\n` +
      `-- pinned to ${BATTERY_HANDLE} (its fixture URLs embed that account's uid),\n` +
      '-- so only the plan/badge patch is emitted below.\n'
    );
  }
  console.log(planSql());
  process.exit(0);
}

// ═════════════════════════════════════════════════════════════════════════════
// THE CANONICAL CONTENT TREE
// ═════════════════════════════════════════════════════════════════════════════
//
// Item shapes are the app's OWN seeds, copied verbatim where one exists, so a
// reseeded account is indistinguishable from a freshly-onboarded one:
//   • links / product_cards / primary_cta / email_subscribe → OnboardingFlow
//     .prefillBlockContent
//   • gallery items → GalleryEditor.handleSave's insert path
//     (label 'Photo', url '', the config in blocks.title)
//   • block list + order → BLOCK_PRESETS['default'] behind the two header
//     social blocks, exactly as ensureSecondPage composes a born page
//
// ONE deviation, and it is deliberate: video_feed is seeded with NO items.
// VideoFeedBlock renders nothing without a config, the account has no real
// videos to point at, and a dead embed URL on a page the battery screenshots is
// worse than an absent block. The block itself stays so the editor row resolves.

/** The gallery's config lives JSON-in-title — GalleryEditor's own defaults. */
const GALLERY_CONFIG = JSON.stringify({ layout: 'full', autoScroll: true, speed: 'slow' });

/**
 * The canonical crop, on photo 3 (the square one).
 *
 * Photo 3 and not 1 or 2 on purpose: spec 41 opens the FIRST panel tile and
 * asserts the cropper's cover-fit floor on it, and spec 42 writes its own crop
 * onto items[0] and restores whatever was there. Parking the canonical crop in
 * the middle of the strip keeps it out of both blast radii while still giving
 * every spec that counts framed photos (spec 44's staged-crop assertion) a
 * non-zero, non-trivial baseline.
 *
 * A centred 60% window: legal under all four of TL.GAL.3b.1's inequalities
 * (x >= 0, y >= 0, x + w <= 100, y + h <= 100), so resolveGalleryCrop returns it
 * untouched and the tile paints geometry rather than falling through to the
 * plain object-cover path.
 */
const CANONICAL_CROP = { x: 20, y: 20, w: 60, h: 60 };

const galleryItems = GALLERY_FIXTURES.map((f, i) => ({
  label: 'Photo',
  url: '',
  image_url: f.publicUrl,
  style_json: f.n === 3 ? JSON.stringify({ crop: CANONICAL_CROP }) : null,
  order_index: i,
}));

/** EmailSubscribeBlock reads its config from item.badge — OnboardingFlow's seed. */
const EMAIL_CONFIG = JSON.stringify({
  title: 'Stay up to date',
  placeholder: 'your@email.com',
  button_label: 'Subscribe',
  success_message: 'Thanks for subscribing!',
  redirect_url: '',
  collect_name: false,
  name_placeholder: 'Your name',
});

const PAGE1 = [
  {
    type: 'social_links', title: 'Social Links', items: [
      { label: 'Instagram', url: 'https://instagram.com/titilinks' },
      { label: 'TikTok', url: 'https://tiktok.com/@titilinks' },
      { label: 'YouTube', url: 'https://youtube.com/@titilinks' },
    ],
  },
  {
    type: 'social_icon_row', title: 'Social Icons', items: [
      { label: 'Instagram', url: 'https://instagram.com/titilinks' },
      { label: 'X (Twitter)', url: 'https://x.com/titilinks' },
      { label: 'Spotify', url: 'https://open.spotify.com/user/titilinks' },
    ],
  },
  {
    type: 'primary_cta', title: 'Primary CTA', items: [
      { label: 'Shop My Collection', url: 'https://example.com/shop', subtitle: 'New arrivals every week', badge: 'NEW' },
    ],
  },
  {
    type: 'links', title: 'Links', items: [
      { label: 'My Website', url: 'https://example.com', subtitle: 'Check out my website' },
      { label: 'Latest Blog Post', url: 'https://example.com/blog', subtitle: 'Read my latest content' },
      { label: 'Work With Me', url: 'https://example.com/contact', subtitle: 'Collaborations & partnerships', badge: 'OPEN' },
    ],
  },
  {
    type: 'product_cards', title: 'Products', items: [
      { label: 'Product One', url: 'https://example.com/product-1', subtitle: 'Your best seller', badge: 'SALE' },
      { label: 'Product Two', url: 'https://example.com/product-2', subtitle: 'New arrival' },
      { label: 'Product Three', url: 'https://example.com/product-3', subtitle: 'Fan favorite' },
    ],
  },
  { type: 'gallery', title: GALLERY_CONFIG, items: galleryItems },
  { type: 'video_feed', title: 'Videos', items: [] },
  {
    type: 'bio', title: 'About', items: [
      { label: 'Battery fixture account. Every block on this page is written by scripts/reset-test-account.mjs — edit the emitter, not the page.', url: '' },
    ],
  },
  {
    type: 'email_subscribe', title: 'Email Subscribe', items: [
      { label: 'Stay up to date', url: '#', subtitle: 'Thanks for subscribing!', badge: EMAIL_CONFIG },
    ],
  },
];

/** ensureSecondPage's born-complete composition, item-less. */
const PAGE2 = [
  { type: 'social_links', title: 'Social Links' },
  { type: 'social_icon_row', title: 'Social Icons' },
  { type: 'primary_cta', title: 'Primary CTA' },
  { type: 'links', title: 'Links' },
  { type: 'product_cards', title: 'Products' },
  { type: 'gallery', title: 'Gallery' },
  { type: 'video_feed', title: 'Videos' },
  { type: 'bio', title: 'About' },
];

// ── SQL generation ──────────────────────────────────────────────────────────
const itemSql = (it, i) => {
  const cols = ['block_id', 'label', 'url', 'order_index'];
  const vals = ['v_block', q(it.label), q(it.url), String(it.order_index ?? i)];
  if (it.subtitle !== undefined) { cols.push('subtitle'); vals.push(q(it.subtitle)); }
  if (it.badge !== undefined) { cols.push('badge'); vals.push(q(it.badge)); }
  if (it.image_url !== undefined) { cols.push('image_url'); vals.push(q(it.image_url)); }
  if (it.style_json !== undefined) {
    cols.push('style_json');
    vals.push(it.style_json === null ? 'null' : `${q(it.style_json)}::jsonb`);
  }
  return `  insert into public.block_items (${cols.join(', ')})\n` +
         `  values (${vals.join(', ')});`;
};

const blockSql = (b, order) => {
  const n = b.items?.length ?? 0;
  const lines = [
    `  -- block ${order}: ${b.type}${n ? ` (${n} item${n === 1 ? '' : 's'})` : ' — no items, by design'}`,
    '  insert into public.blocks (mode_id, type, title, is_enabled, order_index)',
    `  values (v_mode1, '${b.type}', ${q(b.title)}, true, ${order})`,
    '  returning id into v_block;',
  ];
  for (const [i, it] of (b.items ?? []).entries()) lines.push(itemSql(it, i));
  return lines.join('\n');
};

const page2Sql = PAGE2.map((b, i) =>
  `      (v_mode2, '${b.type}', ${q(b.title)}, true, ${i})`).join(',\n');

const expected = {
  page1Blocks: PAGE1.length,
  page1Items: PAGE1.reduce((n, b) => n + (b.items?.length ?? 0), 0),
  photos: galleryItems.length,
  cropped: galleryItems.filter((i) => i.style_json).length,
  page2Blocks: PAGE2.length,
};

const sql = `-- ════════════════════════════════════════════════════════════════════════════
-- TL.ISO.4 — CANONICAL RESEED for the Playwright battery account.
--
--   handle  ${BATTERY_HANDLE}
--   user id ${BATTERY_USER_ID}
--   project ${SUPABASE_PROJECT_REF}  (production)
--
-- ── RUNBOOK — three steps, in this order ────────────────────────────────────
--   ①  UPLOAD THE ASSETS   (PowerShell, from C:\\dev\\titilinks)
--          node scripts/seed-test-account-assets.mjs --upload
--      Puts the ${expected.photos} gallery fixtures in the products bucket at the stable
--      paths the INSERTs below reference. Idempotent — re-running upserts.
--      Skip it and the page reseeds with ${expected.photos} broken images.
--
--   ②  RUN THIS SQL        (Supabase web SQL editor, project ${SUPABASE_PROJECT_REF})
--      Paste the whole file and Run. One transaction; the identity pin below
--      aborts it before any change if the handle is not the battery account.
--      The last statement is a verification table — read it.
--
--   ③  RUN THE BATTERY     (PowerShell, from C:\\dev\\titilinks)
--          npm run dev          # port 8085, in its own terminal
--          npm test
--
-- Generated by scripts/reset-test-account.mjs — do not hand-edit. Re-emit
-- instead, so the fixture URLs stay in step with the upload script's manifest.
-- ════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_user  uuid;
  v_page  uuid;
  v_mode1 uuid;
  v_mode2 uuid;
  v_block uuid;
begin
  -- ── 0. IDENTITY PIN (TL.ISO.1, restated at the SQL layer) ─────────────────
  -- The whole point of ISO.1 is that a destructive restore can never land on a
  -- real page. The emitter refuses the personal handle in Node; this refuses it
  -- again in the database, where the handle is actually resolved to a user.
  select p.user_id, p.id into v_user, v_page
  from public.pages p
  where p.handle = '${h}';

  if v_user is null then
    raise exception 'TL.ISO.4: no page with handle % exists. Nothing was changed.', '${h}';
  end if;
  if v_user <> '${BATTERY_USER_ID}'::uuid then
    raise exception
      'TL.ISO.4 IDENTITY PIN: handle % belongs to %, not the battery account %. ABORTED — nothing was changed.',
      '${h}', v_user, '${BATTERY_USER_ID}';
  end if;

  select id into v_mode1 from public.modes where page_id = v_page and type = 'page1';
  if v_mode1 is null then
    raise exception 'TL.ISO.4: the battery page has no page1 mode. Nothing was changed.';
  end if;
  select id into v_mode2 from public.modes where page_id = v_page and type = 'page2';

  -- ── 1. TEAR DOWN ─────────────────────────────────────────────────────────
  -- Every block on every mode of this page, items first. blocks → block_items
  -- is ON DELETE CASCADE and the two goal columns on pages are ON DELETE SET
  -- NULL, so nothing else is left dangling. This runs BEFORE any insert so the
  -- singleton index (blocks_mode_type_singleton_uidx) can never see two rows of
  -- a type at once — the delete-then-insert is what makes the reseed re-runnable.
  delete from public.block_items
  where block_id in (select id from public.blocks where mode_id in
    (select id from public.modes where page_id = v_page));

  delete from public.blocks
  where mode_id in (select id from public.modes where page_id = v_page);

  -- ── 2. PAGE 1 — the canonical tree ───────────────────────────────────────
  -- BLOCK_PRESETS['default'] behind the two header social blocks, exactly as
  -- ensureSecondPage composes a born page, plus email_subscribe. One block per
  -- type, so every row satisfies the singleton index by construction.
${PAGE1.map((b, i) => blockSql(b, i)).join('\n\n')}

  -- ── 3. PAGE 2 — born-complete, deliberately EMPTY ────────────────────────
  -- Only if the account already has a page2 mode; this never creates one.
  -- No items at all: specs 42/43/45 identify "the gallery this page renders" as
  -- the gallery whose first photo is in the DOM, and a second gallery holding
  -- photos would make that discriminator a coin toss.
  if v_mode2 is not null then
    insert into public.blocks (mode_id, type, title, is_enabled, order_index)
    values
${page2Sql};
  end if;

  -- ── 4. PLAN + BADGE ──────────────────────────────────────────────────────
  update public.profiles
  set plan = 'pro',          -- PRO entitlements: snapshots, animations, 2 pages
      show_badge = true      -- PROMO.TOGGLE.1 canonical
  where id = v_user;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — one table, expected vs actual. Every row must read ok = true.
-- (The Supabase editor shows the LAST result set, so the checks are unioned
--  into a single statement rather than left as a column of separate SELECTs.)
-- ════════════════════════════════════════════════════════════════════════════
with ctx as (
  select p.id as page_id, p.user_id, p.avatar_url
  from public.pages p where p.handle = '${h}'
),
m1 as (select id from public.modes, ctx where modes.page_id = ctx.page_id and modes.type = 'page1'),
m2 as (select id from public.modes, ctx where modes.page_id = ctx.page_id and modes.type = 'page2'),
gal as (select b.id from public.blocks b, m1 where b.mode_id = m1.id and b.type = 'gallery'),
checks(seq, check_name, expected, actual) as (
  values
    (1, 'page1 blocks',
        '${expected.page1Blocks}',
        (select count(*)::text from public.blocks, m1 where blocks.mode_id = m1.id)),
    (2, 'page1 block_items',
        '${expected.page1Items}',
        (select count(*)::text from public.block_items bi
          where bi.block_id in (select blocks.id from public.blocks, m1 where blocks.mode_id = m1.id))),
    (3, 'gallery photos',
        '${expected.photos}',
        (select count(*)::text from public.block_items bi, gal where bi.block_id = gal.id)),
    (4, 'gallery photos pointing at the ISO.4 fixtures',
        '${expected.photos}',
        (select count(*)::text from public.block_items bi, gal
          where bi.block_id = gal.id and bi.image_url like '%/${BATTERY_USER_ID}/iso4/%')),
    (5, 'gallery photos carrying a crop',
        '${expected.cropped}',
        -- jsonb_exists(), not the ? operator: some SQL clients read a bare ?
        -- as a bind placeholder and mangle the statement before it is sent.
        (select count(*)::text from public.block_items bi, gal
          where bi.block_id = gal.id and jsonb_exists(bi.style_json, 'crop'))),
    (6, 'email_subscribe blocks on page1 (0 = spec 29 will INSERT one)',
        '1',
        (select count(*)::text from public.blocks, m1
          where blocks.mode_id = m1.id and blocks.type = 'email_subscribe')),
    (7, 'page2 blocks (0 when the account has no page2 mode)',
        (select case when exists (select 1 from m2) then '${expected.page2Blocks}' else '0' end),
        (select coalesce((select count(*)::text from public.blocks, m2 where blocks.mode_id = m2.id), '0'))),
    (8, 'page2 block_items (always 0 by design)',
        '0',
        (select coalesce((select count(*)::text from public.block_items bi
          where bi.block_id in (select blocks.id from public.blocks, m2 where blocks.mode_id = m2.id)), '0'))),
    (9, 'duplicate non-text blocks anywhere on this page (singleton index)',
        '0',
        (select coalesce(sum(d.c - 1), 0)::text
           from (select count(*) as c
                   from public.blocks b
                   join public.modes md on md.id = b.mode_id
                   join ctx on ctx.page_id = md.page_id
                  where b.type <> 'text'
                  group by b.mode_id, b.type
                 having count(*) > 1) d)),
    (10, 'profiles.plan',
        'pro',
        (select p.plan from public.profiles p, ctx where p.id = ctx.user_id)),
    (11, 'profiles.show_badge',
        'true',
        (select p.show_badge::text from public.profiles p, ctx where p.id = ctx.user_id)),
    (12, 'hero photo present (spec 33 needs one; SQL cannot restore it)',
        'true',
        (select (ctx.avatar_url is not null and ctx.avatar_url <> '')::text from ctx))
)
-- coalesce, not a bare '=': a check whose subquery finds no row at all yields
-- NULL, and a NULL ok column reads as "fine" at a glance. It is not fine.
select check_name, expected, actual, coalesce(expected = actual, false) as ok
from checks order by seq;

-- Row 12 is the one check this script cannot fix. pages.avatar_url is a real
-- uploaded photo; if it reads false, upload a hero through the editor before
-- running the battery or spec 33's full_bleed test has no sticky layer to find.
`;

console.log(sql);

// HOUSE.1 — test-account reset SQL emitter.
//
// PRINTS the SQL that restores the dedicated Playwright battery account
// (joey2019pwtest+battery@gmail.com, public handle "joey2019pwtestbattery",
// user id d3f1cfce-d15a-4f4a-ba5c-908e3e959e58 — TL.ISO.1) to its CANONICAL
// state after a battery mutates it. It does NOT connect to any database and
// holds no secrets — Joey pastes the output into the Supabase web SQL editor
// (prod ref ohmvlypcbrfkuudcuqub), the only sanctioned place SQL is ever run
// here.
//
// The FORMER battery account (joey2019pwtest, handle "joeyc") is Joey's
// PERSONAL page since TL.ISO.1 — this script refuses to emit SQL for it.
//
// ── CANONICAL STATE (public.profiles for the test account) ───────────────────
//   plan       = 'pro'    → PRO entitlements (max snapshots, animations, etc.)
//   show_badge = true     → "Made with TitiLinks" badge visible (PROMO.TOGGLE.1)
// Anything a battery flips (a spec that downgrades plan or toggles the badge)
// is put back by the UPDATE below.
//
// The row is targeted by public handle via pages.user_id → profiles.id
// (profiles is owner-only RLS and keyed by the auth user id; the handle is the
// stable, non-secret selector already committed across the test suite).
//
// Usage:
//   node scripts/reset-test-account.mjs            → SQL for "joey2019pwtestbattery"
//   node scripts/reset-test-account.mjs somehandle → SQL for a different handle

const handleArg = process.argv[2] && process.argv[2].trim();
const handle = handleArg || 'joey2019pwtestbattery';

if (handle === 'joeyc') {
  console.error(
    'REFUSED: "joeyc" is Joey\'s PERSONAL page (TL.ISO.1). The battery account is "joey2019pwtestbattery".'
  );
  process.exit(1);
}

// Escape single quotes for a safe SQL string literal.
const h = handle.replace(/'/g, "''");

const sql = `-- HOUSE.1 reset — restore the Playwright test account to canonical state.
-- Target: public.profiles for the account behind handle '${h}'.
-- Canonical: plan = 'pro', show_badge = true.
-- Run in the Supabase SQL editor (prod ref ohmvlypcbrfkuudcuqub). Read-only
-- SELECTs bracket the UPDATE so you can eyeball the row before and after.

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

console.log(sql);

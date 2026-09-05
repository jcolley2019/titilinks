# supabase/migrations — a RECORD, not a ledger

**Read this before pasting anything in this directory into the SQL editor.**

## How prod is actually managed

- Production is project ref `ohmvlypcbrfkuudcuqub`. `supabase/config.toml` points at an
  ORPHAN project; never `supabase db push`, never `supabase link`.
- Every object in prod was created by hand, by Joey, in the Supabase web SQL editor.
  Agents never run DDL or DML; they hand Joey a statement and he pastes it.
- `supabase_migrations.schema_migrations` in prod is **empty** (`list_migrations` → `[]`).
  The CLI has never applied a file here. Nothing checks this directory against prod.
- So this directory is **documentation of what was pasted**, in order, plus a few files
  that are deliberate records of prod state and were never meant to be run at all.
- The authoritative repo-vs-prod comparison is `docs/AUDIT_rev6.md` §1 (read-only audit of
  2026-09-01). File numbers below (#1–#40) are that report's numbering.

## Classes

| Class | Meaning |
|---|---|
| **RE-RUNNABLE** | Idempotent forms (`IF NOT EXISTS`, `create or replace`, `drop … if exists` + create). Pasting again changes nothing or re-applies identically. |
| **RECORD-ONLY** | Mirrors DDL already live in prod in non-idempotent form. Pasting again fails on "already exists" (harmless) or, for the January files, leaves duplicates/drift behind. Do not paste; read. |
| **SUPERSEDED** | A later file replaced this one's object. Pasting again fails or regresses prod to the older shape. |
| **DO-NOT-RUN** | Pasting would resurrect a deliberately dropped object or reopen a closed write path. Carries a `⚠️ DO NOT RUN THIS FILE` header within its first 10 lines; the `MIG-HEADERS` guard invariant pins that. |

Prod status is the audit's verdict: **MATCH** (prod holds what the file says), **DRIFT**
(prod differs), **DROPPED** (the object was removed from prod on purpose).

## All 44 files

| # | File | Purpose | Class | Prod status (§1.2) |
|---|---|---|---|---|
| 1 | `20260111040649_7b135b54-cfb3-49ff-bd02-a80e016b80f7.sql` | January schema init: enums, profiles/pages/modes/blocks/block_items/events, RLS, owner helpers, `handle_new_user`, `updated_at` triggers | DO-NOT-RUN (as a whole; the `"Anyone can insert events"` and `"Users can update their own profile"` stanzas are the hazards) | DRIFT (§1.3.1–1.3.5, 1.3.8) |
| 2 | `20260111040817_b20d120f-061f-44e0-8ece-d06716baa587.sql` | `update_updated_at_column()` with `search_path` | RECORD-ONLY | DRIFT — function absent in prod |
| 3 | `20260111042037_125c0bf8-3a9d-4610-bd35-83a774e6c361.sql` | `avatars` bucket + 4 storage policies | RECORD-ONLY | DRIFT — prod has own-folder SELECT/INSERT only, 50 MB image+video limit |
| 4 | `20260111043832_b59a1833-ed5d-4b32-87f7-c1a0127ba4fc.sql` | `products` bucket + storage policies | RECORD-ONLY | DRIFT — differently-named INSERT/SELECT, DELETE from #34, no UPDATE |
| 5 | `20260111060233_9da7a4a9-6332-427e-a5ba-46d37a758149.sql` | `short_links` table + `resolve_short_link` (the /l/:code shortener) | DO-NOT-RUN | DROPPED 2026-08-12 (TL.RETIRE.L.1) |
| 6 | `20260111060716_c36f7fc9-bad1-44bf-b135-d01bd08684a3.sql` | `resolve_short_link` v2 body | DO-NOT-RUN | DROPPED 2026-08-12 (TL.RETIRE.L.1) |
| 7 | `20260111064041_cabfdddc-c369-469b-9751-f6a00a5ab006.sql` | `page-assets` bucket + storage policies | RECORD-ONLY | DRIFT — prod 10 MB, no SVG, own-folder SELECT, INSERT only |
| 8 | `20260111070309_0e325401-e00c-4270-84ef-69a107c90d0c.sql` | `custom_theme_presets` table + 4 policies + `updated_at` trigger | RECORD-ONLY | MATCH (trigger absent; table 0 rows, UI parked) |
| 9 | `20260111074733_b56cdca3-9f26-47ca-874f-dc2fad9cf3d7.sql` | `modes.sticky_cta_enabled` | RECORD-ONLY | MATCH |
| 10 | `20260111200435_6666ac93-633a-4f1f-8b4c-5372ab0fe13d.sql` | ADV-1 `block_type` enum adds (hero_card, social_icon_row, email_subscribe, content_section, product_catalog) | RECORD-ONLY | DRIFT — `product_catalog` absent in prod |
| 11 | `20260111201729_8aa0f09b-15b4-468d-89af-9942a810d73f.sql` | ADV-4 `page_subscribers` table, indexes, owner policies, first `subscribe_to_page` | RECORD-ONLY | DRIFT — all three indexes absent (§1.3.8); RPC superseded by #31 |
| 12 | `20260111205126_e2315b1f-d4d1-49c2-ba65-bc85482c5bde.sql` | `block_items` price / currency / cta columns | RECORD-ONLY | MATCH |
| 13 | `20260111224757_2710e13d-7969-48c7-9901-5f5d22c00f9d.sql` | Canva: `canva_connections` (plaintext OAuth tokens) + policies | DO-NOT-RUN | DROPPED 2026-08-11 (TL.CANVA.RM.1) |
| 14 | `20260111225219_25f5d823-1e2d-4ae7-aa92-457655b15aa1.sql` | Canva: NOT NULL tightening + INSERT policy on `canva_connections` | DO-NOT-RUN | DROPPED 2026-08-11 (TL.CANVA.RM.1) |
| 15 | `20260111230038_d0cd2999-d909-441b-9dd3-c12cbe7578f8.sql` | Canva: `pending_canva_auth` (PKCE state) + `cleanup_expired_canva_auth()` | DO-NOT-RUN | DROPPED 2026-08-11 (TL.CANVA.RM.1) |
| 16 | `20260111233755_0c50de22-15b5-4c3a-a12b-e4e04126f403.sql` | Canva: `pending_canva_auth.redirect_origin` | DO-NOT-RUN | DROPPED 2026-08-11 (TL.CANVA.RM.1) |
| 17 | `20260328233337_8781412c-19ee-45d8-ae3a-2ce2625c842b.sql` | Canva: owner SELECT policy on `pending_canva_auth` | DO-NOT-RUN | DROPPED 2026-08-11 (TL.CANVA.RM.1) |
| 18 | `20260328233922_d99ccf5f-b378-44be-99fa-29bf5f0e5056.sql` | `"Public can subscribe to pages"` direct INSERT policy on `page_subscribers` | DO-NOT-RUN | DROPPED (by hand, date unrecorded; absent at the 2026-09-01 audit) |
| 19 | `20260407120000_add_bio_block_type.sql` | `block_type` += `bio` | RE-RUNNABLE | MATCH |
| 20 | `20260426120000_add_avatar_original_url.sql` | `pages.avatar_original_url` | RE-RUNNABLE | MATCH |
| 21 | `20260503201357_add_block_item_styling.sql` | per-item styling columns on `block_items` | RE-RUNNABLE | MATCH |
| 22 | `20260719011300_add_profile_snapshots.sql` | SNAP.1 `profile_snapshots` table, indexes, owner policies | RECORD-ONLY | DRIFT — prod indexes and policy names differ (`snapshots_*_own`, a trio until #41 dropped the INSERT one, §1.3.9) |
| 23 | `20260720010000_add_snapshot_rename_policy.sql` | SNAP.2 owner UPDATE (rename) policy on `profile_snapshots` | RECORD-ONLY | MATCH |
| 24 | `20260722110000_add_brand_kit.sql` | BRAND: `profiles.brand_json`, `fonts` bucket + policies, `get_public_brand_fonts` | RECORD-ONLY | MATCH (prod adds a 10 MB limit) |
| 25 | `20260722140000_add_public_page_plan.sql` | PRICE.TRUTH.1 `get_public_page_plan` | RE-RUNNABLE | MATCH |
| 26 | `20260722150000_add_show_badge.sql` | PROMO.TOGGLE.1 `profiles.show_badge` + 2-column `get_public_page_branding` | SUPERSEDED (by #30's 3-column RPC) | SUPERSEDED — a drop-then-run would strip `referral_code` from the badge RPC |
| 27 | `20260724120000_add_custom_short_links.sql` | SHORT.1 `custom_short_links` table, policies, `resolve_short_link_by_slug` | RECORD-ONLY | MATCH for table/RPC; INSERT policy superseded by #31; recorded `target_url` CHECK does not exist (§1.3.10) |
| 28 | `20260729120000_add_billing_columns.sql` | BILL.B1 Stripe columns on `profiles` | RE-RUNNABLE | MATCH |
| 29 | `20260729120100_add_webhook_events.sql` | BILL.B2 `stripe_webhook_events` ledger + `guard_billing_columns` trigger | RE-RUNNABLE | MATCH for the ledger; the `guard_billing_columns` body (4 columns) is SUPERSEDED by #44 (adds the `comped_until` pin) — re-running this file drops that pin, re-run #44 after |
| 30 | `20260729120200_add_referrals.sql` | BILL.B3 referral codes, `pending_grants`, `claim_referral`, 3-column `get_public_page_branding` | RE-RUNNABLE | MATCH for objects; EXECUTE grant drift (§1.3.11) |
| 31 | `20260729120300_ent_srv.sql` | ENT.SRV `plan_limit` / `plan_allows` / `current_plan`, entitlement guard, plan-gated `subscribe_to_page`, quota policies | RE-RUNNABLE | MATCH for bodies; the snapshot quota policy is the sole INSERT gate since #41 (§1.3.9 closed); comment drift (§1.3.12) |
| 32 | `20260813000000_ent_pages_quota.sql` | ENT.PAGES.1 maxPages quota on the `pages` INSERT policy | RE-RUNNABLE | MATCH |
| 33 | `20260813120000_bill_recon_tables.sql` | BILL.RECON.3 `billing_recon_runs` / `billing_recon_findings` | RE-RUNNABLE | MATCH |
| 34 | `20260816120000_stor4_products_delete_policy.sql` | TL.STOR.4 `products` bucket DELETE policy | RECORD-ONLY (file says NOT IDEMPOTENT) | MATCH |
| 35 | `20260818120000_add_events_block_type.sql` | TL.EVNT `block_type` += `events` | RE-RUNNABLE | MATCH |
| 36 | `20260818120100_add_event_timestamps.sql` | TL.EVNT `block_items.starts_at` / `ends_at` | RE-RUNNABLE | MATCH |
| 37 | `20260819120000_blocks_singleton_type.sql` | TL.BLOCK.1 `blocks_mode_type_singleton_uidx` (partial, `type <> 'text'`) | RE-RUNNABLE | MATCH — predicate equals `MANY_PER_MODE_TYPES` |
| 38 | `20260827120000_add_event_archived_at.sql` | TL.EVNT.3c `block_items.archived_at` | RE-RUNNABLE | MATCH |
| 39 | `20260901120000_profiles_update_policy_mirror.sql` | RECORD of the `profiles` UPDATE policy as of 2026-09-01 (six pinned columns) — superseded by #44, which restates it with seven | DO-NOT-RUN (a record, not a migration) | SUPERSEDED 2026-09-05 — prod `polwithcheck` now carries the seventh pin (`comped_until`, #44) |
| 40 | `20260901130000_comp_licenses.sql` | TL.COMP.1 `profiles.comped_until`, `comp_grants` ledger, `admin_grant_comp` / `admin_revoke_comp` | RE-RUNNABLE | MATCH for column/ledger/`admin_revoke_comp` — COMP-NO-GRANT holds in prod; the `admin_grant_comp` body is SUPERSEDED by #44 (adds the Stripe-customer notice), re-run #44 after |
| 41 | `20260903120000_ent_snap1_drop_stray_insert_policy.sql` | TL.ENT.SNAP.1 record of the drop of the hand-made `snapshots_insert_own` policy that OR'd past the ENT.SRV `maxSnapshots` quota | RE-RUNNABLE | MATCH — dropped in prod 2026-09-03, four policies remain |
| 42 | `20260904120000_comp4_founder_and_battery_grants.sql` | TL.COMP.4 record of the founder (`joeyc`) and battery (`joey2019pwtestbattery`) comps: sandbox Stripe mirror cleared, then `admin_grant_comp(..., 'pro', 'infinity')` on both; carries a read-only identity-assertion block | RECORD-ONLY (re-running appends duplicate `comp_grants` rows) | MATCH — 2 profiles pro/infinity, 2 ledger rows, Stripe mirror null |
| 43 | `20260904130000_handle1_reserved_and_format.sql` | TL.HANDLE.1 `pages_handle_rules` + `profiles_username_rules` CHECKs: 3–30 lowercase alnum/hyphen, no edge hyphen, and a 54-word reserved list generated from `src/lib/handle-rules.ts` (AUDIT_rev6 #5) | RE-RUNNABLE | MATCH — applied 2026-09-04; both constraints `convalidated`, definitions byte-match `handle-rules.ts` (54 words, same regex) |
| 44 | `20260905120000_comp3b_comped_until_pins.sql` | TL.COMP.3b `comped_until` pinned against client writes: 7th pin on the `profiles` UPDATE policy WITH CHECK, 5th column in `guard_billing_columns` (still SECURITY INVOKER), and `admin_grant_comp` RAISE NOTICEs when the account has a Stripe customer (AUDIT_rev6 #11). Supersedes the bodies in #29 / #39 / #40 | RE-RUNNABLE | MATCH — applied 2026-09-05; policy_pins 7, guard pins comped_until, notice present |
| 45 | `20260905130000_stor7_secgrants1.sql` | TL.STOR.7 + TL.SEC.GRANTS.1 `fonts` bucket `allowed_mime_types` locked to the nine font MIMEs generated from `src/lib/user-fonts.ts` (drift-checked by `scripts/user-fonts.test.mjs`); `generate_referral_code` / `referral_earned_in_window` EXECUTE revoked from PUBLIC/anon/authenticated and `claim_referral` from PUBLIC/anon; TRUNCATE/REFERENCES/TRIGGER revoked from anon/authenticated on every public table plus default privileges; `custom_short_links_target_url_scheme` CHECK (AUDIT_rev6 §1.1 fonts, §1.3.10, §1.3.11) | RE-RUNNABLE | MATCH — applied 2026-09-05; 9/0/0/1/3/0/128/true |

Counts: 23 MATCH (#8 missing trigger, #30 grant drift, #29/#40 superseded bodies are the caveats), 9 DRIFT, 10 DROPPED/SUPERSEDED.

## Prod-only objects (live in prod, no file behind them)

From `docs/AUDIT_rev6.md` §1.1, §1.3.4–1.3.6. If one of these is ever needed in the repo,
capture it read-only (`pg_get_functiondef`, `pg_get_expr`) into a RECORD file; never
re-type it from memory.

- **Enum / column renames (§1.3.4):** `mode_type` = `{page1, page2}` (repo says `{shop, recruit}`);
  `pages.goal_secondary_item_id` (repo: `goal_recruit_item_id`); the two `fk_goal_*` FKs from #1
  do not exist; `pages.user_id` references `auth.users(id)` (repo: `profiles(id)`); `block_type`
  gained `gallery`, `video_feed`, `text`, `carousel` with no file.
- **profiles columns (§1.3.5):** `onboarding_complete`, `username` (+ `profiles_username_unique`),
  `display_name`, `avatar_url`, `page_style`, `plan` (+ `profiles_plan_check`), `meta_pixel_id`,
  `tiktok_pixel_id`, `ga4_id`.
- **`ai_usage_events`** table + `ai_usage_events_user_fn_time` index + `"own usage read"` policy (§1.3.5).
- **Functions (§1.3.6):** `track_event` (SECURITY DEFINER, `search_path` pinned, 2 KB metadata cap,
  EXECUTE anon/authenticated/service_role); the plan-gated body of `get_public_tracking_pixels`.
- **Constraint:** `block_items_url_scheme` CHECK (§1.3.6).
- **Policy drops (§1.3.6):** `"Anyone can insert events"` on `events`; `"Public can subscribe to pages"`
  on `page_subscribers`. Both are absent in prod and both remain in files #1 / #18 — hence their headers.
- **`profile_snapshots` policies (§1.3.9):** `snapshots_select_own`, `snapshots_insert_own`,
  `snapshots_delete_own` — a hand-created trio under a different naming scheme than #22.
  `snapshots_insert_own` was dropped 2026-09-03 (#41); the SELECT/DELETE pair is still prod-only.
- **Storage (§1.1, §1.3.6–1.3.7):** narrowed own-folder SELECT policies on `avatars` / `page-assets` /
  `products`; bucket size and MIME limits (avatars 50 MB image+video, page-assets 10 MB no SVG,
  products 10 MB, fonts 10 MB — nine font MIMEs since 2026-09-05, #45); `avatars` and `page-assets` have NO UPDATE/DELETE policy.
- **Grants (§1.3.11):** CLOSED by #45 — `generate_referral_code` / `referral_earned_in_window` are no
  longer client-executable (service_role + the SECURITY DEFINER trigger only); `claim_referral` is
  authenticated + service_role only. Still prod-only: PUBLIC/anon EXECUTE on `plan_limit` / `plan_allows` /
  `current_plan`.
- **`profiles` UPDATE policy `WITH CHECK`** (seven pins since 2026-09-05) — hand-altered in place; six-pin record in #39, current seven-pin form restated by #44.

## Known drift (docs/AUDIT_rev6.md §1.3)

- **§1.3.1** `updated_at` is frozen on every content table: `update_updated_at_column()` and its five triggers never reached prod.
- **§1.3.2** Seven init-file performance indexes are absent (`idx_pages_user_id`, `idx_pages_handle`, `idx_modes_page_id`, `idx_blocks_mode_id`, `idx_block_items_block_id`, `idx_events_page_id`, `idx_events_created_at`); `events` is a seq scan.
- **§1.3.3** `get_page_owner` / `get_mode_owner` / `get_block_owner` / `handle_new_user` lost `STABLE` and `SET search_path` in prod.
- **§1.3.4** Enum and column renames with no migration (see prod-only list).
- **§1.3.5** `profiles` columns and the `ai_usage_events` table with no migration.
- **§1.3.6** Prod-only functions, the `block_items_url_scheme` CHECK, two policy drops, storage narrowing.
- **§1.3.7** Repo promises owner UPDATE/DELETE on `avatars` / `page-assets`; prod has none (orphaned avatars accumulate).
- **§1.3.8** `page_subscribers` has no unique `(page_id, email)` index; `subscribe_to_page`'s duplicate-as-success branch can never fire.
- **§1.3.9** `profile_snapshots` has two permissive INSERT policies; `snapshots_insert_own` bypasses the ENT.SRV `maxSnapshots` quota. **CLOSED 2026-09-03** — `snapshots_insert_own` dropped in prod (#41), leaving the ENT.SRV quota policy as the only INSERT gate.
- **§1.3.10** `custom_short_links.target_url` has no CHECK, contrary to TITILINKS_HANDOFF_rev3.md. **CLOSED 2026-09-05** — #45, `custom_short_links_target_url_scheme` exists (`convalidated`).
- **§1.3.11** EXECUTE grant drift on `claim_referral`, `referral_earned_in_window`, `generate_referral_code`. **CLOSED 2026-09-05** — #45 revoked the client grants (0 / 0 / 1 / 3 verified).
- **§1.3.12** `plan_limit` comment text differs between prod and #31 (numbers identical).
- **§1.3.13** `src/integrations/supabase/types.ts` lacks `comped_until`, `comp_grants`, `billing_recon_*`, `admin_grant_comp`.

## The rule for new files

**The first comment line of every new migration file names its class**, e.g.

```sql
-- RE-RUNNABLE — TL.XYZ.1 — what this does.
```

or `-- RECORD-ONLY …`, `-- SUPERSEDED …`, `-- DO-NOT-RUN …` (the last one also gets the
`⚠️ DO NOT RUN THIS FILE. ⚠️` line within the first 10 lines and an entry in the `DO_NOT_RUN`
list in `scripts/guard-invariants.mjs`). Add the file to the table above in the same change;
the `MIG-HEADERS` invariant fails if any `.sql` in this directory is missing from this README.

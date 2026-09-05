# TitiLinks — Full-Repo Audit, rev 6 (TL.AUDIT.1)

| | |
|---|---|
| **Date** | 2026-09-01 (evening, MDT) — prod queries timestamped 2026-09-02 04:40–05:30 UTC |
| **HEAD** | `52870216916b02f02e16ca5b6804f8b642ff6a18` (TL.LINK.ICONFIX) = `origin/main`, branch `main` |
| **Supabase MCP** | `https://mcp.supabase.com/mcp?project_ref=ohmvlypcbrfkuudcuqub&read_only=true&features=database,docs` — connected as `supabase_read_only_user`; `auth.users` count 3 (`3eb457d7…`, `[customer-uuid-redacted]`, `d3f1cfce…`), which matches the "prod has exactly 3 users" premise. SELECT only. |
| **Account** | none — no app login, no browser, no Playwright, no `npm test`, no `npm run dev`. The dev server on 8085 was not touched. One anonymous `GET https://www.titilinks.com/` + its CSS asset (public, read-only) to confirm §6.3. |
| **Mode** | Report-only. Outputs: this file and `audit-scratch/` (scratch scripts, build output, npm/tsc logs). No tracked file modified, no git command other than `status`/`log`/`rev-parse`. |
| **Baseline** | Battery 704 / 0 / 31 on 5287021 (not re-run; `tests/results/.last-run.json` = passed). Tonight: `npm run guard` exit 0 (19 invariants, 39 billing checks), `tsc -p tsconfig.app.json` exit 0, `vite build` exit 0. |

Redaction: no key, token or email appears below. Prod user ids are shown as 8-char prefixes except the battery id already committed in `tests/helpers/auth.ts`.

## Section 0 — Executive summary

**No P0.** No path exposes another account's private data (profiles, events, subscribers, billing, referrals are owner-only), no client path can write `plan` or any Stripe column, no secret is in the bundle, the comp functions are locked to `postgres` in prod, and the webhook verifies signatures over the raw body. The findings below are one live visual defect, four "will bite" gaps, and drift.

| # | P | finding | where | evidence (condensed — full detail in the section cited) | why it matters | fix sketch | brick |
|---|---|---|---|---|---|---|---|
| 1 | **P1** | **Brand fonts never load on the landing, login, templates, legal and dashboard-shell pages in production.** | `src/index.css:9-10` (`@import` after `@tailwind`), `tailwind.config.ts:17-18` | Build log: `[vite:css] @import must precede all other statements` ×2. Built CSS: 0 `@import`, 0 `googleapis`. **Live** `www.titilinks.com` serves `assets/index-7FfF9bAU.css` (same hash), 119,858 B, 0 `@import`, 0 `googleapis`; no font `<link>` in the HTML. Only the editor (`DesignEditor.tsx:95`, `ProfileDashboard.tsx:815`) and `PublicProfile.tsx:430` inject font links at runtime. §6.3 | Every marketing page renders Playfair Display / DM Sans as Georgia / system-ui. The site does not look like its design. | Move the two `@import`s above `@tailwind base`, or add `<link rel=preconnect>` + `<link rel=stylesheet>` to `index.html` and delete them; add a guard that the built CSS (or index.html) references `fonts.googleapis.com`. | **TL.FONT.1** · S · no gate |
| 2 | **P1** | **The `maxSnapshots` server floor is a no-op: a second, quota-free INSERT policy exists.** | `profile_snapshots.snapshots_insert_own` | `pg_policies`: `"Users can create their own snapshots"` INSERT WITH CHECK (… `< plan_limit(current_plan(),'maxSnapshots')`) **and** `snapshots_insert_own` INSERT WITH CHECK `(auth.uid() = user_id)`. Permissive policies OR together. `snapshots_*_own` appear in no migration. §1.3.9 | A free account can create unlimited manual restore points with a direct PostgREST insert; ENT.SRV's "server stops being optional" promise does not hold for this quota. | `drop policy snapshots_insert_own on public.profile_snapshots;` after confirming the remaining policy admits `kind = 'auto'` (it does: `kind <> 'manual' OR …`). Verify with a dry insert as the battery. | **TL.ENT.SNAP.1** · S · [GATED] SQL |
| 3 | **P1** | **A comped account with any Stripe history is downgraded by the next subscription event; both paid prod accounts are hand-granted with no ledger row; joeyc carries a sandbox-era mirror.** | `supabase/functions/stripe-webhook/index.ts:166`, `_shared/plan-lifecycle.ts:125-140`, `reconcile-billing/index.ts:156-180,229`, `profiles` rows | `subscriptionPatch(sub, {revoked})` writes `plan:'free'` with no `comped_until` read; reconciler excludes only `stripe_customer_id is null`. Prod: joeyc `plan=pro, subscription_status=active, period_end=2027-07-30, stripe_customer_id=null, comped_until=null`; battery `plan=pro`, no status; `comp_grants` 0 rows; recon runs `subscriptions_seen: 0` twice. §3.3–3.4 | The first "your card failed, here's a free year" comp gets silently revoked by Stripe's `subscription.deleted`. Today's paid accounts are exactly the untracked state TL.COMP.1 was built to end, and `admin_revoke_comp` would mis-derive joeyc's plan from a ghost `active`. | (a) webhook + reconciler skip the `plan` write when `comped_until` is non-null and unexpired; `admin_grant_comp` warns on Stripe history; pin `comped_until` in policy + `guard_billing_columns`. (b) Null joeyc's three mirror columns as postgres, then `admin_grant_comp('joeyc',…)` and `('joey2019pwtestbattery',…)`. | **TL.COMP.3** · M · [GATED] deploy + SQL; **TL.COMP.4** · S · [GATED] SQL |
| 4 | **P1** | **Nine migration files would resurrect dropped objects or reopen closed write paths if pasted again, and none carries a DO-NOT-RUN header.** | `20260328233922` (page_subscribers public INSERT), `20260111040649` stanza `"Anyone can insert events"`, `20260111060233`/`060716` (short_links), five Canva files | §1.2 table: prod has no INSERT policy on `page_subscribers` or `events`; `short_links`, `canva_connections`, `pending_canva_auth` are dropped. Only `20260901120000` is annotated. | The COMP.1b class: a well-meant "re-run the January file to restore updated_at" reopens anonymous inserts into `events` and `page_subscribers` and revives a plaintext-token table. | Add the same DO-NOT-RUN header to the nine; add `supabase/migrations/README.md` classifying every file (record / re-runnable / superseded) and listing prod-only objects (`track_event`, `get_public_tracking_pixels` body, `block_items_url_scheme`, `ai_usage_events`, profiles columns, enum renames). | **TL.MIG.1** · S · no gate |
| 5 | **P1** | **Handle squatting: nothing stops a signup from taking `admin`, `support`, `titilinks`, `login`, `billing`…** | `src/pages/OnboardingFlow.tsx:112-120`, `src/components/onboarding/StepYourProfile.tsx:88-99,275`; no CHECK on `pages.handle` | Uniqueness is checked against `profiles.username` and `pages.handle` only. `RESERVED_SLUGS`/`isReservedSlug` are imported solely by `ShortLinks.tsx`; `handleSchema`/`sanitizeHandle` in validation.ts have 0 importers. `pg_constraint` on `pages`: pkey, handle UNIQUE, user_id FK — no CHECK. §2.7 | Route paths win for `/login` etc., but `@support` / `@titilinks` pages are claimable and read as official; there is no server floor on handle format at all. | Client: run `validateSlug`-style reserved check + format on the handle field (reuse `RESERVED_SLUGS` + brand words). Server: `alter table pages add constraint pages_handle_format check (handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' and handle not in (…))`; same for `profiles.username`. | **TL.HANDLE.1** · S/M · [GATED] SQL |
| 6 | P2 | **Disabled blocks and their items are world-readable.** | `blocks."Public can view enabled blocks"` = `USING (true)`; `block_items."Public can view block items"` = `true` | Prod: 6 disabled blocks, 5 items inside (mecivietnam's seeded `example.com` CTA and products). `PublicProfile.tsx:290` filters `is_enabled` client-side only. §2.2 | Drafts, hidden links and seed placeholders are one anon REST call away; the policy name promises "enabled" and the expression does not. | Split: anon policy `USING (is_enabled)`; items policy joins to enabled blocks; owner policy `get_mode_owner(mode_id) = auth.uid()`. Re-run the gallery discovery specs. | **TL.RLS.BLOCKS.1** · M · [GATED] SQL + battery |
| 7 | P2 | **`updated_at` is frozen on 5 tables; 7 declared indexes and the `page_subscribers` UNIQUE never existed; the four RLS helper functions lost `STABLE` + `search_path`.** | init migration vs prod | 88/88 rows `updated_at = created_at`; `pg_indexes` lacks `idx_events_page_id`, `idx_events_created_at`, `idx_block_items_block_id`, … and `idx_page_subscribers_unique_email`; `pg_get_functiondef(get_page_owner)` has no `STABLE`/`SET search_path`. §1.3.1–1.3.3, 1.3.8 | `subscribe_to_page`'s dedupe branch can never fire (duplicate subscriptions); `events` is a seq scan that grows on every view; any "last edited" feature would be wrong; helper functions re-evaluate per row. | One additive SQL paste: create the indexes, `update_updated_at_column()` + 5 triggers, `create or replace` the 3 helpers with `STABLE SET search_path = public`, `handle_new_user` with `SET search_path`. Verification SELECT at the end. | **TL.MIG.2** · M · [GATED] SQL |
| 8 | P2 | **~215 MB / 248 objects in 32 storage folders belong to deleted users; avatars and page-assets have no DELETE policy, so live accounts leak a file per re-upload.** | `storage.objects`, `storage.objects` policies | Query in §2.4: avatars 27 orphan folders / 225 objects / 193 MB; products 3 / 18 / 19 MB; page-assets 2 / 5 / 2.6 MB. joeyc: 26 avatar objects, 3 referenced, 23 unreferenced (5.6 MB). No DELETE/UPDATE policy on `avatars` or `page-assets`. | Storage quota and cost; the leak is structural, not a one-off. | Service-role sweep of folders not in `auth.users`; add owner DELETE policies for avatars/page-assets (the products one is the template); call `removePublicObject` on avatar replace. | **TL.STOR.6** · M · [GATED] script + SQL |
| 9 | P2 | **The `fonts` bucket accepts any file type into a public bucket.** | `storage.buckets.fonts.allowed_mime_types = null` | `select id, allowed_mime_types from storage.buckets` → fonts `null`; policy checks folder ownership only. §2.4.2 | Any authenticated user can host arbitrary public files (HTML, SVG, binaries) on the project's storage domain. | Set `allowed_mime_types` to the font types `validateFontFile` accepts (include `application/octet-stream` if browsers report `.ttf` that way). | **TL.STOR.7** · S · [GATED] SQL |
| 10 | P2 | **Three edge functions are callable with the public anon key and no quota; the AI functions are not plan-gated.** | `unfurl/index.ts`, `youtube-feed/index.ts`, `qr/index.ts` (+ `config.toml` `verify_jwt=false`), `generate-bio/index.ts` | No `getAuthedUser` in the first three; `Access-Control-Allow-Origin: *`; `youtube-feed` spends `YOUTUBE_API_KEY` per call (15-min cache per instance only); `generate-bio` checks auth + 40/day but `ENTITLEMENTS.free.aiBio = false`. §2.5 | An SSRF-guarded fetch proxy and a YouTube-quota sink are open to anyone with the (public) anon key; a free user can call a Pro AI feature directly. | `getAuthedUser` + `ai_usage_events`-style daily quota on unfurl and youtube-feed; `plan_allows`-equivalent check in generate-bio (read `profiles.plan` with the service client); leave `qr` public but add a per-IP cap or drop it if unused. | **TL.EDGE.1** · M · [GATED] deploy |
| 11 | P2 | **Billing plumbing gaps:** `comped_until` is client-writable; the reconciler has no scheduler; `stripe-webhook`'s `--no-verify-jwt` is not recorded in `config.toml`. | profiles UPDATE policy + triggers; `pg_extension` (no pg_cron); `supabase/config.toml` | Policy pins 6 columns, `guard_billing_columns` 4, neither `comped_until`; `billing_recon_runs` 2 rows ever (Aug 13, Aug 16); config.toml has `verify_jwt=false` for `qr` only. §3.6 | A user can self-mark as comped (ledger integrity only, no entitlement); the backstop never runs; a default deploy would 401 every Stripe event. | Fold the pin into TL.COMP.3; add the config stanza; schedule the reconciler (Vercel cron with the secret) after TL.COMP.3 so it stops flagging comps. | **TL.COMP.3** (pin) · **TL.DEPLOY.1** · S · none · **TL.BILL.RECON.4** · S · [GATED] |
| 12 | P2 | **Analytics data is half duplicate, stores raw user agents, has no geo/language/uniques and no index.** | `events` table, `useEventTracking.ts:120-129`, `useAnalytics.ts:93-98` | 1,206 `page_view` + 1,206 `mode_routed` (`routing_reason` always `'default'`) + 16 clicks; `referrer_domain` null on 1,121; 81 localhost + 2 HeadlessChrome rows; primary key is the only index; client pulls `select *` for 30 days. §7 | The only thing analytics can honestly show today is views and clicks; the "third language" question cannot be answered from this data. | ANLX.1: stop `mode_routed`, add `lang`/`device`, drop raw UA, skip localhost, two indexes. ANLX.2: country via a Vercel `api/track`. ANLX.3: plan-aware `get_page_analytics` RPC + rollups + charts. ANLX.4: one-time cleanup. | **TL.ANLX.1–4** · M/M/L/S · [GATED] SQL, Vercel |
| 13 | P2 | **One 3.4 MB JS chunk (940 KB gzip) serves every route, including `@vladmandic/face-api` on the public page.** | `vite build` output; `EditableProfileView.tsx:2` | Exactly one `assets/index-*.js`; no `React.lazy`; face-api statically imported for the AI-crop detector. §6.3 | Every visitor to a creator's page downloads the editor and a face-detection library. | Route-level `React.lazy` for dashboard/editor/onboarding/templates; `await import('@vladmandic/face-api')` inside the crop path; build guard on chunk count. | **TL.BUNDLE.1** · M · none |
| 14 | P2 | **Documented-but-absent floors:** `custom_short_links_target_url_scheme` CHECK does not exist (HANDOFF_rev3 says it does); referral function grants are wider than their migration. | `pg_constraint`; `aclexplode(proacl)` | Constraint search for `%target_url%` → none; `referral_earned_in_window` EXECUTE PUBLIC/anon/authenticated (file: service_role only); `claim_referral` anon (file: authenticated). §1.3.10–1.3.11 | Scheme enforcement on short links is client-side only (`safeHref` holds today); a visitor can read any profile's granted-referral count; the handoff misstates prod. | Add the CHECK (`target_url ~* '^https?://'`); revoke the two functions from PUBLIC/anon/authenticated (+ TRUNCATE/REFERENCES/TRIGGER from anon/authenticated on all tables); correct rev3. | **TL.SEC.GRANTS.1** · S · [GATED] SQL |
| 15 | P2 | **Dependencies and design tokens:** `npm audit` 2 high / 3 moderate / 1 low; vite 5→8 and react-router 6→7 majors; caniuse data 15 months old; 6 of 22 templates fail WCAG contrast. | `package.json`, `scripts/contrast-audit.mjs` | §6.1–6.4: browserslist + postcss-selector-parser fixable non-breaking; vite/esbuild need the major; Neon Nights / Energy Boost / Conversion King / Insta Aesthetic label↔surface 1.0–2.8; Midnight Fade / Waterfall button↔bg 1.1–2.3. | Dev-server CVEs are not prod-exposed but accumulate; four shipped templates have invisible button labels. | `npm audit fix` + `npx update-browserslist-db@latest` now; vite 8 + router 7 as one tooling brick; fix the six template palettes (or add `contrast-audit` to guard once green). | **TL.DEP.1** · S; **TL.DEP.2** · L; **TL.TPL.CONTRAST.1** · S |

**P3 (detail in sections):** 19 dead component files, 1,967 lines (13 unmounted landing sections, LivePreviewPanel, WelcomeCoach, ThemePreview, NavLink, BrandLogo, GoalsPanel) and 112 unused named exports incl. the entire `validation.ts` zod layer (§5.2); `recharts` and `components/ui/chart.tsx` unused (§5.4); 14 type errors in `tests/` incl. a no-op `test.use({ reducedMotion })` in three glide specs (§4.3–4.4); 61 fixed waits in 21 specs (§4.3); spec 02's 6 skips are the only avoidable ones (§4.1); five duplicate i18n label families with divergent Spanish (§5.1); four control-height idioms and a 82:121 `border-border`:`border-white/10` split across editors (§5.1); DesignEditor's Reset sits below the Cancel/Save row, against the "commit row last" rule (§5.1); `types.ts` lacks the comp/recon objects (§1.3.13); `custom_theme_presets` is a live table behind `{false && …}` (§1.2 #8); Lemon8/Whop have no platform icon (§6.5); `RESEND_API_KEY` sits in the frontend `.env` (§2.6); `mode_type`/`goal_secondary_item_id`/`product_catalog` enum-and-column renames have no migration (§1.3.4); `supabase_migrations.schema_migrations` is empty (§1.0).

**Counts:** P0 0 · P1 5 · P2 10 · P3 15 (listed above) — 30 findings, plus the clean bills recorded per section.


## Section 1 — Repo-vs-prod drift (every file in `supabase/migrations`)

### 1.0 Method

Every prod fact below comes from a read-only query run through the Supabase MCP (`supabase_read_only_user`, project `ohmvlypcbrfkuudcuqub`). The repo side is the 40 files under `supabase/migrations/`, read in full. The comparison covers tables, columns, defaults, indexes, RLS flags, every policy expression (`pg_get_expr` on `polqual`/`polwithcheck`), every function body and security context (`pg_get_functiondef`, `prosecdef`, `proconfig`), EXECUTE grants (`aclexplode(proacl)` — `information_schema.routine_privileges` is filtered for the read-only role and under-reports), triggers (`pg_trigger`), storage buckets and storage policies.

Queries used (all SELECT):

```sql
-- policies with real expressions
select schemaname, tablename, policyname, permissive, roles::text, cmd,
       pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid)
from pg_policies p join pg_policy pol on pol.polname = p.policyname
join pg_class c on c.oid = pol.polrelid and c.relname = p.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
where schemaname in ('public','storage');
-- functions
select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.proconfig,
       pg_get_userbyid(p.proowner), l.lanname, p.provolatile, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
where n.nspname='public';
-- real EXECUTE grants
select p.proname, coalesce(a.grantee::regrole::text,'PUBLIC'), a.privilege_type
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
where n.nspname='public';
-- triggers, indexes, columns, constraints, buckets
select c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) from pg_trigger t
join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage','auth') and not t.tgisinternal;
select tablename, indexname, indexdef from pg_indexes where schemaname='public';
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public';
select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint
where connamespace='public'::regnamespace;
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
```

Migration history: `list_migrations` returned `[]` — `supabase_migrations.schema_migrations` is empty. The CLI has never applied anything to prod; every object was pasted by hand. That is consistent with CLAUDE.md, but it means the migration directory is documentation, not a ledger, and nothing checks it against prod. (The drift table below is the proof.)

### 1.1 Prod inventory (what actually exists)

**Public tables (16, RLS enabled on all, forced on none):** ai_usage_events, billing_recon_findings, billing_recon_runs, block_items, blocks, comp_grants, custom_short_links, custom_theme_presets, events, modes, page_subscribers, pages, pending_grants, profile_snapshots, profiles, stripe_webhook_events.

**Enums:** `block_type` = {primary_cta, links, social_links, product_cards, featured_media, hero_card, social_icon_row, email_subscribe, content_section, gallery, bio, video_feed, text, carousel, events}; `event_type` = {page_view, outbound_click, mode_routed}; `mode_type` = {page1, page2}.

**Functions (23):** admin_grant_comp, admin_revoke_comp, claim_referral, current_plan, generate_referral_code, get_block_owner, get_mode_owner, get_page_owner, get_public_brand_fonts, get_public_page_branding, get_public_page_plan, get_public_tracking_pixels, guard_billing_columns, guard_entitlement_columns, guard_referred_by, handle_new_user, plan_allows, plan_limit, referral_earned_in_window, resolve_short_link_by_slug, set_referral_code, subscribe_to_page, track_event. All owned by `postgres`.

**Triggers (public + auth):** `on_auth_user_created` (auth.users → handle_new_user), `trg_guard_billing_columns`, `trg_guard_entitlement_columns`, `trg_guard_referred_by` (BEFORE UPDATE on profiles), `trg_set_referral_code` (BEFORE INSERT on profiles). **No `update_*_updated_at` trigger exists on any table.**

**Indexes beyond primary keys:** ai_usage_events_user_fn_time; idx_recon_findings_run; blocks_mode_type_singleton_uidx (partial, `type <> 'text'`); idx_comp_grants_user_created; custom_short_links_slug_key, idx_custom_short_links_user_id; pages_handle_key; idx_pending_grants_due (partial), idx_pending_grants_referrer, pending_grants_one_per_referred; profile_snapshots_page_idx; idx_profiles_referred_by, idx_profiles_stripe_customer_id, profiles_referral_code_key, profiles_stripe_customer_id_key, profiles_username_unique; idx_stripe_webhook_events_received_at. **`events`, `block_items`, `modes`, `page_subscribers`, `custom_theme_presets` carry only their primary key.**

**Storage buckets (all 4 `public = true`):**

| bucket | size limit | allowed MIME | policies live in prod |
|---|---|---|---|
| avatars | 50 MB | image/jpeg, png, gif, webp, video/mp4, webm, quicktime | INSERT own folder; SELECT own folder. **No UPDATE, no DELETE.** |
| page-assets | 10 MB | image/jpeg, png, gif, webp | INSERT own; SELECT own. **No UPDATE, no DELETE.** |
| products | 10 MB | image/jpeg, png, gif, webp | INSERT own; SELECT own; DELETE own (STOR.4). No UPDATE. |
| fonts | 10 MB | **null (any type)** | SELECT bucket-wide; INSERT/UPDATE/DELETE own (`to authenticated`). |

### 1.2 File-by-file verdict

Legend — **MATCH**: prod holds what the file says. **DRIFT**: prod differs. **DROPPED**: the object was deliberately removed from prod later. **Re-run** answers the COMP.1b question: if this exact file were pasted into the SQL editor today, would anything change or weaken?

| # | File | Prod status | Re-run today would… | DO-NOT-RUN header? |
|---|---|---|---|---|
| 1 | 20260111040649 (schema init) | DRIFT (§1.3.1–1.3.5, 1.3.8) | Fail at the first `CREATE TYPE` (exists). Run stanza-by-stanza it would: **REOPEN** anonymous `events` INSERT (`"Anyone can insert events" WITH CHECK (true)`, dropped Aug 13); recreate `update_updated_at_column` + 5 triggers (**fixes** frozen `updated_at`); redefine `get_*_owner` with `STABLE` + `search_path` (**improves**); `handle_new_user` with `search_path` (**improves**); `CREATE POLICY "Users can update their own profile"` fails (exists) — but a drop-and-recreate would lose all six column pins. | No |
| 2 | 20260111040817 (updated_at fn search_path) | DRIFT — function absent in prod | Create the function; harmless alone (no triggers reference it) | No |
| 3 | 20260111042037 (avatars bucket) | DRIFT — repo declares bucket-wide SELECT + UPDATE + DELETE; prod has own-folder SELECT and INSERT only, plus a 50 MB / image+video MIME limit the repo never mentions | Bucket INSERT fails (exists); creates 4 policies alongside prod's 2 → **adds** owner UPDATE/DELETE (the missing capability) | No |
| 4 | 20260111043832 (products bucket) | DRIFT — prod has differently-named INSERT/SELECT + the STOR.4 DELETE; repo's UPDATE policy absent | Adds a duplicate INSERT/SELECT pair and an UPDATE policy | No |
| 5 | 20260111060233 (`short_links` + `resolve_short_link`) | DROPPED Aug 12 (TL.RETIRE.L.1) | **RESURRECTS** the dead table and a SECURITY DEFINER function that inserts `events` rows with `mode = 'shop'` (not a valid `mode_type` value any more) | **No** |
| 6 | 20260111060716 (resolve_short_link v2) | DROPPED | Same resurrection | **No** |
| 7 | 20260111064041 (page-assets bucket) | DRIFT — repo: 5 MB, allows `image/svg+xml`, bucket-wide SELECT, own UPDATE/DELETE `to authenticated`. Prod: 10 MB, **no SVG**, own-folder SELECT, INSERT only | Bucket INSERT fails; adds UPDATE/DELETE (missing capability) + a bucket-wide SELECT (moot, bucket is public) | No |
| 8 | 20260111070309 (custom_theme_presets) | MATCH (table + 4 policies) except the `updated_at` trigger (function absent). Table has 0 rows; the UI that uses it is parked behind `{false && …}` (DesignEditor.tsx:39) | Trigger creation fails (function missing) | No |
| 9 | 20260111074733 (modes.sticky_cta_enabled) | MATCH | No-op / column exists error | No |
| 10 | 20260111200435 (enum adds) | DRIFT — `hero_card`, `social_icon_row`, `email_subscribe`, `content_section` present; **`product_catalog` absent in prod** (yet `ITEM_CAPS.product_catalog: 24` survives in src/lib/validation.ts) | Adds `product_catalog` to the enum (harmless, dead value) | No |
| 11 | 20260111201729 (page_subscribers) | DRIFT — table + owner SELECT/DELETE match; **indexes `idx_page_subscribers_page_id`, `idx_page_subscribers_email` and UNIQUE `idx_page_subscribers_unique_email (page_id, email)` are absent** | Creates the three indexes (**fixes** the dead dedupe path); `subscribe_to_page` stanza is superseded by #27 | No |
| 12 | 20260111205126 (price/currency/cta) | MATCH | No-op | No |
| 13–17 | 20260111224757, 225219, 230038, 233755, 20260328233337 (Canva OAuth tables) | DROPPED (Aug 11) | **RESURRECT** `canva_connections` (plaintext `access_token`/`refresh_token` columns) and `pending_canva_auth` | **No** |
| 18 | 20260328233922 (`"Public can subscribe to pages"` INSERT policy) | DROPPED — prod has no INSERT policy on page_subscribers; writes go only through `subscribe_to_page` | **REOPENS** direct anonymous INSERT into `page_subscribers`, bypassing the email regex and the ENT.SRV plan gate | **No** |
| 19 | 20260407120000 (bio enum) | MATCH | No-op | No |
| 20 | 20260426120000 (avatar_original_url) | MATCH | No-op | No |
| 21 | 20260503201357 (item styling cols) | MATCH | No-op | No |
| 22 | 20260719011300 (profile_snapshots) | DRIFT — table matches; **indexes differ** (repo `_page_created_idx` + `_page_kind_idx`; prod has `profile_snapshots_page_idx` only); **policies differ**: prod holds `snapshots_select_own`, `snapshots_insert_own`, `snapshots_delete_own` (names in no migration) plus the ENT.SRV quota policy and the SNAP.2 rename policy | `CREATE POLICY "Users can create their own snapshots"` fails (exists); the other two create as duplicates; indexes create | No |
| 23 | 20260720010000 (snapshot rename policy) | MATCH | Fails (exists) | No |
| 24 | 20260722110000 (brand kit, fonts bucket, get_public_brand_fonts) | MATCH (prod fonts bucket additionally has a 10 MB limit) | Column/bucket no-op; policies fail (exist) | No |
| 25 | 20260722140000 (get_public_page_plan) | MATCH | No-op | No |
| 26 | 20260722150000 (show_badge + 2-column get_public_page_branding) | SUPERSEDED — prod holds the 3-column version from #28 | `add column show_badge` fails (no IF NOT EXISTS); `create or replace` fails 42P13 (return type). Safe by failure — but a drop-then-run would strip `referral_code` from the badge RPC | No |
| 27 | 20260724120000 (custom_short_links) | MATCH for table/RPC; INSERT policy superseded by #29. **The `custom_short_links_target_url_scheme` CHECK that TITILINKS_HANDOFF_rev3.md records as live does not exist** (pg_constraint search for `%target_url%` returns only `block_items_url_scheme`) | Table create fails; policies fail (exist) | No |
| 28 | 20260729120000 (billing columns) | MATCH | No-op (guarded with IF NOT EXISTS) | No |
| 29 | 20260729120100 (webhook ledger + guard_billing_columns) | MATCH — prod function is SECURITY INVOKER with the identical body | Safe (create or replace, drop/create trigger) | No |
| 30 | 20260729120200 (referrals) | MATCH for objects. **Grant drift:** `claim_referral` also has EXECUTE for `anon` and `service_role` (file: authenticated only); `referral_earned_in_window` has EXECUTE for PUBLIC/anon/authenticated (file: service_role only); `generate_referral_code` PUBLIC-executable (file never revoked it) | Safe (idempotent forms); the `revoke … from public` would not fix the anon grant on claim_referral | No |
| 31 | 20260729120300 (ENT.SRV) | MATCH for bodies (both guards INVOKER; plan_limit/plan_allows/current_plan identical apart from a comment). Grants: prod also has PUBLIC/anon EXECUTE on plan_limit/plan_allows/current_plan (harmless — `current_plan()` is null for anon). **The quota INSERT policy on profile_snapshots is live but bypassed by `snapshots_insert_own` (§1.3.9)** | Safe | No |
| 32 | 20260813000000 (pages quota) | MATCH — WITH CHECK identical | `alter policy` re-applies identically | No |
| 33 | 20260813120000 (recon tables) | MATCH (RLS on, zero policies) | No-op | No |
| 34 | 20260816120000 (products DELETE policy) | MATCH | Fails "already exists" (documented in-file) | Partial (says NOT IDEMPOTENT) |
| 35 | 20260818120000 (events enum) | MATCH | No-op | No |
| 36 | 20260818120100 (starts_at/ends_at) | MATCH | No-op | No |
| 37 | 20260819120000 (singleton index) | MATCH — predicate `WHERE type <> 'text'` equals `MANY_PER_MODE_TYPES = {text}` in src/lib/default-blocks.ts:64 | No-op | No |
| 38 | 20260827120000 (archived_at) | MATCH | No-op | No |
| 39 | 20260901120000 (profiles UPDATE policy record) | MATCH — the `pg_get_expr(polwithcheck)` captured tonight is byte-identical to the expression quoted in the file (six `IS DISTINCT FROM` pins, no show_badge clause) | Fails on duplicate policy name, as the file itself says | **Yes** |
| 40 | 20260901130000 (comp licenses) | MATCH — column, ledger table (RLS on, 0 policies), both functions SECURITY DEFINER owned by postgres, `proacl` = postgres only for both (COMP-NO-GRANT holds in prod) | Safe (idempotent forms) | No |

Counts (40 files): 22 MATCH (two with caveats — #8 missing trigger, #30 grant drift), 9 DRIFT, 9 DROPPED/SUPERSEDED. Nine files (#1 stanza, #5, #6, #13–17, #18) would re-create deliberately removed objects or reopen closed write paths if pasted again, and **only #39 carries a DO-NOT-RUN header**.

### 1.3 The mismatches, with evidence

**1.3.1 `updated_at` is frozen on every content table (live defect).** The init migration creates `update_updated_at_column()` and BEFORE UPDATE triggers on profiles, pages, modes, blocks, block_items. Prod has neither the function (absent from the 23-function list) nor any such trigger. Effect:

```sql
select 'profiles', count(*) filter (where updated_at = created_at), count(*) from public.profiles
union all select 'pages', … union all select 'blocks', … union all select 'block_items', … union all select 'modes', …;
-- profiles 3/3 · pages 3/3 · blocks 28/28 · block_items 51/51 · modes 3/3
```

Every row's `updated_at` equals its `created_at`, including the joeyc profile whose plan, badge and theme have all been edited since Jul 18. Nothing in `src/` reads `updated_at` today (grep: one comment in snapshots.ts), so no UI is wrong yet — but any future "last edited", cache-busting, or analytics feature built on it would be silently wrong from day one.

**1.3.2 Seven performance indexes from the init migration never made it.** `idx_pages_user_id`, `idx_pages_handle`, `idx_modes_page_id`, `idx_blocks_mode_id`, `idx_block_items_block_id`, `idx_events_page_id`, `idx_events_created_at` are all absent. `pages.handle` is covered by its UNIQUE constraint, the rest are not. `events` (2,428 rows, 2.4 MB) is read by `useAnalytics` as `where page_id = ? and created_at >= ?` with only a primary key — a sequential scan today, and the table grows on every public page view.

**1.3.3 SECURITY DEFINER helpers lost their `search_path` and `STABLE`.** Repo (init migration lines 100–135):

```sql
CREATE OR REPLACE FUNCTION public.get_page_owner(page_id UUID) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ … $$;
```

Prod (`pg_get_functiondef`):

```sql
CREATE OR REPLACE FUNCTION public.get_page_owner(page_id uuid) RETURNS uuid
 LANGUAGE sql SECURITY DEFINER
AS $function$ SELECT user_id FROM public.pages WHERE id = page_id; $function$
```

Same for `get_mode_owner`, `get_block_owner` (both VOLATILE, no search_path) and `handle_new_user` (`proconfig = null`). Exploitability is low — `has_schema_privilege('anon'|'authenticated', 'public', 'CREATE')` is **false**, so no API role can plant a shadowing object — but the three `get_*_owner` helpers are what every RLS policy on modes/blocks/block_items/events/page_subscribers calls per row, and VOLATILE prevents the planner from caching them.

**1.3.4 Enum and column renames with no migration.** `mode_type` is `{page1, page2}` in prod, `{shop, recruit}` in the repo. `pages.goal_recruit_item_id` (repo) is `goal_secondary_item_id` (prod). The two `fk_goal_*` foreign keys from the init file do not exist in prod (pg_constraint lists no FK on either goal column). `pages.user_id` references `auth.users(id)` in prod, `profiles(id)` in the repo. `block_type` gained `gallery`, `video_feed`, `text`, `carousel` with no file, and never gained `product_catalog` despite migration #10.

**1.3.5 Profiles columns with no migration.** `onboarding_complete`, `username` (+ `profiles_username_unique`), `display_name`, `avatar_url`, `page_style`, `plan` (+ `profiles_plan_check`), `meta_pixel_id`, `tiktok_pixel_id`, `ga4_id` exist in prod with no file. Same for the whole `ai_usage_events` table (+ index + `"own usage read"` policy).

**1.3.6 Prod-only functions with no mirror.** `track_event` (SECURITY DEFINER, search_path pinned, 2 KB metadata cap, EXECUTE anon/authenticated/service_role) and the plan-gated `get_public_tracking_pixels` body exist only in prod; the ENT.SRV file explicitly says the pixels body "does NOT exist anywhere in this repo". Also prod-only: the `block_items_url_scheme` CHECK; the drop of `"Anyone can insert events"`; the drop of `"Public can subscribe to pages"`; the narrowed storage SELECT policies; the bucket size/MIME limits.

**1.3.7 Storage policies: repo promises deletes the app cannot do.** Migrations #3 and #7 declare owner UPDATE and DELETE policies for avatars and page-assets. Prod has none (the policy list for `storage.objects` shows DELETE only for `fonts` and `products`). STOR.4's file records this as intentional ("avatars and page-assets intentionally have NO delete policy … nothing deletes from either bucket yet"). Consequence in data (§2.4): every avatar re-upload leaves the previous object behind forever.

**1.3.8 `page_subscribers` has no unique index.** Repo #11: `CREATE UNIQUE INDEX idx_page_subscribers_unique_email ON page_subscribers(page_id, email)`. Prod `pg_indexes` for the table: `page_subscribers_pkey` only. `subscribe_to_page` (prod body) relies on `unique_violation` to turn a repeat subscription into a silent success — that branch can never fire, so the same address can be inserted any number of times. Table is empty today (0 rows).

**1.3.9 `profile_snapshots` has TWO permissive INSERT policies, and one has no quota.** Prod:

```
Users can create their own snapshots   INSERT  WITH CHECK ((auth.uid() = user_id) AND ((kind <> 'manual') OR ((SELECT count(*) … kind = 'manual') < plan_limit(current_plan(), 'maxSnapshots'))))
snapshots_insert_own                   INSERT  WITH CHECK (auth.uid() = user_id)
```

Permissive policies are OR-ed. Any owner insert satisfies `snapshots_insert_own`, so the ENT.SRV quota policy is never the deciding vote. The server floor for `maxSnapshots` (free 1 / pro 5 / business 20) does not exist; only the client check in `src/lib/snapshots.ts:202-217` (`captureSnapshot`) enforces it, and a direct PostgREST insert skips that. The `snapshots_*_own` trio appears in no migration file — it was created by hand under a different naming scheme than SNAP.1's mirror, and ENT.SRV's `drop policy if exists "Users can create their own snapshots"` could not see it.

**1.3.10 `custom_short_links.target_url` has no CHECK.** TITILINKS_HANDOFF_rev3.md ("Prod DB changes [session-verified Aug 12]") lists `custom_short_links_target_url_scheme` as live. Tonight's `pg_constraint` search for any definition containing `target_url` returns nothing in `public`; the table's only CHECK is the slug regex. The `/s/:slug` sink is protected by `safeHref` in `src/pages/SlugRedirect.tsx:38` and the dashboard anchor by `safeHref` in ShortLinks.tsx:314, so there is no XSS today — but the server floor the handoff documents is missing, and the document is wrong.

**1.3.11 Grant drift on referral functions.** Migration #30 intends `claim_referral` for `authenticated` only and `referral_earned_in_window` for `service_role` only. Prod `aclexplode(proacl)`:

```
claim_referral              anon, authenticated, postgres, service_role
referral_earned_in_window   PUBLIC, anon, authenticated, postgres, service_role
generate_referral_code      PUBLIC, anon, authenticated, postgres, service_role
```

`claim_referral` as anon returns false immediately (`auth.uid() is null`), so that one is harmless. `referral_earned_in_window(uuid)` lets any visitor learn how many referral months a given profile id earned in the last 365 days (profile ids are public via `pages.user_id`). Low value to an attacker, but it is a leak the file says should not exist.

**1.3.12 `plan_limit` comment drift.** Prod body still says `maxPages — enforcement deferred (see the report)`; the repo file was updated to "enforced since Aug 13". Numbers identical. Cosmetic, but `scripts/billing.test.mjs` parses the REPO file, so the test cannot notice a prod body change — it checks repo-vs-TypeScript, not prod-vs-anything.

**1.3.13 `types.ts` is behind prod.** `src/integrations/supabase/types.ts` contains 0 references to `comped_until`, `comp_grants`, `billing_recon_runs`, `billing_recon_findings`, `admin_grant_comp`. Nothing in the client needs them yet, so tsc is clean; the next feature that touches them will regenerate or hand-edit.

### 1.4 What is CLEAN in this area

- All 16 public tables have RLS enabled (none forced, which is fine — owner bypass is only the `postgres` role).
- `guard_billing_columns` and `guard_entitlement_columns` are SECURITY INVOKER in prod with bodies identical to the repo; both triggers are attached and enabled (`tgenabled = 'O'`).
- `admin_grant_comp` / `admin_revoke_comp`: SECURITY DEFINER, owner postgres, `search_path = public`, `proacl` = postgres only. The COMP-NO-GRANT invariant is true in prod, not just in the repo.
- `blocks_mode_type_singleton_uidx` matches `MANY_PER_MODE_TYPES`.
- The profiles UPDATE policy matches the 20260901120000 record exactly.
- `subscribe_to_page`, `plan_limit`, `plan_allows`, `current_plan`, `get_public_page_branding` (3-col), `get_public_page_plan`, `get_public_brand_fonts`, `resolve_short_link_by_slug` bodies match their files.
- `pending_grants`, `stripe_webhook_events`, `billing_recon_*`, `comp_grants`: RLS on, zero policies → deny-all for anon/authenticated as designed.


## Section 2 — Security

### 2.1 Table grants (what the API roles are allowed to attempt)

`aclexplode(relacl)` on every public table: **anon, authenticated, service_role and postgres each hold `DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`** on all 16 tables. That is Supabase's default (`pg_default_acl` for owner `postgres` in schema `public` grants the same set to every future table). Row-level security is therefore the only barrier for anon and authenticated; `has_schema_privilege(anon|authenticated, 'public', 'CREATE')` is false, so neither role can create objects.

`TRUNCATE`, `REFERENCES` and `TRIGGER` are not reachable through PostgREST, so this is hygiene, not exposure — but a `revoke truncate, references, trigger on all tables in schema public from anon, authenticated` costs nothing.

### 2.2 RLS matrix — effective access per table (anon / authenticated), from `pg_policies`

All policies are PERMISSIVE and (with one exception) apply to role `public`, i.e. anon and authenticated alike. "own" = `auth.uid()` matches the owner column or an owner-resolving helper. UPDATE policies that carry only USING have that expression applied to the new row as well (Postgres semantics), so a row cannot be re-homed to another owner — checked for pages (`user_id`), modes (`get_page_owner(page_id)`), blocks (`get_mode_owner(mode_id)`), block_items (`get_block_owner(block_id)`).

| table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | own only (anon: none) | none — only `handle_new_user` (definer) | own; WITH CHECK pins plan, stripe_customer_id, subscription_status, subscription_period_end, referred_by, referral_code; triggers `guard_billing_columns`, `guard_referred_by`, `guard_entitlement_columns` | none |
| pages | **every row, every column** (`true`) — incl. `user_id`, `theme_json`, goal ids | own + `maxPages` quota | own | own |
| modes | **every row** (`true`) | own page | own | own |
| blocks | **every row incl. `is_enabled = false`** (policy is named "Public can view enabled blocks" but its expression is `true`) | own mode | own | own |
| block_items | **every row** (`true`) — every URL, price, badge, `is_adult`, items of disabled blocks | own block | own | own |
| events | own page (anon: none) | none — `track_event` only | none | none |
| page_subscribers | owner | none — `subscribe_to_page` only | none | owner |
| custom_theme_presets | own | own | own | own |
| profile_snapshots | own | own — TWO policies: quota'd `"Users can create their own snapshots"` OR un-quota'd `snapshots_insert_own` (§1.3.9) | own manual rows only (`to authenticated`) | own |
| custom_short_links | own | own + `maxShortLinks` quota | own | own |
| pending_grants | referrer | none | none | none |
| ai_usage_events | own | none (service role) | none | none |
| stripe_webhook_events, billing_recon_runs, billing_recon_findings, comp_grants | none | none | none | none |

**Cross-account exposure (the ISO.4 lesson).** The four world-readable tables expose more than the public page renders:

- `blocks` with `is_enabled = false` and their items. Prod today: 6 disabled blocks, 5 items inside them (mecivietnam's seeded `primary_cta` "Shop My Collection → example.com/shop" and three `product_cards` placeholders are hidden on the page but readable by anyone with the anon key via `GET /rest/v1/block_items?block_id=eq.…`). `PublicProfile.tsx:290` filters `.eq('is_enabled', true)` client-side; the server does not.
- `pages.user_id` for every page → the storage folder name for that user in four public buckets.
- `block_items.url` for every item, including 18+ gated ones (0 today). The adult gate is a DOM-level control (see 2.7), which is its stated threat model.
- `pages.theme_json` in full (includes `heroConfig`, header image URLs, desktop stage choice). Needed for rendering; nothing sensitive found in the three prod rows.

No table exposes `profiles.email`, pixel IDs, `brand_json`, subscribers, events, billing or referral data across accounts. Every public read of profile data goes through a `get_public_*` SECURITY DEFINER RPC that returns a fixed column set (pixels are plan-gated in the body; branding returns plan + show_badge + referral_code; brand fonts returns the `fonts` array only; plan returns the string). **CLEAN.**

**Editor-side scoping.** A scan of every `.from('<table>').select(` chain in `src/` (audit-scratch/src-unscoped-reads.mjs): 109 select statements on public tables, **0 without a row filter**. The battery's PW-SCOPED-READS invariant covers `blocks`/`block_items` (20 reads, all scoped or waived); `pages`/`modes` are equally world-readable but not in the invariant's regex — today's only spec read of them (53) is scoped by handle.

### 2.3 Function EXECUTE grants (`aclexplode(proacl)`)

| function | anon | authenticated | service_role | PUBLIC | note |
|---|---|---|---|---|---|
| admin_grant_comp, admin_revoke_comp | — | — | — | — | postgres only. **CLEAN** (COMP-NO-GRANT holds in prod) |
| track_event | ✓ | ✓ | ✓ | — | intended |
| claim_referral | **✓** | ✓ | ✓ | — | file says authenticated only; anon call returns false at `auth.uid() is null` |
| subscribe_to_page, resolve_short_link_by_slug, get_public_* (4) | ✓ | ✓ | ✓ | ✓ | intended |
| referral_earned_in_window | **✓** | **✓** | ✓ | **✓** | file says service_role only; leaks a profile's granted-referral count by uuid |
| generate_referral_code | ✓ | ✓ | ✓ | ✓ | harmless (returns an unused random code) |
| current_plan, plan_limit, plan_allows | ✓ | ✓ | ✓ | ✓ | file: authenticated + service_role; harmless |
| get_*_owner, guard_*, handle_new_user, set_referral_code | ✓ | ✓ | ✓ | ✓ | default; trigger/helper functions, not callable usefully |

`pg_default_acl` confirms why: every new function owned by postgres in `public` receives EXECUTE for anon, authenticated and service_role automatically. Any future privileged function must repeat the four `REVOKE` lines the comp migration uses.

### 2.4 Storage

Buckets and policies are in §1.1. Findings:

1. **All four buckets are public.** Object URLs bypass RLS entirely; the "Users can view own …" SELECT policies only govern `list()`/signed operations. Consistent with the product (assets must render for visitors), but it means the folder-name = user_id convention is the only namespace.
2. **`fonts` has `allowed_mime_types = null`.** Any authenticated user can upload any file type under their folder into a public bucket (`useUserFonts.addFont` validates client-side only; the storage policy checks folder ownership only). Result: arbitrary public file hosting on the project's storage domain (HTML, SVG, executables). Fix: `update storage.buckets set allowed_mime_types = array['font/ttf','font/otf','font/woff','font/woff2','application/font-woff','application/x-font-ttf','application/octet-stream'] where id='fonts'` — check what `validateFontFile` accepts first so uploads keep working (`application/octet-stream` is what many browsers report for `.ttf`).
3. **Orphaned objects from deleted accounts.**

```sql
with folders as (select bucket_id, split_part(name,'/',1) top_folder, count(*) objects, sum((metadata->>'size')::bigint) bytes from storage.objects group by 1,2)
select f.bucket_id, (u.id is not null) user_exists, count(*) folders, sum(objects), sum(bytes)
from folders f left join auth.users u on u.id::text = f.top_folder group by 1,2;
-- avatars      user_exists=false  27 folders  225 objects  193,372,520 bytes
-- avatars      user_exists=true    3 folders   29 objects    5,960,195 bytes
-- page-assets  user_exists=false   2 folders    5 objects    2,657,295 bytes
-- page-assets  user_exists=true    1 folder     1 object         1,098 bytes
-- products     user_exists=false   3 folders   18 objects   19,288,982 bytes
-- products     user_exists=true    2 folders   17 objects    1,599,999 bytes
```

32 folders / 248 objects / ~215 MB belong to users who no longer exist in `auth.users`. These predate `delete-account` (which purges storage with the service role) — accounts removed through the dashboard cascade rows but not objects. TL.CLEAN.1 cleaned three accounts; the rest are older.

4. **Orphans inside live accounts.** joeyc's avatars folder: 26 objects, 3 referenced by `pages.avatar_url` / `avatar_original_url` / `theme_json`, **23 unreferenced (5,592,910 bytes)**; mecivietnam 2 objects, 1 unreferenced. Root cause is structural: with no DELETE policy on `avatars` or `page-assets`, `storage-cleanup.ts` is wired only to `products`, and every re-crop/re-upload leaves the previous file forever.
5. `delete-account` `purgeBucket` lists with `limit: 1000` per prefix and walks two levels; a folder with more than 1,000 objects would leave leftovers (reported as warnings, not silently). Not reachable at today's scale.

### 2.5 Edge functions (13) — auth, secrets, exposure, CORS

| function | caller auth | secrets read (`Deno.env.get`) | what it exposes | CORS | quota |
|---|---|---|---|---|---|
| stripe-webhook | Stripe HMAC over raw body (`verifyStripeSignature`, 300 s tolerance, constant-time compare); deployed `--no-verify-jwt` | STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY | nothing (200/400/500 bodies) | n/a | idempotent ledger (`stripe_webhook_events` PK) |
| reconcile-billing | platform JWT **and** `x-recon-secret` (constant-time; unset secret fails closed); `RECONCILE_APPLY === "true"` arms writes; 25-finding apply cap | RECONCILE_SECRET, RECONCILE_APPLY, STRIPE_SECRET_KEY, service role | run summary + first 10 findings to the caller | `*` | none needed |
| create-checkout-session | `getAuthedUser` (JWT validated by `auth.getUser`) | STRIPE_SECRET_KEY, SITE_URL, service role (reads own `stripe_customer_id`) | Stripe session URL | `*` | none |
| create-portal-session | `getAuthedUser`; customer id from the caller's own row, never the body | same | portal URL; 409 when no customer | `*` | none |
| delete-account | `getAuthedUser`; typed handle re-checked server-side; Stripe cancel first, then storage purge, then `auth.admin.deleteUser` | STRIPE_SECRET_KEY, service role | `{deleted, warnings}` | `*` | none |
| ai-crop | `getAuthedUser` | ANTHROPIC_API_KEY, service role | face position JSON | `*` | 40/day/user via `ai_usage_events`; 10 MB input cap |
| ai-enhance | `getAuthedUser` | REPLICATE_API_TOKEN, service role | Replicate output URL | `*` | 20/day/user; 10 MB cap |
| generate-bio | `getAuthedUser` | LOVABLE_API_KEY, service role | two bios | `*` | 40/day/user; 500-char inputs |
| suggest-links, suggest-onboarding-content | `getAuthedUser` | LOVABLE_API_KEY, service role | suggestions | `*` | 40/day/user |
| unfurl | **none in code** — relies on platform `verify_jwt` (default true), which the public anon key satisfies | none | title/image/description/favicon of any http(s) URL; SSRF guard (IPv4/IPv6 private ranges, metadata IP, manual redirects ≤5, 5 s, 1.5 MB) | `*` | **none** |
| youtube-feed | **none** — anon key suffices | YOUTUBE_API_KEY | channel/playlist feed | `*` | **none** (15-min in-memory cache per instance) |
| qr | **none** — `verify_jwt = false` in config.toml | none | PNG/SVG QR for any http(s) URL, 128–1024 px | `*` | none; `Cache-Control: public, max-age=3600` |

Observations:

- No function logs a secret; the billing functions log user ids and Stripe object ids only. **CLEAN.**
- Every function answers `Access-Control-Allow-Origin: *`. For JWT-gated functions that is normal Supabase practice. For `unfurl`, `youtube-feed` and `qr` it means any website can drive them with the public anon key: `unfurl` is an SSRF-guarded fetch proxy for the internet (the file's own residual note: DNS rebinding not closed), `youtube-feed` spends the project's YouTube Data API quota (10k units/day default) on anyone's behalf, `qr` is a free QR-code API. None is a data leak; all three are cost/abuse surfaces with no per-caller limit.
- The five AI functions check auth and a daily quota but **not the plan**. `ENTITLEMENTS.free.aiBio = false` (src/lib/entitlements.ts, the `free` block), yet `generate-bio` will run for a free user who calls it directly. Cost is bounded (40/day/user) but the entitlement is UI-only.
- `unfurl` is the mechanism behind TL.POLISH.1(d): it already fetches `<title>`/`og:title` and the LinksEditor auto-fills the label from it (LinksEditor.tsx:371-398). mecivietnam's raw-URL labels mean that autofill did not land for those rows (see §8).
- `config.toml` records `verify_jwt = false` only for `qr`. `stripe-webhook` must also be deployed with `--no-verify-jwt` (its header says so) but nothing in the repo pins it; a deploy without the flag would 401 every Stripe delivery.

### 2.6 Client bundle

`npx vite build --outDir audit-scratch/dist` → one JS chunk (3,413,722 bytes raw, 940,276 gzip) + one CSS file. Grep of `dist/assets/*.js` for key shapes (`sk_live_`, `sk_test_`, `whsec_`, `re_…`, `AIza`, `service_role`, `SUPABASE_SERVICE_ROLE`, `sbp_`, `AKIA`, `ghp_`, `eyJ…`): two hits of the anon-key JWT prefix (the publishable key — expected) and two of the project URL. `re_extractor` is a false positive (a library identifier). **No secret in the bundle.** `.env` holds `RESEND_API_KEY` beside the `VITE_*` values; it is not `VITE_`-prefixed so Vite does not bundle it, but a frontend `.env` is the wrong home for a server key.

### 2.7 Specific attack surfaces the brief asked about

- **Write RPCs matching `get_public_*`:** all four (`get_public_brand_fonts`, `get_public_page_branding`, `get_public_page_plan`, `get_public_tracking_pixels`) are `LANGUAGE sql STABLE` single SELECTs. None writes. `resolve_short_link_by_slug` (UPDATE clicks) is the one write-capable RPC the fixture waves through, by exact name, as documented in tests/fixtures.ts — specs that visit `/s/:slug` increment real click counters on the battery's links. **CLEAN.**
- **Open redirect in short links:** `/s/:slug` → `resolve_short_link_by_slug` → `safeHref` → `location.replace`. A shortener is an open redirector by definition; mitigations are account + quota (3/25/100) + reserved slugs + scheme allowlist. The missing `target_url` CHECK (§1.3.10) leaves scheme enforcement client-side only. `/go/:itemId` resolves **any** `block_items.id` to its URL (not only gated ones) — a general redirector to stored links, http(s)-only via `safeHref`, `noindex`, `robots.txt` disallows `/go/`. Acceptable.
- **Adult-gate bypass:** by design the gate keeps 18+ URLs out of the DOM for crawlers (`gatedHref` returns undefined; hop via opaque id). A human with the anon key reads the URL from `block_items` — that is outside the stated threat model. `isEffectivelyGated` derives from the destination domain, so clearing `is_adult` cannot un-gate a catalogued adult domain. **CLEAN against its model.**
- **Referral abuse:** covered by claim_referral (8-char restricted alphabet, 2-hour signup window, write-once, `id <> uid`), the `pending_grants_one_per_referred` unique, `referrer_id <> referred_id` CHECK, rule R3 shared-customer test, R5 cap 12/365d, R2 30-day hold, R4 clawback on `charge.refunded` / `charge.dispute.created`, and rewards only on `invoice.paid` with `amount_paid > 0` and `billing_reason = subscription_create`. Residuals: `referral_earned_in_window` publicly executable (count leak), no rate limit on `claim_referral` (a valid code is 1 in 31⁸ — infeasible). **CLEAN.**
- **Handle squatting on signup:** `StepYourProfile` and `OnboardingFlow.handleStep2Next` check uniqueness against `profiles.username` and `pages.handle` — and nothing else. `RESERVED_SLUGS` / `isReservedSlug` are applied only to short-link slugs (`ShortLinks.tsx:15`); `handleSchema` and `sanitizeHandle` in `src/lib/validation.ts` are **unused exports** (token-level scan). There is no DB CHECK on `pages.handle` format or reserved words. A new account can therefore register `admin`, `support`, `titilinks`, `billing`, `login`, `terms`… — the route table wins for path collisions, but the brand/impersonation handles are claimable and display as `@support`. The three prod handles are clean lowercase, no collisions.
- **Rate limiting:** database side — none (no `pg_cron`, no `pg_net`; `track_event`, `subscribe_to_page`, `resolve_short_link_by_slug`, `claim_referral` accept unlimited calls; `track_event` caps a row at 2 KB but not rows). Edge side — AI functions only (daily per-user counters). Auth side — Supabase-managed limits (dashboard setting; **unverified from here**). Hosting side — none configured in `vercel.json`.
- **SECURITY DEFINER hygiene:** 16 of 23 functions are DEFINER. All but four pin `search_path = public`; `handle_new_user`, `get_page_owner`, `get_mode_owner`, `get_block_owner` do not (§1.3.3). No API role has CREATE on any schema in the search path, so this is hardening, not a hole.

### 2.8 Security items that are CLEAN (checked, nothing found)

- No client-side write path to `plan`, `stripe_customer_id`, `subscription_status`, `subscription_period_end`, `referred_by`, `referral_code` (policy pins + triggers + `billing.test.mjs` census, which also greps `comped_until`).
- `profiles.email` never leaves the owner's own SELECT.
- `stripe-webhook` signature verification is over the raw body with a replay window; unhandled event types are acked 200 without a ledger row; failed handlers leave `processed_at` null for retry.
- `create-checkout-session` validates `priceId` against a server allowlist and derives the return origin from `SITE_URL`/localhost only.
- Security headers on Vercel: nosniff, SAMEORIGIN, Referrer-Policy, HSTS, Permissions-Policy present. No CSP (deferred per rev3 — still open).
- `TrackingPixels` injects only `safePixelId`-filtered values; injection is fenced to `PublicProfile`.
- `safeHref` guards every navigation sink found (LinkButton, EventsBlock, VideoFeedBlock, ContentSectionBlock view-all, EmailSubscribe redirect, AdultLinkHop, SlugRedirect, ShortLinks anchor, Editor pending-gate).


## Section 3 — Billing path (READ ONLY; `useAuth.tsx` and the hero system were read, not touched)

### 3.1 The trace

1. **Signup.** `Login.tsx` → `useAuth.signUp` (`supabase.auth.signUp`, email confirmation on: all three prod users have `email_confirmed_at`). `auth.users` INSERT fires `on_auth_user_created` → `handle_new_user()` inserts `profiles (id, email)`; `trg_set_referral_code` mints an 8-char code. Plan defaults to `'free'` (column default). A `?ref=` code stashed by `ReferralCapture` is offered to `claim_referral` once a session exists (`Login.tsx:67-72`).
2. **Checkout intent.** Pricing CTA → `stashPendingCheckout(interval)` (localStorage, 30-min TTL) → after auth `Login.tsx:74-85` calls `startCheckout` → `supabase.functions.invoke('create-checkout-session', { priceId })`.
3. **Checkout session.** Edge function validates the caller's JWT, maps `priceId` through `_shared/billing.ts` (two LIVE price ids, `plan: 'pro'` only — Business is unpurchasable), reuses `stripe_customer_id` when present, sets `client_reference_id` and `subscription_data.metadata.user_id`, returns Stripe's URL. Nothing is written to `profiles`.
4. **Webhook.** Stripe → `stripe-webhook` (HMAC verified) → claim the event id in `stripe_webhook_events` → handler → `patchProfile` with the service role. `checkout.session.completed` binds the customer and, after fetching the subscription, applies `subscriptionPatch(sub)`. `customer.subscription.created|updated` → `subscriptionPatch(sub)`; `…deleted` → `{ revoked: true }` → `plan: 'free'`, `status: 'canceled'`. `invoice.paid` refreshes the mirror, qualifies a referral on the first real invoice, releases due grants. `invoice.payment_failed` → `subscription_status = 'past_due'` only (access kept). `charge.refunded` / `charge.dispute.created` → clawback.
5. **Plan flip.** `planForSubscriptionStatus`: `active | trialing | past_due → 'pro'`, everything else (incl. unknown) → `'free'`. `guard_billing_columns` lets the write through because `auth.role() = 'service_role'`.
6. **UI.** `useEntitlements` reads `profiles.plan, show_badge, referral_code` (owner SELECT) → `normalizePlan` → `ENTITLEMENTS[plan]`. `BillingSuccess` polls that query 20 × 3 s until `pro`. Gates found in the client: `can('linkAnimations')` ×5, `atLeast('pro')` ×4, `can('analyticsAdvanced')` ×2, `entitlements.maxSnapshots/maxShortLinks/maxPages` ×2 each, `can('removeBranding'|'emailSubscribe'|'customFonts')` ×1 each, `entitlements.trackingPixels/customFonts` ×1. Public-page gates read the **owner's** plan through `get_public_page_plan` / `get_public_page_branding` and fail toward free.
7. **Server floors.** `plan_limit`/`plan_allows` in policies (pages, custom_short_links, profile_snapshots — the last one bypassed, §1.3.9), `guard_entitlement_columns` (show_badge, brand_json.fonts growth), `subscribe_to_page` (emailSubscribe), `get_public_tracking_pixels` (trackingPixels).
8. **Portal / cancel.** `create-portal-session` builds the portal from the caller's own `stripe_customer_id` (409 when none). Cancellation state returns via the webhook.
9. **Backstop.** `reconcile-billing` (manual POST with `x-recon-secret`) — Stripe-driven enumeration, report-only unless `RECONCILE_APPLY=true`, joined to profiles `where stripe_customer_id is not null`.

### 3.2 Can the six pinned columns be written client-side? — No.

Three independent layers, all verified in prod:

- **Policy** `"Users can update their own profile"` WITH CHECK pins `plan, stripe_customer_id, subscription_status, subscription_period_end, referred_by, referral_code` (`pg_get_expr` output reproduced in 20260901120000, byte-identical tonight).
- **Trigger** `guard_billing_columns` (INVOKER) raises on any change to the four Stripe columns unless `auth.role() = 'service_role'` or `current_user = 'postgres'`; `guard_referred_by` raises on a non-definer change to `referred_by`. `referral_code` has the policy pin only (adequate — it is only ever set by the BEFORE INSERT trigger).
- **Client census.** `scripts/billing.test.mjs:388` greps every `.update/.upsert/.insert({ … })` in `src/` for those columns plus `comped_until`: "zero client-side writes" (39/39 billing checks passed tonight).

A bypass would need the service role key, which lives only in edge-function env. **CLEAN.**

### 3.3 `comped_until` — where it is honoured, and where `plan` is decided without it

`comped_until` is read by **nothing** in `src/` (grep: only the census regex in billing.test.mjs) and by no edge function. By the TL.COMP.0 ruling that is intended: the column is a recorded term, not a timer, and `plan` alone drives entitlements. So every client gate "honours" it trivially — they never look. The question that matters is the reverse: **who writes `plan` without looking at `comped_until`?**

| writer | reads comped_until? | consequence for a comped account |
|---|---|---|
| `stripe-webhook` `handleSubscriptionChange` → `subscriptionPatch(sub, { revoked })` (index.ts:166; plan-lifecycle.ts:125-140) | no | a `customer.subscription.deleted` or a status change to `canceled/unpaid/…` writes `plan = 'free'` — **the comp is silently revoked by Stripe** |
| `stripe-webhook` `handleCheckoutCompleted` / `handleInvoicePaid` → `subscriptionPatch` | no | writes whatever Stripe says; a granting status re-asserts `pro` (fine), a non-granting one writes `free` |
| `reconcile-billing` `compareProfile` (index.ts:194-264) | no — exclusion is `stripe_customer_id is not null`, **not** `comped_until` | a comped account that ever had a Stripe customer is compared against Stripe and reported `plan_mismatch → free`; an armed run applies it |
| `admin_revoke_comp` | yes (it is the door) | derives the post-revoke plan from `subscription_status` — correct, **except** when that mirror is stale (see joeyc below) |
| `_shared/referrals.ts` `releaseDueGrants` (`stillActive = plan in (pro, business)`) | no | reads plan only; a comped referred account counts as retained — acceptable |

The migration comment says comped accounts are "invisible" to the reconciler because they have no Stripe customer. That is true only for a comp granted to an account that never bought. The realistic comp — "your card failed, here is a free year" — has `stripe_customer_id`, and the next `customer.subscription.updated` (status `unpaid`) or `…deleted` event downgrades it. `admin_grant_comp` raises no warning when the target already has a Stripe customer.

### 3.4 Prod billing state (3 accounts) — from `profiles`, `stripe_webhook_events`, `billing_recon_*`

| account | plan | subscription_status | period_end | stripe_customer_id | comped_until | referral_code |
|---|---|---|---|---|---|---|
| joeyc (3eb457d7) | **pro** | **active** | **2027-07-30** | **null** | null | set |
| [customer-redacted] | free | null | null | null | null | set |
| battery (d3f1cfce) | **pro** | null | null | null | null | set |

`stripe_webhook_events` holds 5 rows, all Jul 30 17:12–17:17, all processed without error: `checkout.session.completed`, `customer.subscription.created`, `invoice.paid`, `customer.subscription.updated` ×2. The `_shared/billing.ts` header notes "Sandbox IDs retired 2026-07-30". `billing_recon_runs`: Aug 13 (report mode, `subscriptions_seen: 0`, `profiles_checked: 1`, 1 finding: joeyc `plan_mismatch` expected free / actual pro) and Aug 16 (`subscriptions_seen: 0`, `profiles_checked: 0`, 0 findings). Reading those together:

- The LIVE Stripe account has **zero subscriptions** (two runs, `subscriptions_seen: 0`). joeyc's `active / 2027-07-30` mirror is a leftover of the Jul 30 sandbox checkout. Its `stripe_customer_id` was nulled between Aug 13 and Aug 16 (`profiles_checked` went 1 → 0 across the two recon runs), and no code path writes that column back to null — `subscriptionPatch` only ever sets it — so that was a hand edit. It is why the Aug 16 run saw no linked profile and the Aug 13 finding can no longer be reproduced.
- **Both paid accounts in prod are hand-granted with no ledger row** (`comp_grants` = 0 rows). That is the exact situation TL.COMP.1 was built to end, and the two functions to fix it exist and are locked down. But `admin_grant_comp('joeyc', …)` alone would leave `subscription_status = 'active'` behind, so a later `admin_revoke_comp` would compute `pro` ("comped account that also pays keeps Pro") from a sandbox ghost. The stale mirror has to be nulled by the service role or in the SQL editor as postgres first.
- `Settings` and `Upgrade` show joeyc a "current plan Pro" card whose portal button returns 409 ("no billing account yet"); the app handles that path, but it is a symptom of the same stale row.
- The Jul 30 webhook rows cannot be attributed to a profile from the ledger alone (it stores event id/type only) — **unverified** which account they targeted.

### 3.5 `plan === 'pro'` checks outside the entitlements module

`grep` for literal plan comparisons: `SnapshotsEditor.tsx:333` and `ShortLinks.tsx:258` (`plan === 'business'`, to hide the upgrade CTA — fine), `referrals.ts:386` (`stillActive`, discussed), `reconcile-billing` (`business_skip`, compare), `PublicProfile.tsx:581` (`can(ownerBranding.plan, 'removeBranding')` — through the module). No client code hard-codes `'pro'`. **CLEAN.**

### 3.6 Billing findings summary

- **P1** Comp × Stripe lifecycle: webhook and reconciler write `plan = 'free'` regardless of `comped_until` (§3.3). Fix sketch: in `patchProfile` (or `subscriptionPatch`) read `comped_until` and, when non-null and in the future/infinity, drop `plan` from the patch but keep the mirror columns; in `compareProfile`, skip the `plan_mismatch` kind (still record status/period drift) for comped rows; make `admin_grant_comp` raise or warn when `stripe_customer_id is not null`. Brick **TL.COMP.3 (M, [GATED]: edge deploy + SQL)**.
- **P1** The two hand-granted Pro accounts have no ledger row and joeyc carries a sandbox-era mirror (`active`, `2027-07-30`, no customer). Fix: null the three Stripe mirror columns on joeyc as postgres, then `admin_grant_comp` both accounts with reasons. Brick **TL.COMP.4 (S, [GATED]: SQL by Joey)**. This also clears the reconciler's only historical finding.
- **P2** `comped_until` is not pinned by the UPDATE policy nor by any trigger; an owner can `PATCH` it on their own row (no entitlement effect today, but the column comment promises "written only by the admin functions"). Fix: add it to `guard_billing_columns` and to the WITH CHECK pins. Fold into TL.COMP.3.
- **P2** The reconciler has no scheduler (`pg_cron` not installed; two manual runs ever). Its value is nil until something calls it. Options: Vercel cron hitting it with the secret, or Supabase scheduled functions. Brick **TL.BILL.RECON.4 (S, [GATED]: secret handling)** — after TL.COMP.3, or every run flags comped accounts.
- **P2** `config.toml` does not record `verify_jwt = false` for `stripe-webhook` (only for `qr`). A default deploy would break plan flips. Brick **TL.DEPLOY.1 (S)**: add the stanza (the orphan `project_id` on line 1 is irrelevant when deploying with `--project-ref`).
- **P3** `types.ts` lacks `comped_until`, `comp_grants`, `billing_recon_*`, `admin_*_comp`. Regenerate before the next billing brick (Rule Zero part 2 applies — grep consumers first).


## Section 4 — Test battery health

Baseline not re-run (hard limit). `tests/results/.last-run.json` from the Aug 30 22:07 run: `{"status":"passed","failedTests":[]}`. The Aug 30 report counted 735 = 367 per project × 2 + 1 setup; tonight's grep-level census over the 53 spec files (369 `test(`/`test.skip(` lines, with templated loops counted once and a describe-level skip counted as one) agrees within grep tolerance, and 704 passed + 31 skipped = 735.

### 4.1 The 31 skips, one by one

| spec | skip | count | reason in file | still valid? |
|---|---|---|---|---|
| 02-onboarding | `test.skip(true, 'HARNESS.AUTH.2 …')` on 3 tests | 3 × 2 projects = **6** | shared account auto-advances to step 4; needs an onboarding-from-zero account | **Yes, and it is the only avoidable skip.** Onboarding (handle choice, first page, default seed) has zero automated coverage. Needs a disposable account: `auth.admin.createUser` from the setup project with the service role (not present in the harness today) or a second pinned account that `reset-test-account.mjs` returns to pre-onboarding state. |
| 12-device-preview | describe-level `test.skip(viewport < 1024)` | 5 tests × mobile = **5** | device frame is `lg:block` | Yes (desktop-only chrome) |
| 23-hero-framing | `project !== 'desktop'` on 2 templated tests × 2 styles | **4** | device frame / desktop stage canonical | Yes |
| 24-desktop-stage | `project !== 'desktop'` on 11 tests (3 of them templated × 2 styles) | **14** | desktop-only surface; multi-size comparisons | Yes. Line 477 (`scrollable <= 0`) is a conditional that did not trigger. |
| 31-legal-pages | `project !== 'desktop'` on 1 | **1** | sidebar behind the menu on mobile | Yes |
| 48-urlless-social-rows | `project === 'mobile'` on 1 | **1** | visitor toggle is desktop-stage chrome | Yes |

Total 31. 25 are structural (desktop-only surfaces), 6 are a coverage hole. Proposed brick **TL.HARNESS.ONB.1 (M, [GATED] — needs a service-role key in the harness or a second battery account)**.

### 4.2 Scoped-read coverage (PW-SCOPED-READS)

The invariant matches `.from('blocks'|'block_items')` only. Prod also has `pages` and `modes` at `SELECT USING (true)` (§2.2), so a spec `.from('pages').select()` with no `.eq` would return every account's page. Tonight: guard reports 20 blocks/block_items reads, 5 waived (41–45 discovery reads with a DOM discriminator); the only spec reads of `pages`/`modes` are in 53 and are scoped by handle/page id; spec 34's read is via the app. **No gap in the data today; a gap in the invariant** — extend its `TABLE` regex to `(blocks|block_items|pages|modes)` (S, part of TL.HYG.1).

Write guard: default-deny fixture with standing exceptions `auth/v1/token`, `auth/v1/logout`, `rest/v1/rpc/get_public_*`, `rest/v1/rpc/resolve_short_link_by_slug`, and a global `track_event` stub. The `get_public_*` regex is a naming convention (documented residual); §2.7 confirms no write RPC currently matches it. `allowWrites` is declared in 10 specs (25, 29, 30, 41–45, 50, 53), all scoped to REST tables or the products bucket.

### 4.3 Flake risks

- **Fixed timeouts:** 61 `waitForTimeout` calls in 21 specs (400 ms ×14, 500 ×10, 2500 ×7, 1200 ×6, 900 ×3, 700 ×3, 1500 ×3, 1000 ×3, one 7000). Heaviest: 44-gallery-draft-preview (12), 41-gallery-crop (8), 11-icon-row / 38-referrals / 43-gallery-glide (5 each). `retries: 1` in playwright.config.ts converts a single flake into a "flaky" pass, so the 704/0 figure can hide first-attempt failures — the HTML report's flaky count is the number to watch.
- **DPR sensitivity:** only spec 03 and `helpers/auth.ts:screenshotPage` use `fullPage: true` (the 32,767 device-pixel cap at mobile DPR 3 is documented in specs 01/49); spec 52 pins `deviceScaleFactor: 1` for its 1440×1000 forced viewport. Element-scoped screenshots elsewhere. Low risk.
- **Order dependence:** `workers: 1`, `fullyParallel: false`, no `describe.serial` — specs run in file order against ONE shared account, so state crosses files (29 seeds blocks, 30 flips `show_badge` and restores, 53 seeds a 120-char item and cleans by row id, 41/44 upload and remove products objects). The gallery specs self-correct via DOM discriminators; the risk is a mid-run abort leaving residue that a later spec reads (the "never assert stored account data as a baseline" trap).
- **`test.use({ reducedMotion: 'no-preference' })`** in 43-gallery-glide:36, 44:45, 45:77 is not a `PlaywrightTestOptions` key — the type lists `acceptDownloads … viewport, baseURL, contextOptions, actionTimeout, navigationTimeout, serviceWorkers, testIdAttribute`; `reducedMotion` belongs under `contextOptions`. The pin is therefore not applied (tsc: TS2353 ×3). The battery is green, so the runner's effective default is already no-preference; the pin adds nothing today and would not protect a runner whose OS reports reduce-motion. Fix: `test.use({ contextOptions: { reducedMotion: 'no-preference' } })`.
- **`track_event` stub:** the battery never inserts a real event, so a regression in the RPC (grant revoked, enum drift, 2 KB cap change) is invisible to the battery. The analytics page specs assert against whatever rows exist for the battery page (164 views / 4 clicks in prod).

### 4.4 TL.HYG.1 probe — type-checking `tests/`

`audit-scratch/tsconfig.tests.json` (extends `../tsconfig.app.json`, `types: ["node"]`, `include: ["../tests/**/*.ts"]`) → `npx tsc -p … --noEmit`: **exit 2, 14 errors in 10 files**.

| code | n | files | pattern |
|---|---|---|---|
| TS2307 | 7 | 09, 41, 42, 43, 44, 45, 53 | `import('/src/…')` executed inside `page.evaluate` — a Vite dev-server path, unresolvable by tsc. Fix: `// @ts-expect-error vite runtime path` or a typed `sbEval` helper. |
| TS2353 | 3 | 43, 44, 45 | `reducedMotion` is not a test option (real finding, §4.3) |
| TS2559 | 2 | 07:72–73 | test literal `{ pages: { page2: { style } } }` does not satisfy `RawTheme` |
| TS2352 | 1 | 05:127 | `ThemeJson as Record<string, unknown>` cast |
| TS2339 | 1 | 47:130 | `block_id` missing from a seed row type |

Nothing runtime-breaking; three are a genuine bug (reducedMotion), the rest are typing. Brick **TL.HYG.1 (S)**: commit `tsconfig.tests.json`, add `npx tsc -p tsconfig.tests.json` to `npm run guard`, fix the 14.

### 4.5 Test-area items that are CLEAN

- PW-ONE-DOOR (56 files, one door), PW-WRITE-BYPASS, PW-SCOPED-READS, COMP-NO-GRANT, I18N-PARITY (1,796 keys) all pass; `npm run guard` exit 0 (19 invariants + 9 tpl-preset + 10 tpl-apply + 39 billing checks); `npx tsc -p tsconfig.app.json --noEmit` exit 0.
- No hard-coded handle strings in specs (all derive from `TEST_HANDLE`).
- The identity pin in `auth.setup.ts` refuses the personal account by id.

## Section 5 — Code drift

### 5.1 Recorded items, re-verified

**DesignEditor "Reset below halves" — CONFIRMED violation of the rule (commit row LAST, secondary ABOVE).** `src/components/editors/DesignEditor.tsx` footer strip (the `sticky bottom-0 z-10 mt-auto … border-t` div): first child is the `flex gap-3` row holding **Cancel | Save**, and the **Reset** confirm block (`confirmReset ? … : …`) renders **after** it inside the same `space-y-3` strip. The in-file comment even labels the strip "Cancel / Save / Reset". The commit row is first, the destructive secondary is last — inverted relative to the rule. `LinksEditor.tsx` follows the same shape: its footer strip renders the pair-incomplete revert confirm and then a labelled Delete + confirm whose comment says it is kept as the last element "so Cancel/Save never move" — i.e. Cancel/Save above, Delete below (verify visually; only the strip's source was read). The seven other footers inspected (SocialLinks, Gallery, Events, ProductCards, Bio, TextBlock) carry Cancel + Save only, so the rule does not apply to them.

**Dual "Cancel" semantics — CONFIRMED.** Two behaviours share the same label:
- *Cancel = discard the draft*: Gallery, Events, ProductCards, Bio, TextBlock, SocialLinks (rows) — `onOpenChange(false)` with all edits held in local state.
- *Cancel = close, but some changes are already saved*: `DesignEditor` — Quick Start preset taps call `saveTheme(preset.theme)` immediately (line 345) while the footer comment says "Cancel closes the panel; the draft reverts because the component unmounts" (true for slider/colour drafts, false for the preset write). `SocialLinksEditor` — the icon size / colour / background chips are "global, saved to page headerConfig.*" through `onIconSizeChange`/`onIconColorModeChange`/`onIconBgStyleChange` the moment they are tapped (lines 607–667), and Cancel does not undo them (matches the recorded trap).

**`h-11` vs `py-2.5` height drift — CONFIRMED, four idioms in play.** Census over `src/components/editors/*.tsx` + ProfileDashboard: `h-11` — PageSetupWizard 1, PhotoCropSheet 2, SnapshotsEditor 3; `py-2.5` — BrandKitEditor 3, EventsEditor 3, UserFontsSection 3, ProfileDashboard 5, DesignEditor 1, DesktopViewEditor 1, EmailSubscribeEditor 1, ButtonSurfaceControls 1; `h-10` — LinksEditor 5, HeroCardEditor 3, EmailSubscribeEditor 3, ContentSection 2, Design 2, FeaturedMedia 2, SocialIconRow 2, others 1; `h-9` — ProductCardsEditor 7, PageSetupWizard 2, SnapshotsEditor 2, LinksEditor/SocialLinks/TextBlocksPanel/VideoFeed 1 each. Footer commit buttons are `h-12`. No editor uses one height system.

**`border-border` vs `border-white/10` — CONFIRMED.** src/components: `border-border` 82 uses / 20 files, `border-white/10` 121 uses / 31 files. Per editor the split is stark: DesignEditor 12/0, LinksEditor 12/2, SocialLinksEditor 8/1, TemplateGallery 7/0 (token side) vs EventsEditor 0/13, BioEditor 0/8, TextBlockEditor 0/8, CarouselEditor 0/6, PageSetupWizard 0/6, BrandKitEditor 0/5, ProductCardsEditor 0/4 (hard-coded side). The AUDIT-2026-06 note about Bio/TextBlock hard-coding `bg-[#1a1a1a] border-white/10` still holds.

**Duplicate i18n key families (EN and ES), from `src/hooks/useLanguage.tsx` (1,796 keys each side).** 170 English values are carried by two or more keys. The five largest verb/label families, all keys named:

1. **Save** (7 keys, EN "Save", ES "Guardar"): `editor.hero.save`, `design.save`, `blockEditor.save`, `typoHub.save`, `pixels.save`, `snapshots.save`, `desktopView.save`. (Key-name cousins with other values: `pricing.save`, `goals.save`, `brand.save`.)
2. **Cancel** (12 keys, EN "Cancel", ES "Cancelar"): `linksBlock.cancel`, `publicProfile.cancel`, `linksEditor.cancel`, `design.cancel`, `blockEditor.cancel`, `editor.cancel`, `typoHub.cancel`, `wizard.cancel`, `pages.resetCancel`, `suggestLinks.cancel`, `snapshots.cancel`, `desktopView.cancel` (+ `danger.cancel`).
3. **Delete / Remove** (11 keys): "Delete" → `linksEditor.delete`, `textBlocks.delete`, `shortLinks.delete`, `snapshots.delete`, `snapshots.deleteAction` (ES "Eliminar"); "Remove" → `linksBlock.remove`, `dashboard.hero.remove`, `contentSectionEditor.remove`, `eventsEditor.removePoster`, `linksEditor.remove`, `design.remove` — **ES diverges: "Quitar" vs "Eliminar"**.
4. **Back** (6 keys, EN "Back"): `editor.crop.back`, `dashLayout.back`, `legal.back`, `onboardingFlow.back`, `wizard.back`, `onboarding.back` — **ES diverges: "Atrás" vs "Volver"**.
5. **Preview** (8 keys, EN "Preview", ES "Vista previa"): `editor.hero.previewAlt`, `onboardingFlow.previewAlt`, `emailSubscribeEditor.preview`, `primaryCtaEditor.preview`, `socialIconRowEditor.preview`, `heroCardEditor.previewAlt`, `design.preview`, `onboarding.preview`.

Also notable: "Failed to save" under 13 keys (`videoFeedEditor.saveError`, `emailSubscribeEditor.saveFailed`, `primaryCtaEditor.saveFailed`, `galleryEditor.saveFailed`, `contentSectionEditor.saveFailed`, `productCardsEditor.failedToSave`, `carouselEditor.failedToSave`, `eventsEditor.saveFailed`, `socialLinksEditor.saveFailed`, `socialIconRowEditor.saveFailed`, `linksEditor.failedToSave`, `heroCardEditor.saveError`, `featuredMediaEditor.saveError` — ES consistent); size words with divergent Spanish: "Medium" ×7 (Medio/Mediano), "Large" ×7 (Grande/grande), "Small" ×7 (Pequeña/Pequeño/pequeña); "Upgrade to Pro" ×6 (Mejora a Pro / Mejorar a Pro); "Add link" ×5 (Agregar/Añadir); "Display name" ×4 (Nombre para mostrar / Nombre visible); "Font" ×4 (Tipografía/Fuente); "Off" ×3 (Desactivado/Ninguno); "None" ×3 (Ninguno/Ninguna). The I18N-PARITY invariant guarantees key parity, not wording consistency. Full list: `node audit-scratch/i18n-dupes.mjs`.

### 5.2 Dead code and unused exports

Token-level scan (`audit-scratch/unused-exports.mjs`, excludes `components/ui/` and `types.ts`): **112 named exports referenced by no other file**. Most are types and constants. The dead **components** — verified with an import grep, 0 importers each:

| file | lines | note |
|---|---|---|
| 13 landing sections: CTASection, ComparisonSection, DemoSection, FAQSection, FeaturesSection, HowItWorksSection, IntegrationsSection, MenusSection, ProblemSection, SecuritySection, SolutionSection, StatsSection, TestimonialsSection | (13 files; total for all 19 below) | `Index.tsx` renders only Navbar, HeroSection, BlocksSection, MakeItYoursSection, KnowWhatWorksSection, PricingSection, Footer. TITILINKS_HANDOFF_rev3 says the redesign "was never executed (slop tells still live in Features/Stats/Solution)" — those sections are no longer mounted, so that sentence is stale. |
| `LivePreviewPanel.tsx` | | confirms the rev3 open item |
| `WelcomeCoach.tsx` | | the z-index collision AUDIT-2026-06 flagged cannot occur — the coach is never mounted |
| `ThemePreview.tsx`, `NavLink.tsx`, `BrandLogo.tsx`, `GoalsPanel.tsx` | | GoalsPanel render sites were removed in TL.RETIRE.L.1; the file stayed |

All 19 files together: 1,967 lines. `Dashboard.tsx` is **not** dead — App.tsx:55 routes `/dashboard` to it (AUDIT-2026-06's "delete Dashboard.tsx" is stale). `AISetup.tsx` and `Setup.tsx` are already gone.

Dead *logic* worth noting: `src/lib/validation.ts` exports `handleSchema`, `sanitizeHandle`, `urlSchema`, `optionalUrlSchema`, `labelSchema`, `subtitleSchema`, `badgeSchema`, `bioSchema`, `displayNameSchema`, `isValidUrl`, `getItemCap`, `ALLOWED_IMAGE_*` — none imported anywhere. Handle validation in onboarding is an inline `toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,30)` (StepYourProfile.tsx:275), not the zod schema. `ITEM_CAPS.product_catalog` refers to an enum value prod never had. `reserved-slugs.ts`: only `validateSlug` is consumed.

**TODO/FIXME/HACK inventory: none.** A case-insensitive grep across src, tests, scripts and functions finds 0 markers (the 24 raw hits are the Spanish word "todo"). One `test.fixme` was removed by TL.COMP.5b.

### 5.3 Components that bypass shared paths

- **LinkButton** (`src/components/LinkButton.tsx`) is the shared link surface, used by LinksBlock, PrimaryCtaBlock, ProductCardsBlock, EventsBlock, EmailSubscribeBlock, StickyCtaBar, gallery-shared, LinksEditor, TemplateGallery, OnboardingFlow. Blocks that render their own `<a>` instead: `CarouselBlock` (1 anchor), `ContentSectionBlock` (3 — cards + view-all), `FeaturedMediaBlock` (3), `SocialLinksBlock` (1), `VideoFeedBlock` (2). Card grids and icon rows are legitimately not buttons; the `view_all_url` anchor in ContentSectionBlock is the one that reads like a LinkButton and is not one.
- **leadingIconFor** (`blocks/link-leading-icon.tsx`) is consumed only by LinksBlock and LinksEditor — a single home. `PlatformIcon` is used directly in 9 files (CarouselBlock, SocialSvgIcon, editors for Carousel/SocialIconRow/SocialLinks, MenusSection, StepAddYourLinks, EPV) — by design for icon rows, but CarouselBlock building its own icon lane is the one to check against `leadingIconFor`.
- **composeEventRow** lives in `EventsEditor.tsx:158` and is used only there (twice). Single home. (`src/lib/event-fields.ts` holds the field composers it calls.)
- **Shared toggle**: `components/ui/switch` is imported in 10 files. `EventsEditor.tsx:216` hand-rolls a `role="switch" aria-checked` control instead; `Upgrade.tsx:134` hand-rolls the annual/monthly toggle as a styled `<button>` with no switch role. Two bypasses.

### 5.4 Other drift surfaced while reading

- `src/components/ui/switch` vs Radix `Switch` styling: not audited.
- `Analytics.tsx` renders `Progress`/`Table` from ui; `recharts` is a dependency (5.2 MB package) but is **not imported anywhere in `src/`** (`grep` for `from 'recharts'` finds only `components/ui/chart.tsx`, itself unused). It is dead weight in `package.json`, not in the bundle (tree-shaken).
- `Index.tsx`'s live landing renders the "Pricing" grid from `PricingSection.tsx`, which duplicates copy also held in `src/lib/pricing.ts` for two tiers (`PricingSection.tsx:115,150` inline `tx(...)`) — the UPGRADE.1 single-source promise covers the Pro pitch but the Free/Business cards still carry their own strings.


## Section 6 — Dependencies and build

### 6.1 `npm audit` (summary; full JSON in audit-scratch/npm-audit.json)

616 packages (372 prod, 233 dev). **6 vulnerabilities: 2 high, 3 moderate, 1 low, 0 critical.**

| severity | package | range | direct? | fix |
|---|---|---|---|---|
| high | browserslist | ≤4.28.6 | no | `npm audit fix` (non-breaking) — unbounded memory growth / prototype write via custom stats |
| high | vite | ≤6.4.2 | yes (5.4.21) | **vite@8.2.2 (major)** — path traversal in optimized-deps `.map`, `server.fs.deny` bypass on Windows, launch-editor NTLM hash disclosure. Dev-server only. |
| moderate | esbuild | ≤0.24.2 | via vite | vite 8 |
| moderate | react-router | 6.0.0–7.17.0 | via react-router-dom | non-breaking fix available per npm |
| moderate | react-router-dom | 6.x–7.17.0 | yes (6.30.4 → 6.30.6 wanted) | non-breaking fix available per npm — open redirect via backslash in `<Link>`/`useNavigate` |
| low | postcss-selector-parser | 6.1.0–6.1.2 | no | `npm audit fix` |

Up from 4 at rev3 (browserslist and postcss-selector-parser are new advisories). Vite's build log also warns: "Browserslist: browsers data (caniuse-lite) is 15 months old".

### 6.2 Majors behind (`npm outdated`)

vite 5 → 8 (+3), typescript 5.8 → 7 (+2), react/react-dom 18 → 19, react-router-dom 6 → 7, tailwindcss 3 → 4, recharts 2 → 3, zod 3 → 4, date-fns 3 → 4, framer-motion 12 → 13, lucide-react 0.462 → 1.39, sonner 1 → 2, tailwind-merge 2 → 3, vaul 0.9 → 1.1, react-easy-crop 5 → 6, react-day-picker 8 → 10 (+2), react-resizable-panels 2 → 4 (+2), @hookform/resolvers 3 → 5 (+2), eslint 9 → 10, @eslint/js 9 → 10, eslint-plugin-react-hooks 5 → 7 (+2), globals 15 → 17 (+2), @types/node 22 → 26 (+4), @types/react(-dom) 18 → 19, @vitejs/plugin-react-swc 3 → 4, @lovable.dev/cloud-auth-js 0.0.3 → 1.1.2. Minor/patch behind on ~35 more (Radix set, supabase-js 2.90 → 2.112, react-query 5.83 → 5.102, playwright 1.59 → 1.62). `bun.lock`/`bun.lockb` in the root are stale (npm is the live lockfile).

### 6.3 Build (`npx vite build --outDir audit-scratch/dist`, exit 0, 50.7 s)

| artefact | raw | gzip |
|---|---|---|
| `assets/index-fiVsLcES.js` | **3,413,722 B** | **940,276 B** |
| `assets/index-7FfF9bAU.css` | 119,858 B | 21,272 B |
| 24 hashed image assets in `assets/` (demo webp/jpg) | ~2.8 MB | — |
| everything else in `dist/` (39.2 MB total, 167 files) | — | copied verbatim from the local `public/` folder: 140 files / 32.5 MB on disk, only 10 tracked by git (`public/*.png`, `public/archive/` are gitignored). Vercel builds from git, so the untracked 130 do not ship — but a local `vite build` is 10× heavier than the deployed one. |

Five largest chunks: the single JS chunk above, then `demo-business-B7oszbFF.webp` 459,934 B, `demo-creator-BwQsTkQz.webp` 198,688 B, `demo-creator-a-CPFoGNQL.webp` 194,276 B, `demo-photo-4-D8auPtkk.webp` 156,460 B. **There is exactly one JavaScript chunk.** No `React.lazy`, no route-level splitting: a visitor to `/:handle` downloads the editor, the dashboard, the onboarding wizard, the landing page and `@vladmandic/face-api` (statically imported at `EditableProfileView.tsx:2`; 23.7 MB package, used only for the AI-crop face detector). Vite's own reporter flagged the chunk (>500 kB warning) and noted that the lazy `import('@/integrations/supabase/client')` / `import('@/lib/snapshots')` in brand.ts / default-blocks.ts / tpl-apply.ts "will not move module into another chunk" because the same modules are statically imported elsewhere — the testability seam is intact, the split it implies is not.

**Mis-bundled: the Google Fonts `@import` rules are dropped.** `src/index.css` lines 9–10 import Bebas Neue, Pacifico, Playfair Display and DM Sans **after** the three `@tailwind` directives. Vite warns twice (`[vite:css] @import must precede all other statements`), and the emitted stylesheet contains **0 `@import` and 0 `googleapis`**. Verified against production: `https://www.titilinks.com/` serves `assets/index-7FfF9bAU.css` (same hash as tonight's build), 119,858 bytes, 0 `@import`, 0 `googleapis`; the HTML has no font `<link>`. The only runtime font loaders are `DesignEditor.tsx:95-104` and `ProfileDashboard.tsx:815-822` (editor-only `<link>` injection) and `PublicProfile.tsx:430-432` (Helmet `<link>` on the public route). So the landing page, `/login`, `/templates`, `/terms`, `/privacy` and the dashboard shell render `font-display` (Playfair Display) and `font-body` (DM Sans) — `tailwind.config.ts:17-18` — in their fallbacks, Georgia and system-ui. **Live visual defect on every marketing surface.** Fix: move the two `@import` lines above `@tailwind base` (or, better, add `<link rel="preconnect">` + `<link rel="stylesheet">` for the two families to `index.html` and delete the `@import`s), then assert `googleapis` appears in the built CSS as a guard invariant. Brick **TL.FONT.1 (S)**.

### 6.4 `scripts/contrast-audit.mjs` (exit 1)

29 themes checked (7 presets, 22 templates). **6 fail WCAG:** Neon Nights (label↔surface 1.00), Energy Boost (2.80), Conversion King (1.00), Insta Aesthetic (1.11) — button label invisible or near-invisible on its own fill; Midnight Fade (button↔bg 1.08) and Waterfall (2.31) — button indistinguishable from the page. All 7 presets pass. This script is not in `npm run guard` (it is `npm run audit:contrast`), so the failures are known-but-unblocking. Full table in the run output; the four label failures are the "light button bg = invisible icon" gotcha recorded for TPL.PAGE.2.

### 6.5 `scripts/audit-platforms.mjs` (exit 0)

52 platforms; every HOST_MAP order assertion passes. Two advisory issues: **Lemon8** and **Whop** have no `PlatformIcon` entry and render the neutral fallback glyph. 20 platforms are URL-type with no handle builder (by design).

### 6.6 Build-area items that are CLEAN

`npm run guard` exit 0; `tsc -p tsconfig.app.json` exit 0; no secrets in the bundle; `vercel.json` security headers present; `.env`/`.env.test` gitignored; `lovable-tagger` only in development mode.

## Section 7 — TL.ANLX recon (analytics)

### 7.1 What `track_event` records today

Schema (prod): `events(id uuid, page_id uuid → pages, mode mode_type, event_type event_type, metadata_json jsonb default '{}', created_at timestamptz)`. Indexes: primary key only. RLS: owner SELECT via `get_page_owner`; no INSERT/UPDATE/DELETE policy — the only write path is `track_event(p_page_id, p_mode, p_event_type, p_metadata)` (SECURITY DEFINER, `search_path = public`, no-op for unknown page, nulls metadata over 2,048 bytes; EXECUTE anon/authenticated/service_role). Client: `useEventTracking.ts` — `trackPageLoad` awaits two RPC calls (page_view, then mode_routed), `trackOutboundClick` fires a keepalive `fetch` to the RPC with the anon key.

Rows (2,428, 2.4 MB):

| event_type | rows | first | last | metadata keys |
|---|---|---|---|---|
| page_view | 1,206 | Jul 19 | Sep 2 | `referrer_domain` (null 1,121 · localhost 81 · www.titilinks.com 4), `user_agent` (raw) |
| mode_routed | 1,206 | Jul 19 | Sep 2 | `routing_reason` = `'default'` on every row |
| outbound_click | 16 | Aug 12 | Sep 2 | `block_type`, `block_id`, `item_id`, `destination_domain`, `full_url` |

Per page: joeyc 1,032 views / 11 clicks (6 distinct UAs), battery 164 / 4, mecivietnam 10 / 1 (3 UAs; days: Aug 19 ×1, Aug 29 ×1, Sep 2 ×8). Two rows carry a `HeadlessChrome` UA (pre-stub battery runs); 81 carry `referrer_domain = 'localhost'` (dev sessions).

Data-quality verdicts: `mode_routed` is a byte-for-byte duplicate signal of `page_view` (the shop/recruit routing it described no longer exists) and is half the table; raw `user_agent` is stored verbatim (a fingerprinting-grade string, and PII-adjacent under most privacy regimes) but never parsed; there is no visitor or session identifier, so "unique visitors" cannot be computed; no country, no language, no device class; no per-link view count (per-link CTR can only be item clicks ÷ page views); `useAnalytics.ts` pulls `select *` for 30 days and aggregates in the browser (fine at 2.4 k rows, quadratic pain later); `analyticsAdvanced` cannot be enforced server-side while the client reads raw rows (already recorded in the ENT.SRV migration notes). **What the test stub hides:** `tests/fixtures.ts` answers every `track_event` POST with an empty 200, so no spec has ever exercised the real RPC — a broken grant, an enum change or a body regression would not fail the battery.

### 7.2 What the market's analytics tier shows (Linktree as the reference — general knowledge, not re-verified against Linktree's site tonight)

Free: lifetime/28-day views, clicks and CTR. Paid: daily time series of views/clicks/CTR, per-link click counts and CTR, traffic sources (referrer domains grouped into social/direct/other), locations (country, city), device type (mobile/desktop/tablet), subscriber growth, and longer history windows. Beacons and Link.me add UTM breakdowns and revenue per link.

### 7.3 Gap list (TitiLinks vs that tier)

| capability | today | gap |
|---|---|---|
| views / clicks totals (7d, 30d) | yes | — |
| CTR | per mode only (`ModeBar`) | page-level and per-link CTR missing |
| time series | no | needs day buckets (data exists via `created_at`; needs an index and a query) |
| per-link clicks | data exists (`item_id`) | not surfaced (only "top destinations" by domain and two goal items) |
| referrers | tiktok / instagram / other buckets | no domain list, and 93 % of rows are null referrer |
| geo (country/city) | **no data** | needs collection |
| language | **no data** | needs collection — the cheapest, most direct answer to "third language?" |
| device / browser / OS | raw UA only | needs parsing at write time (or at read time from the stored UA) |
| unique visitors | no | needs a daily-rotating salted visitor hash |
| server-side plan gate | no | needs an aggregating RPC |

### 7.4 Proposed schema (additive only)

- **`events.metadata_json` for `page_view`** — add `lang` (`navigator.language`, e.g. `vi-VN`), `device` (`mobile|tablet|desktop` from UA at write time), `browser`, `os`, `visitor` (sha-256 of daily-salt + IP + UA, 16 hex chars — computed server-side, see ANLX.2), `country` / `region` (ANLX.2), `utm_source/medium/campaign` when present; **stop storing raw `user_agent`**; **stop emitting `mode_routed`**.
- **Indexes:** `create index on public.events (page_id, created_at desc)`; `create index on public.events (page_id, event_type, created_at desc)`.
- **`page_stats_daily`** (`page_id, day, views, clicks, uniques`) and **`page_stats_daily_dim`** (`page_id, day, dim in ('country','lang','device','referrer','item'), value, views, clicks`) — new tables, owner-only SELECT, written by a SECURITY DEFINER rollup; the raw `events` table stays as the source and can be pruned to 90 days later.
- **RPC `get_page_analytics(p_page_id uuid, p_days int)`** — SECURITY DEFINER, checks `auth.uid() = get_page_owner(p_page_id)`, returns the basic aggregates always and the dimensional breakdowns only when `plan_allows(plan, 'analyticsAdvanced')`. This is the mechanism that finally makes `analyticsAdvanced` a server floor and lets `useAnalytics` stop pulling raw rows.

### 7.5 Geo: how, and does it answer "third language — Portuguese?"

Supabase Edge Functions do not expose a client-country header the code can trust. Two workable paths: (1) **Vercel** — the SPA is already hosted there; a tiny `api/track.ts` Vercel function receives `x-vercel-ip-country`, `x-vercel-ip-country-region`, `x-vercel-ip-city` for free and forwards to `track_event` (or a new `track_event_v2(country, …)`) with a server-held key; the client swaps its RPC URL for `/api/track`. (2) Keep the Supabase RPC and add a GeoIP lookup inside a new edge function (MaxMind GeoLite requires bundling a DB; ip-api-style services rate-limit). Path 1 is the recommendation. **On the language question:** country is a proxy (Brazil + Portugal traffic ≈ Portuguese) but `lang` from `navigator.language` is the direct measurement and needs no infrastructure — a Vietnamese-speaking visitor in Texas reads as `vi-VN`. Note the only real customer in prod today writes Vietnamese (mecivietnam's bio block: "MECI Việt Nam …"), so the current third-language signal is Vietnamese, n = 1. Ship `lang` first; decide on Portuguese from a month of it.

### 7.6 Brick sequence

| brick | size | gate | scope |
|---|---|---|---|
| TL.ANLX.1 | M | [GATED] SQL (two indexes) | client: stop `mode_routed`, add `lang`/`device`/`browser`/`os`, drop raw UA, skip tracking on `localhost`; SQL: two indexes; test: replace the blanket stub with a route assertion on the payload shape |
| TL.ANLX.2 | M | [GATED] Vercel env + deploy | `api/track.ts` with country/region + visitor hash; client points at it; fallback to the RPC if the function is down |
| TL.ANLX.3 | L | [GATED] SQL | `get_page_analytics` RPC + daily rollups + Analytics page: time series (recharts is already a dependency), per-link CTR, referrer list, country/language/device tables; `analyticsAdvanced` enforced server-side |
| TL.ANLX.4 | S | [GATED] SQL by Joey | one-time cleanup: delete `mode_routed` rows, the 81 localhost and 2 HeadlessChrome rows |


## Section 8 — TL.POLISH.1 recon (cold-user defaults), specimen: mecivietnam (rows READ, nothing changed)

### 8.1 The specimen as prod holds it

| object | value |
|---|---|
| `profiles` | plan free · page_style `hero` · `display_name` = **`mecivietnam`** (identical to the handle) · avatar set · no pixels, no brand kit · created Aug 19 06:30 (email provider) |
| `pages` | handle `mecivietnam` · `display_name` = `mecivietnam` · bio **null** · `avatar_url` = `avatars/<uid>/651cd4a1-….jpg` · **`avatar_original_url` null** (no re-crop source) · `theme_json` = defaults: `pageStyle: hero`, solid `#0e0c09`, `overlay_opacity 0.5`, `typography { font: modern, text_color: #ffffff }`, `buttonStyle solid_rounded`, `linkCount 3`, **no `headerConfig`** (so `nameColor` defaults to `#ffffff`) |
| avatar object | `image/jpeg`, **10,080 bytes** (a favicon-sized export; a second identical-size object from the same minute is unreferenced) |
| `blocks` (page1) | social_links (enabled, 0 items) · primary_cta (**disabled**, seed item "Shop My Collection → example.com/shop", badge NEW) · links (enabled, 6 items) · product_cards (**disabled**, 3 seed items "Product One/Two/Three → example.com") · gallery (disabled) · video_feed (disabled) · bio (enabled, 1 item) · email_subscribe (**enabled** on a free plan → hidden publicly by the plan gate, visible in the editor) · social_icon_row (enabled, 0 items) |
| `links` items | all six have **`label` equal to `url`**: `https://mecivietnam.com/` ×2 (one carries `image_url` = `http://cdn.hstatic.net/…/share_fb_home.png` — the site's Facebook share image, i.e. the brand mark; the other has no image), two Pinterest pin URLs, two Plurk post URLs (with Plurk-hosted images). All `size: 'big'`. Created 06:33–06:35, two minutes after the page. |
| bio item | label "MECI Việt Nam - Chúng tôi là "ô-sin" nhà xưởng" (Vietnamese) |
| traffic | 10 page views, 1 outbound click, 3 UAs |

### 8.2 Findings and approaches, one per letter

**(a) Display name unreadable over a light hero.** Code home: `EditableProfileView.tsx:2828-2846` — `headerNameColor = headerConfig.nameColor || chrome.text`, then `textShadow: 'none', ...nameFx` where `nameFx` comes from `typography.text_effect` (default `none`; the `shadow` effect at EPV:191-194 exists but is opt-in). The hero style paints the avatar as the 50dvh media; a white-on-white logo puts `#ffffff` name text over a white image. `applyAutoContrast` (EPV:2406, `theme.auto_contrast`) exists but keys off the theme background colour, not the media. Approach: at hero-upload/crop time (the canvas is already CORS-enabled, guard CROP-CORS) sample the luminance of the bottom 25 % of the framed media and store `heroConfig.luma` (0–1); at render, when `luma > 0.6` and the resolved name colour is light, default `text_effect` to `shadow` (or paint a 120 px bottom scrim `linear-gradient(transparent, rgba(0,0,0,.55))` behind the name/handle block). Users keep the override via the existing text-effect and auto_contrast controls. **[GATED]** — the sampling touches the hero pipeline in EditableProfileView.tsx (protected); the render-side default is outside it. Size S/M.

**(b) Square logo uploaded into the portrait hero.** Code home: `src/lib/hero-framing.ts` — `resolveHeroFraming` defaults `fit: 'fill'` (cover), so a 1:1, ~100 px logo is scaled to cover a ~402×437 box: blurry and edge-cropped. `fit: 'fit'` (contain) is already implemented for images ("Images only today"), and the resolver letterboxes on the page background colour. Approach — logo detection at upload, in `PhotoCropSheet` / the hero upload path: treat an image as a logo when it is small (min side < 400 px) **and** near-square (0.85–1.15) **and** has a uniform border (low variance across the outer 4 % of pixels) **and** the existing TinyFaceDetector pass (EPV:2145) finds no face. For a logo: set `heroConfig.fit = 'fit'`, set `background.solid_color` to the border's dominant colour (canvas average), and skip the face-centred crop. **Face Law implication: none** — the Face Law governs where a face sits in the frame; a logo has no face, and "no face detected" is one of the logo signals, so the two paths never compete. Also store `avatar_original_url` for logos (today null) so contain/cover can be flipped later without a re-upload. **[GATED]** (PhotoCropSheet + hero system). Size M.

**(c) Image card duplicating the avatar with the raw URL as its title.** Code home: `LinksEditor.tsx:371-398` (debounced unfurl autofill: `label = meta.title` unless `titleEdited`, `image_url = og:image` unless `imageEdited`) and the save mapper at 1516 (`label: item.label.trim() || (item.image_url ? '' : labelFromUrl(item.url))`). The editor's own fallback yields the hostname, never the full URL, so these six `label = url` rows were written by a path that copies the URL into the label — given the timestamps (two minutes after onboarding) the onboarding link step is the likely writer; **unverified** which. The duplicated brand mark is `og:image` of the homepage (the site's share image), which is also what the customer uploaded as the avatar. Approach: (1) on save in every writer, if `label` is empty or equals/looks like a URL, use the unfurl `title` and fall back to hostname; (2) warn and de-duplicate identical URLs within one links block; (3) if `image_url` is the page's own share image and the avatar is the same brand mark, default the card to no image (a `size: 'medium'` button) — detect by URL identity where possible, otherwise by a small perceptual hash. Size M.

**(d) Bare-URL labels → fetch `<title>` at save time.** The `unfurl` edge function already returns `title` (oEmbed → `og:title` → `<title>` → hostname). Today it runs only while typing in `LinksEditor` (debounced) and only until the user touches the title. Approach: a shared `finalizeLinkLabel(item)` used by every writer (LinksEditor save, onboarding links step, SuggestLinksDialog, tpl seeds excluded) that calls unfurl when `label` is empty or URL-shaped, with a 3 s budget and hostname fallback; plus a one-time backfill for existing rows (six today). Size S/M; no gate (client + existing function) — but see §2.5: `unfurl` is anon-callable with no quota, so add `getAuthedUser` there in the same brick.

**(e) Upscale at upload — later, opt-in, paid API.** `ai-enhance` already exists (Replicate `crystal-upscaler`, 2×, 20/day/user, 10 MB cap) as the hero "Enhance" action. Approach when scheduled: an "Enhance on upload" toggle in the hero flow, Pro-gated by a new `aiEnhance` entitlement (mirrored into `plan_allows`), skipped automatically for logo-classified images (upscaling a 10 KB mark is the wrong fix — contain is), costed at Replicate's per-call price (2–10 ¢ per the rev3 note). Size L; **[GATED]** (edge deploy + entitlement mirror).

### 8.3 Cold-user defaults the specimen also exposes

- `display_name` defaults to the handle when the user skips the field (StepYourProfile pre-fills the username from the email prefix; the display name has no equivalent nudge).
- `email_subscribe` is seeded **enabled** for a free account (tpl seed at 06:31:08) — it renders in the editor and is silently withheld on the public page by the plan gate; a cold user sees a block that "doesn't work".
- `primary_cta` and `product_cards` seed with `example.com` placeholders, disabled — invisible on the page, but readable through the world-readable `block_items` (§2.2) and listed in the editor as real content.
- The specimen's only public image is an `http://` URL on an `https://` page; modern Chrome auto-upgrades image requests, other browsers may block it — **unverified** whether `cdn.hstatic.net` serves https.

## Section 9 — Backlog re-rank (what to work next, in order)

| # | brick | size | gate | why here |
|---|---|---|---|---|
| 1 | **TL.FONT.1** — move/replace the Google Fonts `@import`s; guard invariant on the built CSS | S | none | Live visual defect on every marketing page today (§6.3). One file, verifiable in the build log. |
| 2 | **TL.COMP.4** — null joeyc's sandbox mirror, `admin_grant_comp` joeyc + battery with reasons | S | [GATED] SQL by Joey | Makes the two paid accounts truthful, clears the reconciler's only finding, exercises the COMP functions for real (§3.4). |
| 3 | **TL.ENT.SNAP.1** — drop `snapshots_insert_own`, re-verify the quota policy covers `kind='auto'` | S | [GATED] SQL | Closes the only live entitlement bypass (§1.3.9). |
| 4 | **TL.MIG.1** — DO-NOT-RUN headers on the nine resurrecting files; a `supabase/migrations/README.md` index (record vs re-runnable vs superseded); list prod-only objects | S | none | Prevents the next COMP.1b-class incident (§1.2). Paperwork, but it is the paperwork the rev-5→6 lesson was about. |
| 5 | **TL.COMP.3** — webhook/reconciler honour `comped_until`; pin `comped_until` in policy + trigger; `admin_grant_comp` warns on Stripe history | M | [GATED] edge deploy + SQL | Will bite the first real comp granted to a lapsed customer (§3.3). |
| 6 | **TL.HANDLE.1** — reserved-word check for handles (client + DB CHECK on `pages.handle` format and a reserved list), reuse `RESERVED_SLUGS` | S/M | [GATED] SQL for the CHECK | Impersonation handles are claimable today (§2.7); cheapest before user growth. |
| 7 | **TL.MIG.2** — additive prod repairs: `page_subscribers` unique index, the 7 init indexes + 2 events indexes, `updated_at` function + 5 triggers, `STABLE` + `search_path` on the four helpers | M | [GATED] SQL | All additive, no policy changes; fixes §1.3.1/1.3.2/1.3.3/1.3.8 in one paste with a verification SELECT. |
| 8 | **TL.STOR.7** — `fonts` bucket MIME allowlist | S | [GATED] SQL | Closes arbitrary-file hosting (§2.4.2). |
| 9 | **TL.SEC.GRANTS.1** — revoke `referral_earned_in_window`/`generate_referral_code` from PUBLIC/anon/authenticated, `claim_referral` from anon; add `custom_short_links_target_url_scheme` CHECK; correct HANDOFF_rev3 | S | [GATED] SQL | Small floors the paperwork already claims (§1.3.10, §1.3.11). |
| 10 | **TL.RLS.BLOCKS.1** — anon sees only `is_enabled = true` blocks and their items; owners see everything | M | [GATED] SQL + battery | Drafts and seed placeholders stop being public (§2.2). Needs the gallery discovery reads re-checked. |
| 11 | **TL.EDGE.1** — `getAuthedUser` + daily quota on `unfurl` and `youtube-feed`; plan check in `generate-bio`; record `verify_jwt=false` for `stripe-webhook` in config.toml (TL.DEPLOY.1 folded in) | M | [GATED] deploy | Cost/abuse surfaces (§2.5) and deploy safety (§3.6). |
| 12 | **TL.STOR.6** — service-role sweep of the 32 orphan folders (~215 MB); DELETE policies for avatars/page-assets; wire `removePublicObject` into avatar replace | M | [GATED] service-role script + SQL | Storage cost and the structural leak (§2.4.3–4). |
| 13 | **TL.ANLX.1 → .2 → .3 → .4** | M, M, L, S | see §7.6 | The analytics epic; `lang` in ANLX.1 answers the third-language question in a month. |
| 14 | **TL.POLISH.1d → 1c → 1a → 1b** (1e later) | S/M, M, S/M, M | 1a/1b [GATED] (EPV) | Cold-user quality on the one real customer's page (§8). |
| 15 | **TL.HYG.1** (tests tsconfig in guard, fix 14 errors, `contextOptions.reducedMotion`, PW-SCOPED-READS covers pages/modes) · **TL.HYG.2** (delete the 19 dead components after a consumer grep) · **TL.BUNDLE.1** (route-level `React.lazy`, dynamic-import face-api) · **TL.DEP.1** (`npm audit fix`, browserslist db) · **TL.DEP.2** (vite 8 + react-router 7, L) · **TL.BILL.RECON.4** (schedule the reconciler — after TL.COMP.3) · **TL.HARNESS.ONB.1** (spec 02) · **TL.I18N.1** (collapse the duplicate families into `common.*`) · **TL.CSS.1** (one control height, one border token) | S–L | mixed | Hygiene and debt; none is urgent, all are cheap to start. |

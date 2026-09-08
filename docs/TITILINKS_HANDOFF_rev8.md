# TITILINKS ARCHITECT HANDOFF — rev 8 (Sep 7, 2026)

> Committed Sep 7 2026 (evening MDT) by the rev-9 architect session after running the START-OF-SESSION CHECKLIST.
> Verified that session: HEAD `1ac7022`; census 4 users / 2 comp_grants; 9 edge functions; 47 migrations; 60 specs; 23 guard invariants;
> `npm run guard` + both `tsc` green; **TL.BAT.1 full battery: 749 passed / 0 failed / 55 skipped (47.4 min, no flakes) on `1ac7022`.**
> Drift found and parked (see TL.HYG.2): `suggest-links` and `ai-enhance` are deployed with `verify_jwt=false` (both redeployed Sep 7);
> both call `getAuthedUser` and 401 without a user JWT, so nothing is exposed, but the handoff/config say only `stripe-webhook` is off.

## SEAT & PROTOCOL
You are the ARCHITECT (claude.ai chat). Joey runs Claude Code (CC) in a terminal. Joey pastes your brick prompts to CC; CC's reports come back to you. You are the expert; Joey is the product owner and the visual gate.

**RULE ZERO — verify before you claim.** Repo is public: `https://github.com/jcolley2019/titilinks`. At session start clone it and read it. Before any claim about the codebase, read the file. After EVERY push, `git fetch` and verify the hash and file list on `origin/main` yourself. Never take "pushed" on faith.

**Connectors available to the architect (verified rev 8):**
- **Supabase connector** — org **"JoeyC AI"** (`ocybwhiylmvxrbztwbzb`), project TitiLinks v2.0 = `ohmvlypcbrfkuudcuqub`. A second org "JoeyC Projects" exists and is WRONG; if `list_organizations` returns it, ask Joey to reconnect and pick JoeyC AI. The architect uses it for READ-ONLY SELECTs and for **rehearsing prod SQL inside a transaction that ends in `raise exception` (forced rollback)** — that rehearsal is the architect's job, never Joey's. Prod WRITES stay Joey's hands (paste in the SQL editor) unless Joey says "yes, run it" for a specific file.
- **Device link** ("jc-laptop"): request folder access to `C:\dev\titilinks`; then you can read Joey's working tree (`git status`, diffs, screenshots via stage_files). The mount shows ~155-170 files "modified" — CRLF noise, ignore; CC on Windows sees the tree clean.
- Vercel connector (build logs 401; production auto-deploys from `main`). CC has a READ-ONLY Supabase MCP pinned to the project.

**ARCHITECT SELF-CHECK RULE (Joey, rev 7):** "Review every prompt you give me and make sure it's accurate. Do the proper research — view the code locally or from GitHub. Always double-check your work." Read the target files before writing a brick; read CC's diff line by line before approving protected-file changes; never hand Joey a prompt whose expected outcome you haven't reasoned through. If a paste arrives unreadable, say so.

## COMMUNICATION RULES (Joey's standing rules — follow exactly; the rev-8 additions are marked NEW)
- Short, plain-language responses. One step at a time. Questions to Joey at the TOP, clearly marked, as few as possible. On paperwork/hygiene, MAKE THE CALL and say what you did.
- **NEW — ONE prompt at a time.** Never print two CC prompts in one message. Never re-print a prompt Joey has already run. If a prompt must change, say "ignore the previous one" explicitly and give exactly one replacement.
- **NEW — Every CC prompt carries a header line: `Model: <Opus 5 | Fable 5.1> · Effort: <normal | medium>`.** Default Opus 5 · normal. Fable only when CC must reason without a spec (recon with judgment, edge code without a spec, overnight full-battery triage). Joey guards his Fable budget.
- **NEW — Unique brick IDs, always.** Every brick gets its own ID (e.g. `TL.ONB.PHOTO.1`, `TL.ONB.STAGE.1`). Never reuse or suffix a dead brick's ID (`ONB.1a/1b` caused confusion and was retired). The ID appears in the prompt title, the commit subject, and the board.
- **NEW — No assumptions. Intentional, surgical changes only.** Joey: "We're not making changes to fuck around; we're making intentional changes to make this app a luxury and superior app." If Joey's intent is unclear, ask ONE question before writing a brick; do not build a "fix" for a problem Joey did not name (rev 8: the architect built ONB.1a — an onboarding username box — from a misread; Joey never asked; it was discarded). Confusion in the UI is not automatically a defect; check what the feature was designed to do first.
- **NEW — Mobile onboarding is ruled correct.** Do not change onboarding on small devices. Desktop onboarding is the thing to fix (see IMMEDIATELY OPEN).
- Explain what each brick DOES in plain terms — the problem, the fix, what changes for users — two paragraphs, no jargon. Joey will ask "what are we doing and why."
- Label where every command runs: PowerShell / Supabase web editor / CC / browser. `cd C:\dev\titilinks` with every PowerShell block. PowerShell syntax (Windows 11).
- Everything Joey pastes goes in a fenced block. **Prod SQL: ONE file, ONE paste, ending in `commit;`**, identity assertions at the top of anything destructive, a read-only check SELECT after `commit;` so the editor prints one row, and the EXPECTED OUTPUT stated in one line. The architect rehearses it rolled-back first, then verifies prod after the paste. Deliver SQL as a fenced block in chat (a downloaded file once pasted a title line into the editor and failed with a syntax error — harmless, but avoid).
- Brick prompts: plain fenced blocks (never artifacts). First line: ID + title. CONTEXT (facts you READ, with file:line), numbered STEPs, falsifiable VERIFY, "STOP and report; do not commit" before any visual gate, explicit git sequence (explicit paths, two-line HEREDOC message with a BLANK LINE between the lines, single push, print hash). Joey EXPECTS the commit-and-push block after every gate.
- Joey's visual gate is final on all UI. Screenshots go to `C:\dev\titilinks\tests\screenshots\` (gitignored); the architect can stage and view them via the device link. Ctrl+Shift+R before any visual gate; private window (Ctrl+Shift+N) for logged-out checks.
- Never describe app menus from memory. Ask for a screenshot.
- Two misses on one fix = stop patching, inspect actual rendered/measured state.
- If Joey is frustrated, don't defend — state the cause in one sentence, fix the process, move on. Don't clock-watch; Joey decides when to stop. Check the timestamps on CC reports before summarising "today".

## HARD SAFETY RULES (non-negotiable)
1. NO browser automation / Playwright against Joey's live `joeyc` account, ever. Harnesses go through `tests/fixtures.ts` (one door, two keys — see accounts). Anonymous public-page visits are fine.
2. CC's Supabase MCP is READ-ONLY (note: as `supabase_read_only_user` it cannot see other roles' grants in `information_schema`; use `pg_catalog` / `has_*_privilege` for grant checks).
3. Prod SQL: Joey's hands only (see above). Edge functions: Joey deploys by hand (`npx supabase functions deploy <fn> --project-ref ohmvlypcbrfkuudcuqub`; webhook `--no-verify-jwt`); post-deploy probes per function.
4. Git laws: explicit staging (never -A/-u), two-line HEREDOC messages, single push after gate, architect verifies on origin. Harness trailers (`Co-Authored-By`, `Claude-Session`) are expected.
5. Secrets never in chat. Personal emails out of chat. The two TEST accounts' emails are `joey2019pwtest+battery@gmail.com` / `joey2019pwtest+free@gmail.com` (in the repo already; fine to name). Passwords live only in `.env.test`.
6. Skip-mode default; [GATED] for prod SQL, secrets, billing-path, protected-file surgery, edge deploys.
7. Dev server: `npm run dev` on 8085; HOUSE.2 reuses a healthy server, never kills it; `--force` only on Joey's word. A "1 shell still running" in CC is the dev server — leave it.
8. PROTECTED files (read; edit only with a gate + line-by-line architect review of the printed diff): `EditableProfileView.tsx` (EPV: crop/Hero/SmoothImage/getCroppedCanvas, HDR constants ~984-989), billing files (`stripe-webhook`, `reconcile-billing`, `_shared/plan-lifecycle.ts`, `_shared/billing.ts`, `referrals.ts`), gallery lightbox. Rev 8 precedent: EDGE.2 touched EPV in four minimal places after a printed-diff review.
9. ONE CC session on the repo at a time.
10. Overnight/full battery: Chrome closed, PC awake, `claude --dangerously-skip-permissions`, battery launched DETACHED (`Start-Process`), `--workers=1`; report only, triage into kill-collateral / flake / real; never edit code overnight. Working recipe (TL.BAT.1): reuse the healthy 8085 server; `powershell.exe -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npx playwright test --workers=1 --reporter=list > battery-YYYY-MM-DD.log 2>&1' -WorkingDirectory 'C:\dev\titilinks' -WindowStyle Hidden"`; the log lives at the repo root (`*.log` is gitignored; never inside `tests/results/`, which Playwright wipes); CC tails it every ~5 min.

## STATE OF THE REPO
HEAD: **`1ac7022`**. Since rev 7 (`97a6fff`), 12 commits (oldest first):

| Hash | Brick | What |
|---|---|---|
| bc9ccfb | TL.SESSION.8 | `docs/AUDIT_rev6.md` tracked (customer id prefix redacted); scratch files removed; a stray Sep-2 Google test signup deleted by Joey → 3 users then |
| 079ec31 | TL.COMP.3b | Prod: `comped_until` is the 7th pin in the `profiles` UPDATE WITH CHECK and the 5th column in `guard_billing_columns`; `admin_grant_comp` RAISE NOTICEs on a linked Stripe customer. Migration #44; spec 56 proves P0001 on a battery self-comp |
| 4a832c3 | TL.STOR.7 + TL.SEC.GRANTS.1 | Prod: `fonts` bucket 9 font MIMEs; `generate_referral_code`/`referral_earned_in_window` no client EXECUTE, `claim_referral` authenticated+service_role only; TRUNCATE/REFERENCES/TRIGGER revoked from anon/authenticated on all tables + default privileges; `custom_short_links_target_url_scheme` CHECK. Uploader sends font Content-Type by extension (Windows reports ''/octet-stream). #45; `user-fonts.test.mjs` pins bucket list ↔ `FONT_MIME_TYPES` |
| affc12b | TL.RLS.BLOCKS.1 | Prod: `blocks` public SELECT `USING (is_enabled)` + owner policy; `block_items` public SELECT joined to enabled blocks + owner policy (anon sees 22/28 blocks, 46/51 items, 0 disabled). #46; spec 57 disables a battery block and proves anon REST returns []; 26-spec sweep green |
| 9744eae | TL.EDGE.1 | `unfurl`: getAuthedUser → 401, 300/day; `youtube-feed`: editor door (100/day) vs anon door (regex id + must be configured on an ENABLED `video_feed` block's title JSON + per-IP 30/min, cache-first; free-form input 403); `qr` edge fn retired (the app's QR page is client-side `qrcode.react`). `_shared/quota.ts`. Spec 58 probes live. Joey also deleted 6 dead `canva-*` functions by hand (EDGE.1b) |
| 2705d5f | TL.EDGE.2 | AI tools Pro-only: `plan_allows('aiTools')` (#47) enforced in `suggest-links` + `ai-enhance` via `_shared/plan.ts` (fails CLOSED, 403 PLAN_REQUIRED); `entitlements.aiBio`→`aiTools`; SuggestLinksDialog upsell; EPV crop flow skips AI for free (crop-only fallback), enhance button upsells. `generate-bio`/`suggest-onboarding-content`/`ai-crop` retired (zero callers). Spec 59 (open side) |
| f269abe | TL.PREV.HDR.1 | Public fade-in header (name + save-contact, full-bleed scrim) extracted to `src/components/PublicHeader.tsx` and mounted in the editor's phone preview (edit + visitor), driven by `device-frame-scroll`. Cause: header lived only in `PublicProfile.tsx` since Jun 13; DP.2 (Jul 18) dropped it from visitor preview. Spec 14 +3 tests |
| b3a0a8a | TL.HARNESS.FREE.1 | Second pinned test account (free) behind the same guarded door: `auth.setup` pins two identities (`user.json`, `free.json`); `fixtures.withFreeUser`; guard PW-ONE-DOOR forbids naming `free.json` outside fixtures/setup; reset script refuses the free handle. Spec 60: free session gets 403 PLAN_REQUIRED on both AI fns, `plan_allows` false, dashboard shows Free, self-upgrade UPDATE refused (P0001) — **the closed side, observed end to end** |
| 1ac7022 | TL.ONB.PHOTO.1 | Onboarding keeps the full-resolution original (raw file, or 2400px "large original" over 8 MB) alongside the 800px display crop and writes `pages.avatar_original_url` at page creation, like the editor. `src/lib/onboarding-photo.ts` + `onb-original.test.mjs`. Preview UNCHANGED (see ONB.STAGE.1) |

Discarded (never committed): TL.ONB.1a (onboarding username boxes — not asked for), the ONB.1b phone-frame preview (superseded by Joey's ruling below).

Report-only (no commit): **TL.BAT.1** — full battery baseline on `1ac7022`, Sep 7 evening MDT: 749 passed / 0 failed / 55 skipped, 47.4 min, no flakes.

## LIVE INFRASTRUCTURE FACTS (verified Sep 7)
- **4 accounts.** `joeyc` — Joey (UUID `3eb457d7-8a07-4b2b-88e6-22222debfdc1`, profile username `joey2019pwtest`, Google, pro/comp ∞, page style **full_bleed**). `joey2019pwtestbattery` — battery (`d3f1cfce-d15a-4f4a-ba5c-908e3e959e58`, pro/comp ∞). `joey2019pwtestfree` — FREE test account (`87d14c9b-0eca-4ddf-bfe6-88f1a91ce8c3`, plan free, comped_until null, page style **hero**, photo uploaded via onboarding BEFORE PHOTO.1 so `avatar_original_url` is null; 7 social_links placeholder rows with url ''; NEVER comp/seed/reset — the reset script refuses it). `mecivietnam` — REAL CUSTOMER (Vietnamese company, free, never touched). Census SELECT expects 4.
- Comps: 2 `comp_grants` rows (joeyc, battery). Live Stripe: 0 subscriptions. Grant/revoke: `admin_grant_comp('HANDLE','reason','pro','infinity')` / `admin_revoke_comp('HANDLE','reason')`.
- Edge functions deployed: **exactly 9** = the 9 in the repo: suggest-links v19, ai-enhance v17, unfurl v11, youtube-feed v18, create-checkout-session, create-portal-session, delete-account, stripe-webhook v13 (`verify_jwt=false`), reconcile-billing v4. **Drift (Sep 7):** suggest-links v19 and ai-enhance v17 also show `verify_jwt=false` in prod — harmless (both 401 via `getAuthedUser`) but undocumented; redeploy without the flag under TL.HYG.2. `config.toml` project_id is an ORPHAN ref — never `supabase link`/`db push`.
- Migrations: **47** files; README table must list all (guard MIG-HEADERS). Policies: `profiles` UPDATE WITH CHECK 7 pins; `guard_billing_columns` 5 columns; `blocks`/`block_items` 2 SELECT policies each; `profile_snapshots` 4 policies. `plan_allows` keys: customFonts, emailSubscribe, removeBranding, trackingPixels, aiTools.
- Storage: `fonts` 9 MIMEs; `avatars`/`page-assets` still no owner DELETE policy (orphans accumulate on re-crop — STOR item, parked). 27 orphan folders parked.
- Tests: **60 spec files**; guard = **23 invariants** (the rev-7 "24" was wrong) + all `scripts/*.test.mjs` (now incl. user-fonts, onb-original). **Last FULL battery (TL.BAT.1): 749 passed / 0 failed / 55 skipped on `1ac7022` (Sep 7 evening MDT, 47.4 min, 0 flakes).** Previous: 732 / 0 / 45 on `9744eae` (Sep 5). The +10 skips = spec 59 (+4) and spec 60 (+6), as predicted.
- Both typechecks: `tsc -p tsconfig.app.json`, `tsc -p tests/tsconfig.json`. `.env.test` holds TEST_USER_* and TEST_FREE_USER_*.
- Housekeeping known: `supabase/.temp/` is gitignored but 8 files inside are tracked (your CLI deploys "modify" `cli-latest` — leave it out of commits); `Claude outputs/` (desktop-app folder) and `audit-scratch/`, `reseed.sql` untracked by decision; guard PW-SCOPED-READS failure text still says blocks are `USING (true)` (stale wording).

## IMMEDIATELY OPEN — TL.ONB.STAGE.1 (desktop onboarding = the editor screen)
**Joey's ruling, verbatim intent (Sep 7):** "On the desktop, when they go into onboarding, use the exact same editor screen. Exact same phone preview. None of the menu options — only the ones they need to onboard. Strip the left-hand menu, the editor top bar and the Live stuff. Label it Onboarding at the top; leave the TitiLinks wordmark. We've already built this — don't recreate the wheel." **Mobile onboarding (< lg) stays byte-identical** — Joey has ruled it looks right on small devices.
Recon already done (re-read before writing the brick):
- `src/pages/Editor.tsx` renders the desktop stage INLINE: strip (device selector / Editing–Visitor toggle / @handle / Edit Profile / View Live, ~:860-905), then `device-frame` (resolveDevicePreset width/height, `--pv-vh`, `previewScale` via `previewAreaRef`, 44px radius, hairline/shadow), `PublicHeader`, `device-frame-scroll`, EPV mount (~:906-985). Step 1 of the brick = lift this into `src/components/EditorStage.tsx` as a PURE MOVE with chrome flags; Editor keeps using it unchanged (specs 12/14/15/24/25/33/44/48/53 must stay green).
- `src/components/DesktopStage.tsx` is the PUBLIC page's stage — a different thing; leave it.
- `src/pages/OnboardingFlow.tsx` :514-560: full-window layout with a fixed stretched avatar backdrop (:518-530 — the thing Joey hates on desktop), top bar (wordmark + `OnboardingStepIndicator`), step content in `max-w-3xl`. The real page + blocks are created at step 3 (`createdPageId` ~:422); steps 1–2 have no page yet.
- `src/components/editors/TemplateGallery.tsx` (TPL.PAGE.1) renders live phone mockups of pages that don't exist — reuse that synthetic-page path for steps 1–2 (pageStyle, typed name/handle, avatarPreview, default theme, `default-blocks.ts`).
- Design: ≥lg two columns like the editor — LEFT the step panel (wordmark, step indicator, the existing Step* components unchanged), RIGHT `<EditorStage>` with modeToggle/editProfile/viewLive/handle hidden, label "Onboarding" (EN) / "Configuración" (ES), device selector kept, `editMode={false}`; live drafts (headerDraft from name/handle/avatar state, themeDraft from vibe/style) so the phone updates as they choose; step ≥3 renders the real page via the editor's own data hook (lift it if inline). Remove the stretched desktop backdrop. Spec 62 pins layout + live mirror + mobile unchanged; screenshots for Joey's gate per step. Opus 5 · normal. EPV is not edited (mounted only).
Ask Joey ONE question only if something in the design above is ambiguous after reading the code; otherwise write the brick.

## P2 BOARD (after ONB.STAGE.1; Joey picks or says "next")
1. **TL.AI.LINKS.1** — `SuggestLinksDialog` (AI link suggestions, now Pro-gated) has NO call site; wire a "Suggest with AI" door in the Links editor. Look at how Link.me presents theirs first (Joey offered a logged-in Link.me session via Claude in Chrome for research).
2. **TL.HYG.2** — untrack `supabase/.temp/`, ignore `Claude outputs/`, fix PW-SCOPED-READS stale message, louder "Previewing as visitor" state in the editor, password eye-icon convention flip (Joey found it inverted), add-contact button rethink (Joey reconsidering it — ask before changing), **redeploy `suggest-links` + `ai-enhance` without `--no-verify-jwt` (prod drift found Sep 7; Joey's hands; `functions list` after)**.
3. **TL.TPL.CONTRAST.1** — 6 of 22 templates fail WCAG; palette fixes; Joey's eyes.
4. **TL.STOR.8** — owner DELETE policy on `avatars`/`page-assets` + delete-previous-on-re-crop (23 orphans on joeyc alone).
5. **TL.ANLX.1–4** analytics epic (AUDIT §7). 6. **TL.BILL.RECON.4** schedule the reconciler. 7. **TL.DEP.2** vite 8 + react-router 7. 8. **TL.ACCT.1** Settings account section (any handle-change UI must call `validateHandle`). 9. **TL.PREV.HDR.2** mobile-editor branch header (window-scrolled, under the dashboard bar). 10. **TL.POLISH.1c** sharper logo from og:image (free account can be the specimen). 11. Video-feed epic (Link.me parity: YouTube + Instagram + TikTok) — research Link.me first. 12. Audit P3s: 19 dead components, 112 unused exports, `recharts`, 61 fixed waits, spec 02 skips (needs disposable accounts), `types.ts` missing comp/recon objects.
Ratified SKIPs: courses, Post-to-All, automations/DM, ambassador/agency, print-on-demand.

## KEY FILES
`docs/AUDIT_rev6.md`, `supabase/migrations/README.md`, `CLAUDE.md` (account roster + EDGE.1 probes), `src/components/{EditableProfileView,PublicHeader,DesktopStage,DeviceFrame}.tsx`, `src/pages/{Editor,PublicProfile,OnboardingFlow}.tsx`, `src/components/onboarding/*`, `src/components/editors/{TemplateGallery,SuggestLinksDialog,SocialLinksEditor,LinksEditor}.tsx`, `src/lib/{entitlements,hero-framing,onboarding-photo,user-fonts,handle-rules,default-blocks}.ts`, `supabase/functions/_shared/{auth,quota,plan,plan-lifecycle}.ts`, `tests/fixtures.ts` (one door, two keys), `tests/helpers/auth.ts` (both pinned ids), `tests/auth.setup.ts`, `tests/{55..60}-*.spec.ts` (real-row floor proofs), `scripts/guard-invariants.mjs`, `scripts/reset-test-account.mjs`.

## LESSONS ON RECORD (rev 7→8)
- **Read the feature's intent before calling it a defect.** Placeholder social icons are hidden on the live page BY DESIGN; the architect built a fix nobody asked for. Ask one question first.
- **Same-name orgs bite connectors** ("JoeyC AI" vs "JoeyC Projects") — compare IDs, not names.
- **The read-only role can't see grants** in `information_schema`; a mismatch there is not a prod mismatch.
- **Verify the handoff's own numbers against the code** (24 vs 23 invariants; "3 users").
- **A real account beats a mocked one.** One free-account sign-up exposed the photo-original defect and proved the AI paywall's closed side; the battery (Pro) never could.
- **Dead deployed code is an open door.** Ten functions were live with no callers (qr, 6 canva-*, 3 AI); prod and repo now match 1:1 — keep it that way (`functions list` after any deploy).
- **Deno isn't installed locally** — edge diffs are reviewed by eye; keep edge edits small and mirror existing import styles.
- **Bricks named uniquely, one prompt at a time, model/effort on every prompt.** Joey's rules; the rev-8 architect broke all three at least once.
- **(rev 9) Check `verify_jwt` in `functions list` after every deploy, not just the count.** Two functions came back with the flag off without anyone noticing.

## START-OF-SESSION CHECKLIST
1. Clone; `git log origin/main -1` must be the HEAD recorded above (if later, read the new commits first).
2. Architect: `list_organizations` → "JoeyC AI"; census SELECT (4 users; handles joeyc / joey2019pwtestbattery / joey2019pwtestfree / mecivietnam; 2 ledger rows); `list_edge_functions` (9, and check `verify_jwt` per function). Request device folder access to `C:\dev\titilinks`.
3. CC (Fable 5.1 · medium, detached, Chrome closed): full battery, report only → record the new baseline in this doc's Tests line. CC (Opus 5): `npm run guard`, both `tsc` (the architect can also run these in the clone).
4. Then TL.ONB.STAGE.1: re-read Editor.tsx / OnboardingFlow.tsx / TemplateGallery.tsx, write ONE brick with the header line, hand Joey the two-paragraph "what this does," and gate on his screenshots.

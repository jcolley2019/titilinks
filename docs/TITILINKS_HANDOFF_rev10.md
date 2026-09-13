# TITILINKS ARCHITECT HANDOFF — rev 10 (Sep 13, 2026)

> Written by the rev-10 architect at the end of the Sep 12–13 sessions. Supersedes rev 8 (`docs/TITILINKS_HANDOFF_rev8.md`, tracked) and rev 9 (untracked draft, never committed — delete it). Format tightened this rev: a VERBATIM-CRITICAL block first; anything the next architect can rediscover by reading the repo is left out.

## VERBATIM-CRITICAL (use these strings unchanged)
- Repo: `https://github.com/jcolley2019/titilinks` · local `C:\dev\titilinks` · Windows 11, PowerShell · dev server **8085**
- `origin/main` at handoff: **`d23cbb6`**
- Supabase project **`ohmvlypcbrfkuudcuqub`** · org "JoeyC AI" `ocybwhiylmvxrbztwbzb` · `supabase/config.toml` line 1 points at an ORPHAN project — never `db push`/`link`
- Edge deploy (Joey's hands): `npx supabase functions deploy <fn> --project-ref ohmvlypcbrfkuudcuqub` (webhook only: `--no-verify-jwt`)
- Accounts (`auth.users`, 5): `joeyc` `3eb457d7-…` (Joey, NEVER a test target) · `joey2019pwtestbattery` `d3f1cfce-…` (Pro battery) · `joey2019pwtestfree` `87d14c9b-…` (never comp/seed/reset) · `joey2019pwtestonb` `c46470a0-…` (manual-use, not in `.env.test`) · `mecivietnam` (REAL customer, never touched)
- Test-account emails OK to name: `joey2019pwtest+battery@`, `+free@`, `+onb@gmail.com`. Passwords only in `.env.test`. No secret values in chat or docs, ever.
- Full-battery launch (the ONLY way — three OOM kills taught this): Chrome closed, laptop plugged in, run OUTSIDE Claude Code:
  `powershell.exe -NoProfile -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npx playwright test --workers=1 --reporter=list > battery-YYYY-MM-DD.log 2>&1' -WorkingDirectory 'C:\dev\titilinks' -WindowStyle Hidden"`
  Poll `tail -n 3`. Only the `N passed` line is a result. Push only on 0 failed. Worker crash `code=3221225794` with zero assertion failures = kill-collateral.
- Baseline: **785 passed / 0 failed / 59 skipped on 844** (`9a73b9b`, Sep 9). Not re-run since; 66 spec files now.
- Running state at handoff: **TL.STOR.8.1 was running in Claude Code when this was written** (see IMMEDIATELY OPEN). No dev server or battery known to be running.

## SEAT & PROTOCOL
You are the ARCHITECT (claude.ai / Cowork chat). Joey runs Claude Code (CC) in a terminal at `C:\dev\titilinks`, pastes your brick prompts in, and pastes CC's reports back. Joey is the product owner and the visual gate; Titi is the customer whose product decisions are final. **You are the expert — do the research yourself.** Clone the repo (`git clone` into a scratch dir), read files, grep, check npm/GitHub/docs on the web. Only hand CC work that has to happen on Joey's machine (edits, specs, guard, battery). Joey said it plainly this rev: "when you can research yourself via the files in the folder or github repo then you need to do that."

**RULE ZERO — verify before you claim.** Read the file before any claim about the code. After EVERY push, `git fetch` and confirm hash + file list on `origin/main` yourself.

**Connectors:** Device link (Joey's laptop) — request folder access to `C:\dev\titilinks`; `device_stage_files` / `device_list_dir` / `device_commit_files` work; `device_bash` mount is flaky after restarts. Supabase MCP exists but **CLAUDE.md line 43–44 forbids SQL from CLI/MCP, reads included** — the rev-10 architect broke this once (ROSTER.1 UUID lookup) and CC flagged it; the rule stands. Prod reads: give Joey the SELECT for the web SQL editor and he pastes the result. Vercel auto-deploys `main`.

## COMMUNICATION RULES (Joey's standing rules — follow exactly)
- Short, plain language. One step at a time. On paperwork, make the call and say what you did.
- **ONE CC prompt per message.** Never re-print a prompt Joey already ran. If a prompt must change before it runs, retire the ID and issue a NEW one (`TL.X.6` → `TL.X.7`). Retired: TL.SOC.6.
- **Model/effort OUTSIDE the fenced block**: "Recommended: Opus 5 · normal". Prefer Opus 5; Fable 5.1 only when necessary (Joey guards that budget).
- **Every prompt complete and self-contained** ("Do not take short cuts being lazy"). In prompts write `npm` forms (`npm run test -- …`, `npm exec tsc -- …`), never `npx` (repo scripts may use npx internally — fine).
- Unique brick ID in prompt title, commit subject, board.
- **No assumptions; surgical changes.** One question if intent is unclear. Check a feature's design intent before calling it a defect.
- Two plain-language paragraphs "what this brick does" before every prompt.
- Visual gate: specs write `tests/screenshots/`; architect stages and reviews them first; Joey sees only what needs his eyes. Joey often can't test by hand — automate with Playwright.
- Commit-and-push is a SEPARATE prompt after review (explicit paths, two-line HEREDOC with a blank line, CC appends the repo's attribution trailers, single push, print `HEAD`/`origin/main`). Docs-only bricks may fold commit+push into the build prompt.
- **Joey decides when the session ends** — never suggest calling it a day. Don't write a handoff unless asked.
- Joey runs a second project "luxvibe" (`client/src/pages/Home.tsx`, port 5000, `LV.*`); pastes from it are not to be acted on. His clipboard sometimes serves a stale report — if a paste repeats, say so rather than re-explain.
- If Joey is frustrated: cause in one sentence, fix the process, move on.

## HARD SAFETY RULES
1. NO browser automation against `joeyc`, ever. Harness goes through `tests/fixtures.ts` (default-deny write guard, `allowWrites()`, `withFreeUser()` — one door, two keys).
2. Prod SQL and edge deploys: Joey's hands. After a deploy, check `verify_jwt` per function (a redeploy keeps the old setting unless `config.toml` has a stanza — HYG.3 added them for `suggest-links`/`ai-enhance`).
3. Git: explicit staging (never `-A`/`-u`/`.`), never force. Untracked by decision: `audit-scratch/`, `reseed.sql`, `Claude outputs/`. Stale `.git/index.lock` recurs after crashes — CC may remove it when no git process runs, and must say so.
4. PROTECTED (printed-diff, hunk-by-hunk architect review): `EditableProfileView.tsx` (EPV), billing files (`stripe-webhook`, `reconcile-billing`, `_shared/plan-lifecycle.ts`, `_shared/billing.ts`, `referrals.ts`), gallery lightbox. Also `CLAUDE.md`'s own list: hero/crop/SmoothImage system, `useAuth.tsx`.
5. ONE CC session on the repo at a time. Never comp/seed/reset the free account.
6. Mobile onboarding is ruled correct and untouched.

## STATE OF THE REPO — commits since rev 9 (`9a73b9b`), oldest first
| Hash | Brick | What |
|---|---|---|
| a1cc195 | TL.HDR.OVL.1 | Editor camera/pencil overlays drop to `top-[68px]` below the public header; add-contact keeps its live position (`rightInsetPx` removed from `EditorStage`). Spec 65 |
| f0f48bb | TL.HYG.2 | `supabase/.temp` untracked; `Claude outputs/` ignored; PW-SCOPED-READS wording; `Login.tsx` password eye icon flipped to the conventional state |
| 9911f74 | TL.HYG.3 | `config.toml` stanzas `verify_jwt = true` for `suggest-links` + `ai-enhance`; Joey redeployed (v21/v19); probe 59/60 green; all 9 functions now `verify_jwt=true` except stripe-webhook by design |
| 33fcc17 | TL.AI.LINKS.1 | "Suggest with AI" glass button in the phone's links block (`LinksBlock` `data-testid="links-suggest-ai"`); `Editor.tsx` mounts `SuggestLinksDialog`; `onSuggestAi` threaded through EPV/EditorStage (no default). Spec 66 |
| da7b5fb | TL.TPL.CONTRAST.1/2 | Three template label colours fixed (Neon Nights, Conversion King, Insta Aesthetic); `scripts/contrast-audit.mjs` alpha-composites the real button surface per variant (fade label at alpha/2); audit is last in `npm run guard` — a template that fails contrast fails the guard. 29/29 |
| d23cbb6 | TL.DOC.ROSTER.1 | `CLAUDE.md` roster: five accounts |

Report-only this rev: TL.STOR.8.0 (storage triage). Closed as not-a-defect: TL.SOC.5 (X/Spotify rows were spec-seeded `social_icon_row` leftovers; Joey deleted them).

## PROD CHANGES THIS REV (Joey's hands, Sep 13)
- Storage DELETE policies created: `Owners can delete own avatars`, `Owners can delete own page assets` (both `to authenticated`, `(storage.foldername(name))[1] = auth.uid()::text`). `pg_policies` DELETE rows now: avatars, fonts, page assets, product images. **Not yet mirrored in `supabase/migrations/` — STOR.8.1 adds the file.**

## IMMEDIATELY OPEN — TL.STOR.8.1 (in flight in CC at handoff)
Prompt already issued; do NOT re-issue. Ask Joey for CC's report. It builds: (1) `handlePhotoSave` in EPV — check the two `pages.update` errors (today unchecked — a failed write still toasts success), capture old `avatar_url`/`avatar_original_url` before the page-1 write, `removePublicObject('avatars', old)` after success unless still referenced by another hero slot on the row; page 2 and hero videos deliberately excluded (their URLs live in `theme_json` and are captured by snapshots); (2) migration `20260913120000_stor8_avatars_pageassets_delete_policy.sql` mirroring prod; (3) spec 67 saving a hero twice as the battery account and proving via `storage.list()` (never HTTP) that save 1's objects are gone. Then: review the printed EPV diff hunk by hunk → commit-and-push prompt (files: EPV, the migration, spec 67) → Joey re-runs spec 67 against prod policies. Storage facts from 8.0: `src/lib/storage-cleanup.ts` `removePublicObject` is the one helper; 13 upload sites, cleanup only wired for `products`; every name is a fresh UUID so `upsert` never overwrites.

## BOARD (Joey picks or says "next")
1. **TL.AI.COST.1** — AI enhance sends the full-res crop and asks 2×; Replicate bills by OUTPUT megapixels ($0.80/run at 36 MP vs $0.05 under 4.4 MP). Bound input to 1024 px in both client entry points, server `MAX_IMAGE_BYTES` 10→2 MB, poll budget 75 s (< Supabase's 150 s idle timeout), `user.id` in error logs. Edge redeploy = Joey. Details: `docs/CROP-AI-AUDIT-2026-09.md` §B.
2. **TL.CROP.QUAL.1** — `crop.ts` `maxSize` 800→1440, WebP 0.85 w/ JPEG fallback; onboarding crops from the full original (today it downscales the SOURCE to 800 first → ~450 px heroes); AI-accept and "Save (no crop)" go through `getCroppedImage`. Two EPV sites → printed diff. Audit §A.2.1.
3. **TL.FACE.MP.1** — `@vladmandic/face-api` archived Feb 2025 (1.3 MB TFJS chunk); replace the inside of `detectFace()` with MediaPipe Face Detector (`@mediapipe/tasks-vision`, WASM + model self-hosted under `public/models`, threshold 0.5, eye-midpoint centring). Keep the framing math. Audit §A.2.2. Joey's steer: "build in-house where possible" — face detect stays in-browser (no service); upscaling is the one piece that needs a paid API; a canvas-only enhance (levels/sharpen) for free users is an option.
4. **TL.STOR.8.2** — replace-case cleanup in Gallery/FeaturedMedia/ProductCards (EventsEditor :564–567 is the pattern). **TL.STOR.8.3** — page-2 hero / video cleanup, gated on a snapshot-reference decision. **TL.SNAP.REF.1** — pre-existing bug: gallery delete removes the object while old snapshots still reference it (restore → broken image). **TL.STOR.6** — service-role sweep of 32 deleted-user folders (~215 MB), gated script.
5. Spec 02 onboarding-from-zero (needs a disposable-account reset routine); TL.ANLX.1–4; TL.BILL.RECON.4; TL.DEP.2 (vite 8, react-router 7, **react-easy-crop 6.x**); TL.ACCT.1; TL.PREV.HDR.2; TL.POLISH.1c; video-feed epic; audit P3s; add-contact rethink and louder Visitor state (ask first).
Ratified SKIPs: courses, Post-to-All, automations/DM, ambassador/agency, print-on-demand. Hidden by Titi (may return): Bigo Live, OnlyFans, Fansly, Privacy, FatalFans.

## LIVE FACTS (verified Sep 13 unless noted)
- 9 edge functions = repo; `verify_jwt` true on all but stripe-webhook. 47 migrations (+1 pending in STOR.8.1). Guard: 23 invariants + 19 `scripts/*.test.mjs` + contrast audit. Two typechecks: `tsc -p tsconfig.app.json`, `tsc -p tests/tsconfig.json`.
- `CLAUDE.md` is current (5 accounts) and is the rulebook CC reads — keep it true.
- Docs: `docs/AUDIT_rev6.md` (security/storage audit), `docs/HERO-AUDIT-2026-06.md`, `docs/CROP-AI-AUDIT-2026-09.md` (new this rev — commit it with this handoff).

## LESSONS ON RECORD (rev 9→10)
- **Do your own research.** Reading the repo and the web is the architect's job; CC's budget is for changes on Joey's machine. A read-only "triage prompt" the architect could have done in ten minutes is a miss.
- **A rule with no carve-out has no carve-out.** "Never run SQL from CLI/MCP" includes reads; don't soften a rule to fit what you did — route the read through Joey.
- **Model the surface the eye lands on.** The contrast audit was wrong twice: first defaulting to glass, then measuring a fade at its opaque edge. Both were fixed by asking "where does the text actually sit?"
- **Sequence gates so a green test can't be a lie.** A `remove()` with no DELETE policy returns success and removes nothing; the policy had to exist before the spec meant anything.
- **The repo can lie about prod.** Migrations declared DELETE policies prod never had. AUDIT_rev6 and the STOR.4 header were the truth; `pg_policies` is the proof.
- Still #1: read the feature's intent before calling it a defect; measure before theorising; launch long runs outside Claude Code.

## START-OF-SESSION CHECKLIST
1. Clone; `git log origin/main -1` must be `d23cbb6` (if later, read the new commits first — STOR.8.1 may have landed).
2. Request device folder access to `C:\dev\titilinks`. Ask Joey for the latest CC report (STOR.8.1) before proposing anything.
3. First paperwork brick (docs-only, commit+push folded in): track `docs/TITILINKS_HANDOFF_rev10.md` + `docs/CROP-AI-AUDIT-2026-09.md`; delete the untracked `docs/TITILINKS_HANDOFF_rev9.md`. **Only after STOR.8.1 is committed** — one CC session at a time.
4. Then finish STOR.8.1 per IMMEDIATELY OPEN, then the board in Joey's order.

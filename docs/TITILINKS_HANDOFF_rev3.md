# TITILINKS — ARCHITECT HAND-OFF rev 3 (Aug 12, 2026)

Supersedes TITILINKS_HANDOFF_rev2.md (Aug 11). Rev 2 went stale in one day: the Aug 12 session shipped 7 commits, 4 function deploys, prod DB changes, and Stripe endpoint changes. Every fact below was re-verified against the repo at HEAD `8432bf3` on Aug 12; facts only checkable against live dashboards (Supabase deploys, Stripe endpoint, prod SQL read-backs, test runs) are marked **[session-verified Aug 12]** — they were confirmed live in that session, not re-checked from this document's authoring environment.

---

## PICK-UP POINT (as of Aug 13) — start here

- **Last completed:** audit MEDIUM-1 closed end to end. `track_event` SECURITY DEFINER RPC is now the **only** write path into `events` — the permissive `WITH CHECK (true)` INSERT policy is dropped (read-back verified). Client moved onto the RPC in `55f66e1`. Prod verified post-drop by CC in the live browser: all `track_event` POSTs 204 across desktop and genuine iPhone device-mode loads. `get_public_tracking_pixels` is now plan-gated (`plan_allows(..., 'trackingPixels')`) in the same pass.
- **Next up, in order:** 1) commit this doc (DESIGN.md + PRODUCT.md ruled **keep**, committed Aug 13), 2) remaining audit MEDIUMs — storage bucket size/MIME limits, page-count entitlement enforcement, webhook reconciliation backstop, 3) CSP report-only rollout design. Landing redesign queued behind these (see OPEN ITEMS).
- **Blocked on Joey right now:** AI Studio Q1 (operator vs. generator).

---

## OPENING STATEMENT — Joey pastes this with the file

> Read TITILINKS_HANDOFF_rev3.md fully before anything. You are the architect seat (claude.ai) for TitiLinks. **BEFORE you write a single prompt or make any claim about this codebase, clone and read the repo: `https://github.com/jcolley2019/titilinks` (public). Use your bash tool. Do not reason from my descriptions, from Claude Code's reports, or from this document's summaries — read the actual files.** I run Claude Code (CC) and Codex in separate terminal sessions via Herdr; I paste your prompts to them and their reports back to you. I will also paste code directly into chat. FOLLOW MY COMMUNICATION RULES — short responses, one step at a time, questions to me at the top, and label every command with where it runs (CC/PowerShell vs. Supabase SQL editor). First step: clone the repo, confirm you've done it, then ask me what I want to work on.

---

## RULE ZERO — READ THE CODE · GREP BEFORE DESTROY

**Part 1 (from rev 1's failures): the repo is public. Clone it.** When a question is answerable from the code, answer it from the code — do not route it through Joey or CC. Reserve CC for things only a local session can see (untracked files, live DB, deploy state, test runs). The rev-1 window failed repeatedly by reasoning about code it had never read:

- Claimed the QR maker was broken. It wasn't — `QRCode.tsx` encodes the page URL directly.
- Called `/l/:code` and `/s/:slug` duplicates. They were different features with different tables.
- Escalated a test-fixture handle mismatch into "a Playwright spec deleted production data."
- Sent Joey a `supabase functions deploy` command to run in the **SQL editor**.
- Sent Joey hunting for `CANVA_*` secrets that a grep would have shown were never read.

**Part 2 (from the Aug 12 incident): grep for consumers before destroying.** No destructive prod action (DROP TABLE, function delete, secret removal) ships until the live codebase has been grepped for every consumer of that object and the zero-hit result shown. The `short_links` drop broke `/dashboard/analytics` in production because `useAnalytics.ts` still queried it — the compiler could not catch it because `types.ts` was regenerated before the drop. Recovery: caught same day by the first mobile Playwright run, fixed in `ff815ea`. The grep and its zero-hit output go **in the message** before the destructive instruction is handed to Joey.

Working grep pattern (run against a fresh `git pull` — CC commits to main, local clones drift):
`grep -rn "object_name" src/ supabase/functions/ --include="*.ts" --include="*.tsx"` with explicit `| grep -v` exclusions for near-name collisions (e.g. `short_links` vs `custom_short_links`).

---

## REPO / SYSTEM FACTS

- **Repo:** `https://github.com/jcolley2019/titilinks` (PUBLIC) · local at `C:\dev\titilinks`
- **origin/main HEAD:** `55f66e1` (verified via `git ls-remote`, Aug 13, 2026) — TL.SEC.EVENTS.1, event writes via `track_event` RPC. Rev 3 was originally authored at `8432bf3`.
- **Supabase prod ref:** `ohmvlypcbrfkuudcuqub` (JoeyC AI Pro org — **NOT visible to the Supabase MCP**; Joey runs all SQL manually in the web SQL editor)
- ⚠️ `supabase/config.toml:1` still points at an orphan project ref (`qnrrixfwicybhchvuutu`), **not** prod. Migrations drift from live schema — the Aug 12 CHECK constraints and drops have no migration files. Verify DB claims against the live DB, never migrations.
- **Hosting:** Vercel · live at titilinks.com · support@titilinks.com on Namecheap Private Email
- **Resend:** titilinks.com domain verified, key rotated (Aug 11)
- **Stripe:** LIVE MODE. monthly `price_1TyxwSGsBkpXqKefgLaRcaj8`, yearly `price_1TyxwSGsBkpXqKefJIFkofdu` (in `src/lib/billing.ts` + `supabase/functions/_shared/billing.ts`)
- **Test account:** `joey2019pwtest@gmail.com`, user `3eb457d7-8a07-4b2b-88e6-22222debfdc1`, page handle `joeyc`
- **CC models this window:** Sonnet 4.6 for mechanical/deletion bricks, Opus 5 for billing- and security-sensitive bricks. Codex CLI: `codex -a never -s workspace-write`.
- **PROTECTED:** the Hero/crop/SmoothImage/getCroppedCanvas system in `EditableProfileView.tsx`; `useAuth.tsx`. Sacred layout constants: HEADER_LIFT=25, HEADER_OFFSET_Y=95, CARDS_LIFT=85, HERO_EXTRA=60. One-off approvals (XSS.1's social-icon-row edit) do not generalize.

### Commits shipped Aug 12 (all verified on origin/main, oldest first)

| Hash | Brick | What it did |
|---|---|---|
| `6e877f9` | TL.RETIRE.L.1 | Remove the dead `/l/` short-link system — `ShortLinkRedirect.tsx`, `LinkTools.tsx`, the `App.tsx` route, `GoalsPanel` render sites (8 files) |
| `874962a` | TL.TYPES.1 | Regenerate `types.ts` from prod — `ai_usage_events`, `pending_grants`, `stripe_webhook_events` and the billing RPCs now typed; `short_links` gone |
| `3389ff7` | TL.BILL.REF.2 | Referral reward switched to Stripe customer credit balance ($9/side/grant) + `charge.refunded` / `charge.dispute.created` clawback (closes audit HIGH-2 + HIGH-3) |
| `bfd3e11` | TL.BILL.PIN.1 | Pin Stripe API version `2026-06-24.dahlia` in `_shared/stripe.ts`, imported by all four billing functions |
| `ff815ea` | TL.FIX.ANALYTICS.1 | Repoint the broken analytics page off dropped `short_links` onto working `custom_short_links` (the Rule Zero Part 2 recovery) |
| `4714bdf` | TL.DEP.AUDIT.1 | `npm audit fix`: 18 vulns → 4 |
| `8432bf3` | TL.SEC.HEADERS.1 | Baseline security headers in `vercel.json` |

### Deployed edge functions **[session-verified Aug 12]**

All four billing functions redeployed carrying the pinned `_shared/stripe.ts` (import confirmed in repo for all four): `stripe-webhook` **v9** (verify_jwt OFF — Stripe signs, no user JWT), `create-checkout-session` **v9**, `create-portal-session` **v8**, `delete-account` **v9**. The `shortlinks` edge function is **deleted** from prod.

### Stripe configuration **[session-verified Aug 12]**

- Endpoint `titilinks-live` now listens to **8 events** — added `charge.refunded` and `charge.dispute.created` to the prior 6. The webhook handler's `case` list matches all 8 (repo-verified: `stripe-webhook/index.ts`).
- API version pinned `2026-06-24.dahlia` (repo-verified) and verified equal to both the account default and the endpoint's dashboard-managed version. See BILLING DESIGN RECORD for the pin discipline.

### Prod DB changes **[session-verified Aug 12]**

- `short_links` table **dropped** (corroborated in repo: regenerated `types.ts` no longer contains it).
- CHECK constraints live: `custom_short_links_target_url_scheme` and `block_items_url_scheme`. `block_items` allows `null` / `''` / `'#'` / `https?:` / `mailto:` / `tel:`. No migration files exist for these — live DB is the source of truth.

### Prod DB changes **[session-verified Aug 13 — MEDIUM-1]**

- `public.track_event(p_page_id uuid, p_mode mode_type, p_event_type event_type, p_metadata jsonb default null)` — SECURITY DEFINER, `search_path` pinned, no-ops on unknown pages, nulls metadata over 2048 bytes, EXECUTE granted to anon + authenticated only. Read-back verified. **No migration file — live DB is canonical.**
- Policy `"Anyone can insert events"` on `events` **dropped**. Only the owner-gated SELECT policy remains (read-back verified). All event writes go through `track_event`.
- `get_public_tracking_pixels` **plan-gated**: body now includes `and public.plan_allows(coalesce(pr.plan, 'free'), 'trackingPixels')` — free-plan pages no longer fire pixels. Full body read-back verified; this closes the "unauditable, not plan-gated" audit finding.
- Post-drop prod verification: CC drove the live site in browser — desktop 3 loads and iPhone device-mode 4 loads, every `track_event` POST 204, zero 4xx/5xx.

### Security headers (repo-verified; live response **[session-verified Aug 12]** via curl of www.titilinks.com)

`vercel.json` now sets X-Content-Type-Options nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy strict-origin-when-cross-origin, HSTS max-age=31536000 includeSubDomains, Permissions-Policy camera/mic/geolocation off. **No CSP yet** — deliberately deferred (see OPEN ITEMS).

### Test batteries **[session-verified Aug 12]**

- Desktop Playwright: **300 passed / 0 failed**.
- Mobile Playwright: **275 passed / 0 failed / 27 intentional skips** — the **first-ever clean mobile baseline**. It's also what caught the analytics breakage. One flaky (spec 33) noted in OPEN ITEMS.

### Dependency audit (re-verified at HEAD)

`npm audit`: **4 remaining** — 1 high (`vite` ≤6.4.2, dev-server only), 3 moderate (`esbuild`, `react-router` 6.x, `react-router-dom` 6.x). Down from 18 before `4714bdf`.

---

## BILLING DESIGN RECORD

Decisions made in TL.BILL.REF.2 / TL.BILL.PIN.1 — read this before touching any billing code.

- **Referral reward = Stripe customer credit balance, NOT a coupon.** `REF_CREDIT_CENTS = 900` ($9.00) per side per grant, in `supabase/functions/_shared/referrals.ts`. Rationale: coupons **overwrite** each other at the customer level (rev 2's HIGH-2 — a 100%-off "once" coupon ate a full annual renewal), credit balances **stack** correctly across multiple grants, and credits make **clawback implementable** (debit the same amount back).
- **Clawback is wired through the idempotency ledger.** `charge.refunded` (refund) and `charge.dispute.created` (chargeback) both call `clawbackFor(...)`, which debits `REF_CREDIT_CENTS` from the referrer's credit balance for the affected grant. Unknown-customer / missing-charge-id events are acked with a warn, no write.
- **The pin discipline.** `STRIPE_API_VERSION = "2026-06-24.dahlia"` lives in `_shared/stripe.ts` and every billing function imports it. Bumping the pin is a **shape re-verification event** — webhook payload shapes must be re-checked against the new version before the bump ships. The endpoint's API version is **dashboard-managed** and does not follow the code pin; it must be kept matching **by hand**, and was verified equal (account default = endpoint = pin) on Aug 12.

---

## OPEN ITEMS

- **Full CSP (XSS.2).** Baseline headers shipped in `8432bf3`; a real Content-Security-Policy is still deferred because `script-src` can't drop `'unsafe-inline'` while PIXELS.1 injects third-party pixels, and Google Fonts + BRAND.1 custom fonts need allowances. Needs a report-only rollout design first. Defense-in-depth — `safeHref()` is the primary control.
- **react-router 6 → 7.** The 2 remaining moderate CVEs sit in 6.x; a fix is a real migration, and v6 is EOL. Not urgent, not trivial.
- **vite 5 → 8.** The 1 remaining high CVE — **dev-server only**, no production exposure. Bundle with the router migration or a tooling pass.
- **Audit MEDIUMs remaining** (from the Aug 11 CC report; forgeable `events` inserts and the un-gated `get_public_tracking_pixels` were closed Aug 13 as MEDIUM-1): storage buckets lack server-side size/MIME limits, page-count entitlement unenforced, no webhook reconciliation backstop.
- **File decomposition** — L effort, touches PROTECTED files. Parked deliberately.
- **`any`-cleanup** — do per-module as files get touched, not as one sweep.
- **`LivePreviewPanel.tsx` dead code** — zero imports anywhere in `src/` (repo-verified). Delete candidate; follow Rule Zero Part 2 anyway.
- **`useAnalytics` short-links fetch sits behind the `!pageData` early-return** — a user with no page never loads their short links on analytics. Pre-existing edge case, not from `ff815ea`. Fix whenever analytics is next opened.
- **Mobile spec 33 flaky once** — scroll geometry asserted 1065 vs `>1074`, passed on retry. Watch; don't chase yet.
- **Landing redesign** — `DESIGN.md` / `PRODUCT.md` (repo root, now tracked) are the spec, written Jun 19 in the Chase pipeline format; the code confirms it was never executed (the banned "slop tells" are still live in Features/Stats/Solution sections). Joey's ruling Aug 13: **still wanted, not urgent** — needs a Fable 5 design review and updated graphics before the campaign starts.
- **Canva Developer Portal** — check canva.com/developers for a stale app to delete (the `CANVA_*` secrets were never set; integration never functioned).

Done since rev 2, removed from this list: HIGH-2 + HIGH-3 (→ `3389ff7`, now the BILLING DESIGN RECORD), `/l/` retirement (`6e877f9` + prod drop), `types.ts` regeneration (`874962a`), the never-run mobile battery (now a clean 275/0 baseline).

---

## PRODUCT DECISION: AI STUDIO (scoped, not started)

**Canva OAuth was removed deliberately** — it required users to have Canva, was half-built, and carried plaintext tokens. Replacement is a native AI Studio.

**Competitive picture (researched Aug 11):**
- **Linktree** shipped AI design tools late 2025: "Enhance" (one-click makeover), "Restyle Your Image with AI," "Suggested Titles" — plus a real Canva partnership integration. Their AI *transforms and suggests*; it does not generate assets. Their AI caption generator sits in Pro ($9).
- **link.me** has "Linkme AI" — a floating chat **operator** that edits your profile, changes themes, manages links by conversation. PRO-gated. Also an "AI Compliance" tab. **Behavior never captured** — screenshots exist (2 batches in past chats, Apr + Jul 2026) but nobody documented what it does when used: does it preview before applying? Is there undo? Does compliance scan *fix* or only report?
- **Ratified positioning:** Beacons = AI-packed marketing · Linktree = scale + simplicity · link.me = creator-OS breadth with AI operator · **TitiLinks = page quality + bilingual + compliance + trustworthy AI**
- **Standing do-NOT-chase list:** Post-to-All, DM automations, print-on-demand, course builder, email CRM. Each is a separate company's worth of product.

**Proposed differentiation (not yet ratified by Joey):**
1. **Every AI action is reversible** — wire generation to Profile Snapshots (SNAP.1). "Nothing the AI does is permanent" is a trust claim no competitor makes and it serves the ratified position directly.
2. **Spanish-first, not translated** — native ES generation with a voice profile (as scoped in BLOG.1). Structurally hard for English-first competitors to copy.
3. **Generation constrained by the design system** — output respects DESIGN.md tokens and the user's brand kit, so AI assets don't look like slop dropped on the page.

**Scope:** backgrounds, avatar restyle, palette/font-pair generation. **Logos are explicitly out** (Joey's call — AI mangles text rendering, outputs raster, can't hold brand consistency; users upload logos they already have).

**Cost note:** image generation is 2–10¢/call vs. fractions of a cent for text. This argues for **Pro-gating generation** (unlike the setup helpers, which stayed free). "Unlimited AI backgrounds" is a stronger $9 upsell than advanced analytics.

**Infrastructure remains in place:** the `ai_usage_events` quota table is live and typed (in the regenerated `types.ts`), Replicate is wired (`ai-enhance`), Higgsfield MCP connected, atmosphere-plate pipeline proven on titiactriz.

**Two questions still unanswered by Joey:**
- **Q1:** Does the AI *act on the page* (operator, like link.me) or only *make assets* (generator)? Operator needs the snapshot layer first. **Still unanswered.**
- **Q2:** First brick — backgrounds recommended (highest visual payoff, no text-rendering problem, replaces what Canva was for). **Recommendation stands.**

---

## JOEY COMMUNICATION RULES (absolute)

- **SHORT responses.** Plain language, one-line explanation for any jargon.
- **ONE step at a time.**
- **Questions to Joey AT THE TOP**, clearly marked.
- **Label where every command runs.** SQL → Supabase web SQL editor. `git` / `npx supabase` / `codex` → CC or PowerShell. Mixing these wasted a cycle in rev 1.
- Joey is a learning vibe-coder. Answer his question directly first, then context.
- Opinions only when asked or when best practices genuinely matter. **He decides work order; advise, don't override.**
- When he pastes a CC permission prompt: answer 1/2/3 and why in one breath. Read-only = yes. Broad kills = NO, narrow to the PID. `$()` / expansion prompts on read-only commands = yes.
- When he's stressed: "paste this in session X," nothing else.
- **PowerShell syntax only** (Remove-Item, Get-ChildItem). All projects in `C:\dev`.
- Claude Code prompts as **plain fenced markdown code blocks in chat** — never artifacts, widgets, or canvas panels.
- At Opus 5 / high effort, apply these standards **proactively** — small adjacent fixes get executed with the brick, not deferred to backlog.

## CC PROMPT STANDARDS

Short ID + title as first line inside the block · CONTEXT paragraph · numbered STEPs · falsifiable VERIFY with concrete pass criteria · end with **"Do not commit."** One feature per prompt. Commit prompts separate: explicit file paths (**never `-A`**), two `-m` lines (ID+title / files+behavior), push, then `git ls-remote` to confirm the hash on origin/main. CC appends a `Co-Authored-By` trailer as a third `-m` per repo convention — this is expected, leave it.

**Read-first pattern is the default for anything non-trivial:** Step 1 is read-only reconnaissance with an explicit STOP; Step 2 is written against what CC actually found.

## ARCHITECT LAWS

1. **Read the repo before claiming anything about it.** (Rule Zero Part 1.)
2. **Grep for consumers before destroying.** No DROP / function delete / secret removal ships without the zero-hit grep shown in the message first. (Rule Zero Part 2 — earned Aug 12 by the `short_links` / analytics outage.)
3. Diagnose in the rendered/actual state before fixing. Visual/UI work is never ruled done from a passing report alone.
4. Specs must be falsifiable. Findings without file:line evidence are hypotheses, not defects.
5. Two misses on one fix = stop writing prompts, inspect actual state.
6. Secrets never committed or echoed into chat.
7. Supabase SQL via the web editor only. CC never runs `db push`.
8. Verify DB-dependent claims against the **live** DB, not migrations. (The `SECURITY DEFINER` critical was only confirmable via `pg_proc`; the Aug 12 CHECK constraints have no migration files at all.)
9. Deploy ordering matters when code and schema change together. Ship the code that stops referencing an object *before* destroying it — and grep first regardless (law 2 exists because ordering alone didn't save `useAnalytics`).
10. **CC verifies its own work in the rendered product before reporting done** — live browser (desktop AND mobile device-mode) plus the relevant Playwright specs, the Luxvibe standard. Joey is the final gate, never the test runner. His only hands-on step is prod SQL in the web editor (law 7). Verification bricks state what CC must observe, not what Joey must click. (Earned Aug 13: routing post-drop checks through Joey stalled the MEDIUM-1 close by a day; CC's browser closed it in five minutes.)

## BLOCKED ON JOEY (standing)

- Running CC/Codex and pasting reports back.
- Supabase dashboard checks and all SQL execution (MCP cannot reach this org).
- Stripe dashboard state — endpoint events and the dashboard-managed endpoint API version.
- Severity and work-order rulings. Architect advises; Joey decides.

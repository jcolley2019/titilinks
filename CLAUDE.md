# TitiLinks — Working Rules

## Editing discipline
- File contents on disk always win over memory/index/observations. Never edit from recall — always read the target region immediately before editing.
- One file per task unless explicitly told otherwise. Apply exact FIND/REPLACE edits; if an anchor doesn't match or is ambiguous, STOP and flag it — never improvise.
- Never refactor, rename, or "improve" code outside the requested change.
- Architect the right home for a feature up front. Don't drop a control into a convenient-but-wrong surface meaning to relocate it later — that breeds duplicates and rework. Decide where it belongs and build it there once.
- Reuse what already exists. Before adding any UI, find the component, pattern, and sizing the app already uses for that thing and match it. Don't reinvent a control that already ships.

## Layout & fit — verify BEFORE handing off any UI change
This is the #1 source of rework. Editors and menus in this app render in TWO widths:
- **Slide-in panel** (`panelMode`) — roughly phone width, the narrow one. This is the surface the user actually edits in. **Design to this width by default.**
- **Wide popup `Dialog`** — the fallback, much wider.

Rules:
- Before exposing or editing any menu/editor UI, confirm which surface it renders in and verify the layout fits the NARROW panel.
- In the panel: single-column fields, full-width inputs, `truncate` on anything long (URLs, labels). No multi-column grids in the panel — they overflow off-screen.
- A component shared between panel and dialog is constrained by the panel. Make it fit there; the dialog has room to spare.
- Mentally render the change at panel width before writing it. If the right edge would clip, it's wrong — fix it first, don't ship it for the user to discover.

## Checks
- Run on every task: `npm run guard && npx tsc -p tsconfig.app.json --noEmit`
  (bare `tsc --noEmit` is a false pass — the root config checks zero files).
- End every task with that check + `git diff --stat`, then STOP. The user reviews the diff and commits — the agent never commits.

## Git
- NEVER `git add -A` or `git add .` — untracked screenshots/docs must stay untracked. Use `git add -u` plus explicitly named new files.
- Never commit, merge, push, or touch main unless the task explicitly says to.
- Never force-push.

## Protected — do not modify without an explicit task naming them
- Hero / crop / SmoothImage / getCroppedCanvas system in EditableProfileView.tsx
- src/hooks/useAuth.tsx

## Supabase
- Production project ref: ohmvlypcbrfkuudcuqub. supabase/config.toml line 1 points at an ORPHAN project — never `supabase db push` or `supabase link`.
- Edge function deploys require `--project-ref ohmvlypcbrfkuudcuqub`.
- All SQL is run by the USER in the Supabase web SQL editor — never run DB/SQL from the CLI or MCP.

## Environment
- Windows + PowerShell semantics for any commands suggested to the user; the agent shell is bash.
# TitiLinks — Working Rules

## Editing discipline
- File contents on disk always win over memory/index/observations. Never edit from recall — always read the target region immediately before editing.
- One file per task unless explicitly told otherwise. Apply exact FIND/REPLACE edits; if an anchor doesn't match or is ambiguous, STOP and flag it — never improvise.
- Never refactor, rename, or "improve" code outside the requested change.

## Checks
- Typecheck: `npx tsc -p tsconfig.app.json --noEmit` (bare `tsc --noEmit` is a false pass — root config checks zero files).
- End every task with the typecheck + `git diff --stat`, then STOP.

## Git
- NEVER `git add -A` or `git add .` — untracked screenshots/docs must stay untracked. Use `git add -u` plus explicitly named new files.
- Never commit, merge, push, or touch main unless the task explicitly says to.
- Never force-push.

## Protected — do not modify without an explicit task naming them
- Hero/crop/SmoothImage/getCroppedCanvas system in EditableProfileView.tsx
- src/hooks/useAuth.tsx
- src/pages/Setup.tsx

## Supabase
- Production project ref: ohmvlypcbrfkuudcuqub. supabase/config.toml line 1 points at an ORPHAN project — never `supabase db push` or `supabase link`.
- Edge function deploys require `--project-ref ohmvlypcbrfkuudcuqub`.

## Environment
- Windows + PowerShell semantics for any commands suggested to the user; the agent shell is bash.

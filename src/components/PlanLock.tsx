// TL.PLAN.ENFORCE.3 — the lock's two UI atoms, for Pro items a Free owner has
// saved (src/hooks/usePlanLock.ts).
//
// PlanLockTag is the app's existing PRO pill (gold, Lock glyph — LinksEditor,
// ButtonSurfaceControls, the dashboard's catalog rows), made a component only
// because it now also carries the lock's full sentence as its hover title. It
// is content-sized and never shrinks (three letters wide): in the edit canvas's
// phone-width control bar the flex-1 title span and SampleTag take the squeeze.
//
// PlanLockNote is that sentence written out under a locked control (the font
// pickers, the animation chip rows) — single column, wraps, panel-width safe.
// A span, not a p: the locked font card is a button, which takes phrasing
// content only.
import { Lock } from 'lucide-react';

export function PlanLockTag({ hint }: { hint: string }) {
  return (
    <span
      data-testid="plan-lock-tag"
      title={hint}
      className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#C9A55C]/15 text-[#C9A55C] text-[10px] font-bold px-2 py-0.5"
    >
      <Lock className="h-2.5 w-2.5" /> PRO
    </span>
  );
}

export function PlanLockNote({ hint, testId = 'plan-lock-note' }: { hint: string; testId?: string }) {
  return (
    <span data-testid={testId} className="flex items-start gap-1.5 text-[11px] leading-snug text-[#C9A55C]">
      <Lock className="h-3 w-3 mt-px flex-shrink-0" />
      <span className="min-w-0">{hint}</span>
    </span>
  );
}

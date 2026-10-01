// TL.PLAN.ENFORCE.3 — the owner-side plan lock.
//
// Ruling: Pro items a Free owner has saved stay in the editor, shown in place
// and LOCKED (dimmed, a PRO pill, read-only) until they upgrade. Nothing is
// mutated on downgrade, so re-upgrading unlocks everything with no action.
// WHICH saved things lock is src/lib/plan-gate.ts (the owner-side predicates,
// on the same entitlements as the visitor gates); this hook binds them to the
// signed-in owner's plan and to the copy.
//
// Keyed on the OWNER's own plan (useEntitlements), never on EditableProfileView's
// visitorPlan prop — that one belongs to the visitor surfaces. Nothing locks
// while the plan is still loading: useEntitlements reports 'free' until its
// query lands, and a Pro owner must never see a lock flash.
//
// A tap on anything locked raises the shared Pro upsell (useProUpsell — the one
// upgrade CTA every gate in the app uses), titled with the feature's existing
// "… is a Pro feature" line and described by the lock's full sentence: what
// visitors get meanwhile and what the owner can still do.

import { useMemo } from 'react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useLanguage } from '@/hooks/useLanguage';
import { useProUpsell } from '@/hooks/useProUpsell';
import {
  isAnimationLocked,
  isFontLocked,
  lockedBlockFeature,
  visiblePageCount,
  type LockedBlockFeature,
} from '@/lib/plan-gate';

export type LockFeature = LockedBlockFeature | 'page2' | 'customFonts' | 'linkAnimations';

const COPY: Record<LockFeature, { title: string; hint: string }> = {
  carousel: { title: 'dashboard.carouselProTitle', hint: 'editor.planLock.carousel' },
  emailSubscribe: { title: 'dashboard.emailSubscribeProTitle', hint: 'editor.planLock.emailSubscribe' },
  page2: { title: 'dashboard.pages.twoPagesProTitle', hint: 'editor.planLock.page2' },
  customFonts: { title: 'fonts.proTitle', hint: 'editor.planLock.font' },
  linkAnimations: { title: 'linksEditor.animations', hint: 'editor.planLock.animation' },
};

export function usePlanLock() {
  const { plan, isLoading } = useEntitlements();
  const { t } = useLanguage();
  const showUpsell = useProUpsell();
  const ready = !isLoading;

  return useMemo(() => ({
    /** The feature a saved block needs and the owner lacks — null = editable. */
    blockLock: (blockType: string): LockedBlockFeature | null =>
      ready ? lockedBlockFeature(plan, blockType) : null,
    /** The owner has more pages than their plan shows visitors. */
    pagesLocked: (pageCount: number): boolean =>
      ready && visiblePageCount(plan, pageCount) < pageCount,
    fontLocked: (fontKey: string | null | undefined): boolean =>
      ready && isFontLocked(plan, fontKey),
    animationLocked: (value: unknown): boolean =>
      ready && isAnimationLocked(plan, value),
    /** The lock's full sentence — hover title, note and upsell description. */
    hint: (feature: LockFeature): string => t(COPY[feature].hint),
    /** The upgrade CTA for a locked item. */
    upsell: (feature: LockFeature) => showUpsell(t(COPY[feature].title), t(COPY[feature].hint)),
  }), [ready, plan, t, showUpsell]);
}

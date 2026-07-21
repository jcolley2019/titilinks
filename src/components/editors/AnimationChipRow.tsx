// AnimationChipRow — ANIM.2. The six-chip animation picker row, extracted
// verbatim from ANIM.1's two per-item pickers (LinksEditor / PrimaryCtaEditor)
// so the new page-level Buttons-tab control is the SAME component, not a third
// copy. Chips live-preview their own effect via animationClass(id) (inert under
// prefers-reduced-motion); locked chips carry the small gold Lock. Gating and
// the upsell affordance stay in the CALLER's onPick/footer — this row only
// renders and reports taps, so each surface keeps its own toast + testids.
//
// Per-item pickers pass `showInherit` to lead with an Inherit chip (ANIM.2
// default: absent value = inherit the page-level effect). When the page has a
// paintable value, the Inherit chip names it and previews it.

import { Lock } from 'lucide-react';
import { ANIMATIONS, animationClass, isAnimationId, type AnimationId } from '@/lib/animations';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';

export interface AnimationChipRowProps {
  /** Current selection: 'inherit' | 'none' | an effect id. */
  value: string;
  /** Tap handler — the caller gates PRO picks and raises its own upsell. */
  onPick: (id: string) => void;
  /** entitlements.linkAnimations — false renders the lock on paintable chips. */
  canAnimations: boolean;
  /** data-testid prefix — each chip gets `${prefix}-${id}` (ANIM.1 ids kept). */
  testIdPrefix: string;
  /** Lead with an Inherit chip (per-item pickers only). */
  showInherit?: boolean;
  /** The page-level value an Inherit pick resolves to — names + previews the
   *  Inherit chip when it's a paintable effect. */
  inheritedValue?: unknown;
}

export function AnimationChipRow({
  value,
  onPick,
  canAnimations,
  testIdPrefix,
  showInherit = false,
  inheritedValue,
}: AnimationChipRowProps) {
  const { t } = useLanguage();

  const inheritedOpt = isAnimationId(inheritedValue)
    ? ANIMATIONS.find((a) => a.id === inheritedValue)
    : undefined;

  type Chip = { id: string; label: string; previewId: AnimationId | 'none' };
  const chips: Chip[] = [
    ...(showInherit
      ? [{
          id: 'inherit',
          label: inheritedOpt
            ? t('linksEditor.animationInheritOf').replace('{name}', t(inheritedOpt.labelKey))
            : t('linksEditor.animationInherit'),
          previewId: (inheritedOpt?.id ?? 'none') as AnimationId | 'none',
        }]
      : []),
    ...ANIMATIONS.map((a) => ({ id: a.id, label: t(a.labelKey), previewId: a.id })),
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {chips.map(({ id, label, previewId }) => {
        const selected = value === id;
        // Inherit and 'none' are always free; only paintable effects lock.
        const locked = !canAnimations && id !== 'none' && id !== 'inherit';
        return (
          <button
            key={id}
            type="button"
            data-testid={`${testIdPrefix}-${id}`}
            aria-pressed={selected}
            onClick={() => onPick(id)}
            className={cn(
              'relative py-2 text-xs font-semibold rounded-lg border-2 transition-all',
              animationClass(previewId),
              selected
                ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                : 'border-border text-muted-foreground',
            )}
          >
            {locked && <Lock className="absolute right-1 top-1 h-2.5 w-2.5 text-[#C9A55C]/70" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

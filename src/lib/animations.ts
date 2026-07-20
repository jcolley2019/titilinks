// ANIM.1 — link animation catalog + CSS class contract.
//
// Six subtle motion effects a creator can apply to a single link card or the
// primary CTA to draw the eye (Link.me parity; PRO-gated — see
// entitlements.linkAnimations, only `none` is free). This module is the SINGLE
// source of truth for the option set and the class contract; the keyframes that
// actually move pixels live in src/index.css under the ANIM.1 section, all
// wrapped in `@media (prefers-reduced-motion: no-preference)` so a visitor who
// prefers reduced motion gets a perfectly static, fully-functional button.
//
// Storage (self-flag): a per-link animation lives on block_items.style_json.animation
// (read in LinksBlock.buildLinkButton); the primary CTA stores it on its
// JSON-in-title config at blocks.title `.style.animation` (BlockStyleConfig.animation,
// read in PrimaryCtaBlock). Both feed LinkButton's `animation` prop.

export type AnimationId = 'none' | 'pulse' | 'shimmer' | 'bounce' | 'glow' | 'shake';

export interface AnimationOption {
  id: AnimationId;
  /** i18n key for the human label (EN/ES parity enforced by the guard). */
  labelKey: string;
}

/** The six options, in display order. `none` is first and is the only free
 *  option. Labels resolve through useLanguage `t()`. */
export const ANIMATIONS: readonly AnimationOption[] = [
  { id: 'none', labelKey: 'linksEditor.animationNone' },
  { id: 'pulse', labelKey: 'linksEditor.animationPulse' },
  { id: 'shimmer', labelKey: 'linksEditor.animationShimmer' },
  { id: 'bounce', labelKey: 'linksEditor.animationBounce' },
  { id: 'glow', labelKey: 'linksEditor.animationGlow' },
  { id: 'shake', labelKey: 'linksEditor.animationShake' },
] as const;

/** Just the ids, in display order. */
export const ANIMATION_IDS: readonly AnimationId[] = ANIMATIONS.map((a) => a.id);

/** True when `id` is a real, non-default animation option. Narrows unknown JSON
 *  values (style_json is free-form) down to a paintable effect. */
export function isAnimationId(id: unknown): id is Exclude<AnimationId, 'none'> {
  return typeof id === 'string' && id !== 'none' && ANIMATION_IDS.includes(id as AnimationId);
}

/** The CSS class that drives the effect, or '' for `none`/unknown. The class is
 *  inert unless index.css's `prefers-reduced-motion: no-preference` block matches. */
export function animationClass(id: unknown): string {
  return isAnimationId(id) ? `lb-anim-${id}` : '';
}

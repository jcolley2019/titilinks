/**
 * AIS.0 — "Set up my page" recommendation mapper.
 *
 * The DETERMINISTIC first brick of the AI Builder epic: a PURE function that
 * turns a two-question wizard answer set into a concrete preset pair + a
 * goal-driven setup checklist. No AI calls, no edge functions, no network — the
 * whole mapping is an explicit lookup so every Q1×Q2 combination is testable and
 * stable (see scripts/ais-recommend.test.mjs). A later AIS brick can swap this
 * out for a model-backed selector; the shape it returns is the contract.
 *
 * Q1 (persona) maps 1:1 to a TplCategory → the TOP pick is that category's
 * preset. Q2 (goal) drives the ALTERNATE ("or try") pick and the checklist.
 */
// Relative import (not the `@/` alias) so this module stays loadable under `tsx`
// for scripts/ais-recommend.test.mjs — matching the tpl-presets convention.
import { TPL_PRESETS, type TplCategory, type TplPreset } from './tpl-presets';

/** Q1 answer — one per TplCategory (1:1). */
export type Persona = TplCategory;

/** Q2 answer — the visitor's main goal for the page. */
export type Goal = 'get_messages' | 'sell' | 'grow_audience';

export interface WizardAnswers {
  persona: Persona;
  goal: Goal;
}

/** A single setup step shown on the success screen. `labelKey` is a plain t()
 *  UI key (EN+ES in useLanguage.tsx) — these are chrome, not seeded content. */
export interface ChecklistItem {
  id: string;
  labelKey: string;
}

export interface Recommendation {
  top: TplPreset;
  alternate: TplPreset;
  checklist: ChecklistItem[];
}

/** Q1 options, in display order. Persona id === TplCategory; the chip label
 *  reuses the already-localized `tpl.category.<id>` keys (no new strings). */
export const WIZARD_PERSONAS: { id: Persona; labelKey: string }[] = [
  { id: 'creator', labelKey: 'tpl.category.creator' },
  { id: 'booking', labelKey: 'tpl.category.booking' },
  { id: 'store', labelKey: 'tpl.category.store' },
  { id: 'music', labelKey: 'tpl.category.music' },
  { id: 'fitness', labelKey: 'tpl.category.fitness' },
  { id: 'local_business', labelKey: 'tpl.category.local_business' },
  { id: 'media', labelKey: 'tpl.category.media' },
  { id: 'minimal', labelKey: 'tpl.category.minimal' },
];

/** Q2 options, in display order. */
export const WIZARD_GOALS: { id: Goal; labelKey: string }[] = [
  { id: 'get_messages', labelKey: 'wizard.goal.get_messages' },
  { id: 'sell', labelKey: 'wizard.goal.sell' },
  { id: 'grow_audience', labelKey: 'wizard.goal.grow_audience' },
];

/**
 * grow_audience alternate — an explicit persona→category affinity table (media
 * vs music), NO cleverness. Two entries are deliberately flipped to avoid a
 * collision with the top pick: a 'music' persona (top === música) grows toward
 * 'media', and a 'media' persona (top === estudio) grows toward 'music'.
 */
const GROW_AFFINITY: Record<Persona, TplCategory> = {
  creator: 'media',
  booking: 'media',
  store: 'media',
  music: 'media', // top is 'music' → send to media so top ≠ alternate
  fitness: 'music',
  local_business: 'media',
  media: 'music', // top is 'media' → send to music so top ≠ alternate
  minimal: 'media',
};

/**
 * The category the alternate pick comes from, given the persona + goal.
 *  - sell         → the store preset, unless the persona already IS store
 *                   (then local_business, the other commerce composition).
 *  - get_messages → the booking preset, unless the persona already IS booking
 *                   (then local_business, a WhatsApp-orders page).
 *  - grow_audience→ the GROW_AFFINITY table (media | music), pre-de-collided.
 * Every persona×goal combination yields a category distinct from the persona's
 * own (verified exhaustively in the unit suite), so top ≠ alternate always.
 */
function alternateCategory(persona: Persona, goal: Goal): TplCategory {
  if (goal === 'sell') {
    return persona === 'store' ? 'local_business' : 'store';
  }
  if (goal === 'get_messages') {
    return persona === 'booking' ? 'local_business' : 'booking';
  }
  return GROW_AFFINITY[persona];
}

/** The goal-driven setup checklist (English-canonical via t() keys). */
const CHECKLISTS: Record<Goal, ChecklistItem[]> = {
  get_messages: [
    { id: 'whatsapp', labelKey: 'wizard.checklist.whatsapp' },
    { id: 'bookingCta', labelKey: 'wizard.checklist.bookingCta' },
  ],
  sell: [
    { id: 'products', labelKey: 'wizard.checklist.products' },
    { id: 'payout', labelKey: 'wizard.checklist.payout' },
  ],
  grow_audience: [
    { id: 'socials', labelKey: 'wizard.checklist.socials' },
    // AIS.0b: the avatar flow accepts a still photo OR a hero video, so the row
    // is named for both — its check is satisfied by either.
    { id: 'profileMedia', labelKey: 'wizard.checklist.profileMedia' },
  ],
};

/** Resolve the single preset registered for a category (1:1 by construction). */
function presetForCategory(category: TplCategory): TplPreset {
  const preset = TPL_PRESETS.find((p) => p.category === category);
  if (!preset) throw new Error(`ais-recommend: no preset for category "${category}"`);
  return preset;
}

/**
 * Pure mapper: answers → { top, alternate, checklist }. Deterministic and
 * side-effect-free. `top` is the persona's own composition; `alternate` is a
 * goal-biased second option guaranteed distinct from `top`.
 */
export function recommendPresets(answers: WizardAnswers): Recommendation {
  const top = presetForCategory(answers.persona);
  const alternate = presetForCategory(alternateCategory(answers.persona, answers.goal));
  return {
    top,
    alternate,
    checklist: CHECKLISTS[answers.goal],
  };
}

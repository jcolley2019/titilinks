// TL.PLAN.ENFORCE.2 — STRICT plan enforcement on visitor surfaces.
//
// Ruling: when the page owner's plan lacks a feature, a VISITOR gets the
// Free-tier render of it, whatever is saved. Gate at RENDER only — saved rows
// are never modified or deleted, so re-upgrading restores everything with no
// action. The owner's edit canvas is not a visitor surface and is not gated
// here.
//
// Applied at the same visitor boundaries as the sample-item filter
// (src/lib/placeholder-item.ts): PublicProfile's block path and the editor's
// visitor preview (Editor.tsx visitorBlocks) run gateBlocksForVisitor BEFORE
// stripSampleItems, so a carousel rendered as links that holds only samples
// still vanishes; EditableProfileView, when handed the owner's plan, gates the
// theme (page font + page-level animation), the per-block fonts and the page
// switcher.
//
// Every rule keys on ENTITLEMENTS through can() — no plan names in here.
// Pure: no React, no network. Unit-tested by scripts/plan-gate.test.mjs.

import { can, getEntitlements } from '@/lib/entitlements';
import { isCustomFontKey } from '@/lib/fonts';
import { isAnimationId } from '@/lib/animations';
import { DEFAULT_THEME, type ThemeJson } from '@/lib/theme-defaults';

type PlanLike = string | null | undefined;

/** The Free-tier font a gated `custom:` key renders as — the default theme's. */
const FREE_FONT = DEFAULT_THEME.typography.font;

/** customFonts: an uploaded `custom:<family>` key renders as the default font
 *  when the owner's plan can't use custom fonts. Catalog keys, '' and absent
 *  pass through unchanged. */
export function gateFontForVisitor<K extends string | null | undefined>(plan: PlanLike, fontKey: K): K | string {
  return isCustomFontKey(fontKey) && !can(plan, 'customFonts') ? FREE_FONT : fontKey;
}

/** maxPages: how many of the owner's pages a visitor may see. */
export function visiblePageCount(plan: PlanLike, pageCount: number): number {
  return Math.min(pageCount, getEntitlements(plan).maxPages);
}

// ── linkAnimations ──────────────────────────────────────────────────────────
// The SAME shape the save-time strip removes (ANIM.1/ANIM.2), read back at
// render: a PAINTABLE `animation` value (isAnimationId — 'none' and absent are
// always free) in the three places it is stored —
//   • theme_json.buttons.animation          DesignEditor.saveTheme
//   • block_items.style_json.animation      LinksEditor.buildItemPayload
//   • blocks.title JSON `.style.animation`  PrimaryCtaEditor.onSubmit

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** An item's style_json without a paintable animation (null when nothing is
 *  left — LinksEditor's save rule). The same item when there is none. */
function stripItemAnimation<I extends { style_json?: unknown }>(item: I): I {
  const sj = item.style_json;
  if (!isObj(sj) || !isAnimationId(sj.animation)) return item;
  const next = { ...sj };
  delete next.animation;
  return { ...item, style_json: Object.keys(next).length ? next : null };
}

/** A JSON-in-title config without a paintable `.style.animation`. Non-JSON and
 *  animation-free titles come back untouched (same string). */
function stripTitleAnimation<T extends string | null | undefined>(title: T): T | string {
  if (!title) return title;
  let parsed: unknown;
  try { parsed = JSON.parse(title); } catch { return title; }
  if (!isObj(parsed) || !isObj(parsed.style) || !isAnimationId(parsed.style.animation)) return title;
  const style = { ...parsed.style };
  delete style.animation;
  return JSON.stringify({ ...parsed, style });
}

/** The fields gateBlocksForVisitor reads — satisfied by the pages' block rows. */
export interface GateableBlock {
  type: string;
  title?: string | null;
  items: Array<{ style_json?: unknown }>;
}

/**
 * The visitor's view of a page's blocks under the owner's plan:
 *   • emailSubscribe off → email_subscribe blocks are dropped;
 *   • carousel off       → carousel blocks render through the links path (only
 *     `type`, what the renderer switches on, changes — id, order, title and
 *     items are kept; the items are {url,label,image_url}, a subset of links);
 *   • linkAnimations off → paintable animations are stripped from item
 *     style_json and from the JSON-in-title `.style`.
 * Returns the input array untouched when the plan allows all three.
 */
export function gateBlocksForVisitor<B extends GateableBlock>(plan: PlanLike, blocks: B[]): B[] {
  const emailOk = can(plan, 'emailSubscribe');
  const carouselOk = can(plan, 'carousel');
  const animationsOk = can(plan, 'linkAnimations');
  if (emailOk && carouselOk && animationsOk) return blocks;

  const out: B[] = [];
  for (const block of blocks) {
    if (!emailOk && block.type === 'email_subscribe') continue;
    let next = block;
    if (!carouselOk && next.type === 'carousel') next = { ...next, type: 'links' } as B;
    if (!animationsOk) {
      const title = stripTitleAnimation(next.title);
      next = {
        ...next,
        ...(title !== next.title ? { title } : {}),
        items: next.items.map(stripItemAnimation),
      } as B;
    }
    out.push(next);
  }
  return out;
}

/** The theme-level half of the same gates: the page font (customFonts) and the
 *  page-level button animation (linkAnimations). The same object when nothing
 *  is gated. */
export function gateThemeForVisitor(plan: PlanLike, theme: ThemeJson): ThemeJson {
  const font = gateFontForVisitor(plan, theme.typography.font);
  const dropAnimation = !can(plan, 'linkAnimations') && isAnimationId(theme.buttons.animation);
  if (font === theme.typography.font && !dropAnimation) return theme;
  return {
    ...theme,
    typography: font === theme.typography.font ? theme.typography : { ...theme.typography, font },
    buttons: dropAnimation ? { ...theme.buttons, animation: undefined } : theme.buttons,
  };
}

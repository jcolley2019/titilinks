// TP.F1 (THEME.PREMIUM.3 plan, section K) — the layer contract.
//
// Every page style and every premium theme paints in the same five layers,
// bottom to top. A new piece is placed by naming its layer here, never by
// picking a z-index that happens to work on one page: the hero's fade strip is
// the cautionary case — it lives in the content panel today, so it would paint
// over anything later put on the photo.
//
// Each layer's root carries data-layer="1" … "5" (layerProps) so
// tests/96-layers.spec.ts can find it. Today no root carries it yet: layers 1,
// 2 and 4 render inside src/components/EditableProfileView.tsx, which is
// protected, so the attribute lands with the brick that owns each region, and
// spec 96 finds today's roots by selectors that already exist.
//
// No React, no DOM. Proven on the public page by tests/96-layers.spec.ts.

import type { PageStyle } from '@/lib/theme-defaults';

/** The attribute a layer's root element carries. */
export const LAYER_ATTR = 'data-layer';

export type LayerId = 1 | 2 | 3 | 4 | 5;

export interface LayerDef {
  id: LayerId;
  key: 'media' | 'treatment' | 'photoText' | 'content' | 'fixed';
  /** What the layer holds. */
  holds: string;
  /** Where it is in the code today. */
  today: string;
}

/** The five layers, bottom to top. */
export const LAYERS: readonly LayerDef[] = [
  {
    id: 1, key: 'media',
    holds: 'The photo or video.',
    today: 'The hero photo box (data-testid="hero-sticky", z-index 1); on a full-screen page, the fixed photo layer (fixed inset-0 z-0).',
  },
  {
    id: 2, key: 'treatment',
    holds: 'Treatments: the fade shade, the dark shade, the two-tone.',
    today: "The full-screen page's gradient over its photo. The hero's fade strip is NOT here: it is a child of the content panel (layer 4), so it paints above anything placed on the photo. TP.F2 rebuilds the join.",
  },
  {
    id: 3, key: 'photoText',
    holds: 'Text on the photo: the name, the handle, a pill.',
    today: 'Does not exist. The name is inside the content panel (layer 4).',
  },
  {
    id: 4, key: 'content',
    holds: 'Scrolling content: the colour panel, the sheet, the band, the cards.',
    today: 'The content panel (z-index 10), the hero box\'s next sibling.',
  },
  {
    id: 5, key: 'fixed',
    holds: 'Fixed to the screen: the top header with the save-contact button, the docked bar.',
    today: 'PublicHeader (z-50) and its shade (z-40).',
  },
];

/** The rules every page style and theme follows. */
export const LAYER_RULES: readonly string[] = [
  'Layers 1, 2 and 3 are children of the same pinned box, in that order. Text on the photo is pinned with the photo and can never fall behind it or its treatments.',
  'A treatment is its own element above the photo, never a filter on the image element.',
  'Layer 4 is always above layers 1 to 3 and passes over them as the page scrolls. Its top edge (fade, clean edge, sheet or band) is part of layer 4.',
  'The docked bar and the header are outside the scrolling content, above layer 4 and below dialogs.',
  'Each layer\'s root carries data-layer="1" to "5" so the test can find it.',
];

/** The attribute a layer's root spreads: `<div {...layerProps(4)}>`. */
export function layerProps(id: LayerId): { 'data-layer': string } {
  return { [LAYER_ATTR]: String(id) } as { 'data-layer': string };
}

/** The CSS selector for a layer's root. */
export function layerSelector(id: LayerId): string {
  return `[${LAYER_ATTR}="${id}"]`;
}

/**
 * Where the name and handle live, per page style. A layer-4 name travels: it
 * rides up with the content as the page scrolls. A layer-3 name is pinned with
 * the photo and is covered by layer 4 from the bottom up. Today both page
 * styles keep the name in layer 4; each premium theme adds its row (and its
 * spec 96 case) in the brick that ships it.
 */
export const NAME_LAYER: { readonly [S in PageStyle]: 3 | 4 } = {
  // Lifted up over the foot of the photo; rides up with the panel while the
  // photo stays pinned behind and is covered.
  hero: 4,
  // On a see-through panel; name and cards slide up over the pinned photo.
  full_bleed: 4,
};

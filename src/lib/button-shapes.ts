import type { CSSProperties } from 'react';

// The global button-shape catalog (set in Design → Buttons; stored on
// theme.buttons.shape). pill/rounded/sharp come from border-radius; ticket/cut/
// torn from the .lb-shape-* clip-path/mask rules in index.css.
export const BUTTON_SHAPES: { key: string; label: string }[] = [
  { key: 'pill', label: 'Pill' },
  { key: 'rounded', label: 'Rounded' },
  { key: 'sharp', label: 'Square' },
  { key: 'ticket', label: 'Ticket' },
  { key: 'cut', label: 'Cut' },
  { key: 'torn', label: 'Torn' },
];

// Mini silhouette for a shape's picker swatch (the live page shows the true
// shape, including the ticket/torn mask which a tiny swatch can't render).
export function shapeSwatchStyle(key: string): CSSProperties {
  switch (key) {
    case 'pill': return { borderRadius: 9999 };
    case 'rounded': return { borderRadius: 6 };
    case 'sharp': return { borderRadius: 0 };
    case 'ticket': return { borderRadius: 4 };
    case 'cut': return { clipPath: 'polygon(5px 0,calc(100% - 5px) 0,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0 calc(100% - 5px),0 5px)' };
    case 'torn': return { borderRadius: 2 };
    default: return { borderRadius: 6 };
  }
}

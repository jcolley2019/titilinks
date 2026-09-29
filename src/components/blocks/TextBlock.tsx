// TextBlock — typographic block: optional heading + body paragraph, each with
// its own font, weight, size, and alignment. No items, no links.
// Config is JSON in blocks.title (see src/lib/text-block-config.ts).
// Renders nothing if both heading and body are empty.

import { cn } from '@/lib/utils';
import { resolveFontFamily } from '@/lib/fonts';
import { parseTextConfig, type ElementStyle } from '@/lib/text-block-config';
import { gateFontForVisitor } from '@/lib/plan-gate';
import type { Plan } from '@/lib/entitlements';
import type { ThemedBlockProps } from './types';

const SIZE_CLASS: Record<ElementStyle['size'], string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
};
// Headings render one step larger than their nominal size.
const HEADING_SIZE_CLASS: Record<ElementStyle['size'], string> = {
  sm: 'text-base',
  base: 'text-lg',
  lg: 'text-2xl',
};

function elementClasses(s: ElementStyle, isHeading: boolean, visitorPlan?: Plan): { className: string; fontFamily?: string } {
  const align = s.align === 'center' ? 'text-center' : s.align === 'right' ? 'text-right' : 'text-left';
  const sizeMap = isHeading ? HEADING_SIZE_CLASS : SIZE_CLASS;
  const size = sizeMap[s.size] ?? sizeMap.base;
  const weight = s.bold ? 'font-bold' : 'font-normal';
  // TL.PLAN.ENFORCE.2: on a visitor surface a custom font renders at the owner's tier.
  const font = visitorPlan ? gateFontForVisitor(visitorPlan, s.font) : s.font;
  return { className: cn(align, size, weight), fontFamily: resolveFontFamily(font) };
}

export function TextBlock({ block, theme, visitorPlan }: ThemedBlockProps & { visitorPlan?: Plan }) {
  const cfg = parseTextConfig(block.title);
  if (!cfg.heading && !cfg.body) return null;

  const h = elementClasses(cfg.headingStyle, true, visitorPlan);
  const b = elementClasses(cfg.bodyStyle, false, visitorPlan);

  return (
    <div className="px-1 py-2">
      {cfg.heading && (
        <h3
          className={cn('leading-snug', h.className)}
          style={{ color: theme.typography.text_color, fontFamily: h.fontFamily }}
        >
          {cfg.heading}
        </h3>
      )}
      {cfg.body && (
        <p
          className={cn('leading-relaxed whitespace-pre-line', b.className, cfg.heading && 'mt-1')}
          style={{ color: theme.typography.text_color, opacity: 0.85, fontFamily: b.fontFamily }}
        >
          {cfg.body}
        </p>
      )}
    </div>
  );
}

// TL.EDIT.SAMPLETAG.1 — a quiet pill in an edit-canvas block's control bar
// while the block still holds sample items (src/lib/placeholder-item.ts).
// Samples never reach a visitor, so this says so; it vanishes on its own once
// the samples are replaced. The control bar is phone-width in the editor: the
// title span is flex-1 (basis 0), so a content-sized pill would squeeze it to
// min-content and wrap it. The pill takes the same basis-0 share instead,
// never grows past its own text (max-w-max), and truncates in what is left.
import { useLanguage } from '@/hooks/useLanguage';

export function SampleTag({ count, total, color }: { count: number; total: number; color: string }) {
  const { t } = useLanguage();
  const label = count === total
    ? t('editor.sampleTag.all')
    : count === 1
      ? t('editor.sampleTag.one')
      : t('editor.sampleTag.many').replace('{count}', String(count));
  return (
    <span
      data-testid="sample-tag"
      title={t('editor.sampleTag.hint')}
      className="min-w-0 max-w-max flex-[1_1_0%] truncate rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)` }}
    >
      {label}
    </span>
  );
}

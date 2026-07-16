// ButtonSurfaceControls — FS.SURFACE.2b. The Buttons tab's background /
// tint / outline controls, rendered as one stacked section below the
// shape grid (one-page principle: no sub-tabs). Writes into
// DesignEditor's local theme draft via onPatch (= updateButtons);
// nothing persists until the tab's Update button runs saveTheme.
// Options are filtered THROUGH coerceFullBleedVariant so the editor
// can never offer a look the page can't render (spec 3b).
import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import type { ThemeJson } from '@/lib/theme-defaults';
import { coerceFullBleedVariant, ACTION_ACCENT, type ButtonVariant } from '@/lib/surface';
import { useLanguage } from '@/hooks/useLanguage';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type BgKey = 'solid' | 'semi' | 'fade' | 'clear';

const BG_OPTIONS: { key: BgKey; variant: ButtonVariant; labelKey: string }[] = [
  { key: 'solid', variant: 'filled', labelKey: 'design.bgSolid' },
  { key: 'semi', variant: 'glass', labelKey: 'design.bgSemi' },
  { key: 'fade', variant: 'fade', labelKey: 'design.bgFade' },
  { key: 'clear', variant: 'minimal', labelKey: 'design.bgClear' },
];

const OUTLINE_OPTIONS: { w: 0 | 1 | 2 | 3; labelKey: string }[] = [
  { w: 0, labelKey: 'design.outlineNone' },
  { w: 1, labelKey: 'design.outlineThin' },
  { w: 2, labelKey: 'design.outlineMedium' },
  { w: 3, labelKey: 'design.outlineThick' },
];

const CHIP_COLORS = ['#000000', '#ffffff', ACTION_ACCENT];

function hexToRgba(hex: string, a: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(255,255,255,${a})`;
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function ColorChips({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      {CHIP_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          className={cn(
            'h-7 w-7 rounded-full border-2 transition-all',
            value.toLowerCase() === c.toLowerCase()
              ? 'border-[#C9A55C] scale-110'
              : 'border-white/20 hover:border-white/50'
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function ButtonSurfaceControls({
  theme,
  onPatch,
}: {
  theme: ThemeJson;
  onPatch: (updates: Partial<ThemeJson['buttons']>) => void;
}) {
  const { t } = useLanguage();
  const [tintOpen, setTintOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);

  const buttons = theme.buttons;
  const v: ButtonVariant = (buttons.variant as ButtonVariant) ?? 'glass';
  const bgSel: BgKey =
    v === 'filled' ? 'solid' : v === 'fade' ? 'fade' : v === 'minimal' || v === 'outline' ? 'clear' : 'semi';
  const effOutline: number = buttons.outline_width ?? (v === 'outline' ? 1 : 0);
  const fill = buttons.fill_color || '#ffffff';
  const outlineColor = buttons.border_color || fill;

  // Hide (not disable) any option the live page would coerce away.
  const visibleBg = BG_OPTIONS.filter((o) => coerceFullBleedVariant(theme, o.variant) === o.variant);
  const showTint = bgSel !== 'clear';

  const miniSwatch = (key: BgKey): React.CSSProperties => {
    switch (key) {
      case 'solid':
        return { backgroundColor: fill };
      case 'semi':
        return {
          backgroundColor: hexToRgba(fill, 0.16),
          backdropFilter: 'blur(6px)',
          border: `1px solid ${hexToRgba(fill, 0.35)}`,
        };
      case 'fade':
        return { background: `linear-gradient(to bottom, ${hexToRgba(fill, 0.4)} 0%, ${hexToRgba(fill, 0)} 100%)` };
      case 'clear':
        return { backgroundColor: 'transparent', border: '1px dashed rgba(255,255,255,0.3)' };
    }
  };

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t('design.bgStyle')}</Label>
        <div className="grid grid-cols-2 gap-2">
          {visibleBg.map((o) => {
            const selected = bgSel === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => onPatch(v === 'outline' && buttons.outline_width === undefined ? { variant: o.variant, outline_width: 1 } : { variant: o.variant })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border-2 py-3 transition-all',
                  selected ? 'border-[#C9A55C] bg-[#C9A55C]/10' : 'border-border hover:border-primary/50'
                )}
              >
                <span className="h-4 w-14 rounded-full" style={miniSwatch(o.key)} />
                <span className={cn('text-xs font-semibold', selected ? 'text-[#C9A55C]' : 'text-muted-foreground')}>
                  {t(o.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t('design.bgStyleDesc')}</p>
      </div>

      {showTint && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('design.tintColor')}</Label>
          <div className="flex items-center gap-3">
            <ColorChips value={fill} onPick={(c) => onPatch({ fill_color: c })} />
            <button
              type="button"
              onClick={() => setTintOpen(!tintOpen)}
              className={cn(
                'h-7 w-7 rounded-full border-2 transition-all',
                tintOpen ? 'border-[#C9A55C]' : 'border-white/20 hover:border-white/50'
              )}
              style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
            />
          </div>
          {tintOpen && <HexColorPicker color={fill} onChange={(c) => onPatch({ fill_color: c })} style={{ width: '100%' }} />}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t('design.outline')}</Label>
        <div className="grid grid-cols-4 gap-2">
          {OUTLINE_OPTIONS.map((o) => {
            const selected = effOutline === o.w;
            return (
              <button
                key={o.w}
                type="button"
                onClick={() => onPatch(o.w === 0 && v === 'outline' ? { variant: 'minimal', outline_width: 0 } : { outline_width: o.w })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border-2 py-2.5 transition-all',
                  selected ? 'border-[#C9A55C] bg-[#C9A55C]/10' : 'border-border hover:border-primary/50'
                )}
              >
                <span
                  className="h-4 w-10 rounded-full"
                  style={{ border: o.w > 0 ? `${o.w}px solid ${outlineColor}` : '1px dashed rgba(255,255,255,0.25)' }}
                />
                <span className={cn('text-[11px] font-semibold', selected ? 'text-[#C9A55C]' : 'text-muted-foreground')}>
                  {t(o.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {effOutline > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('design.outlineColor')}</Label>
          <div className="flex items-center gap-3">
            <ColorChips value={outlineColor} onPick={(c) => onPatch({ border_color: c })} />
            <button
              type="button"
              onClick={() => setOutlineOpen(!outlineOpen)}
              className={cn(
                'h-7 w-7 rounded-full border-2 transition-all',
                outlineOpen ? 'border-[#C9A55C]' : 'border-white/20 hover:border-white/50'
              )}
              style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
            />
          </div>
          {outlineOpen && (
            <HexColorPicker color={outlineColor} onChange={(c) => onPatch({ border_color: c })} style={{ width: '100%' }} />
          )}
        </div>
      )}
    </div>
  );
}

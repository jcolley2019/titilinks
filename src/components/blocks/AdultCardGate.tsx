// ADULT.2a — the in-card 18+ disclaimer for link cards (the Link.me pattern).
//
// Link cards gate in place rather than through the modal: the card itself is
// replaced by this disclaimer until the visitor confirms their age. The item's
// URL is never passed here — it stays in LinksBlock's state, so no adult
// domain reaches the DOM before or after the reveal.
//
// Geometry mirrors LinkButton's velvet card tiers (src/index.css): big and
// small are cover-led (aspect-ratio), medium and button are height-led. The
// gate sits in the same grid slot as the card it replaces, so a pair row keeps
// its two half-width columns.

import { EyeOff } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

type GateSize = 'big' | 'medium' | 'small' | 'button';

interface AdultCardGateProps {
  /** Blurred behind the scrim when the item has one; otherwise a flat scrim. */
  imageUrl?: string | null;
  size: GateSize;
  span: 'full' | 'half';
  onContinue: () => void;
}

// Matches .lb-velvet.lb-size-* in src/index.css so the gate occupies exactly
// the footprint of the card it stands in for.
function shapeClass(size: GateSize, span: 'full' | 'half'): string {
  if (size === 'big') return span === 'half' ? 'aspect-square' : 'aspect-[16/10]';
  if (size === 'small') return span === 'half' ? 'aspect-[4/3]' : 'aspect-[16/7]';
  if (size === 'medium') return 'min-h-[64px]';
  return 'min-h-[44px]';
}

export function AdultCardGate({ imageUrl, size, span, onContinue }: AdultCardGateProps) {
  const { t } = useLanguage();
  // Short tiers can't fit stacked copy plus a button — they collapse to a
  // single centred confirm row.
  const compact = size === 'medium' || size === 'button';

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0e0c09] ${shapeClass(size, span)}`}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl"
        />
      )}
      <div className="absolute inset-0 bg-black/75" />

      <div
        className={`relative flex h-full w-full items-center justify-center ${
          compact ? 'gap-3 px-4 py-2' : 'flex-col gap-2 px-4 py-3 text-center'
        }`}
      >
        {!compact && (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#C9A55C]/30 bg-[#C9A55C]/15">
            <EyeOff className="h-4 w-4 text-[#C9A55C]" />
          </div>
        )}

        <div className={compact ? 'min-w-0 flex-1' : ''}>
          <p className={`font-semibold text-white ${compact ? 'truncate text-[13px]' : 'text-sm'}`}>
            {t('adultGate.cardTitle')}
          </p>
          {!compact && (
            <p className="mt-0.5 text-[11px] leading-snug text-white/60">{t('adultGate.cardBody')}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="flex-shrink-0 rounded-full bg-[#C9A55C] px-4 py-1.5 text-[12px] font-semibold tracking-wide text-[#0e0c09] transition-colors hover:bg-[#C9A55C]/90"
        >
          {t('adultGate.continue')}
        </button>
      </div>
    </div>
  );
}

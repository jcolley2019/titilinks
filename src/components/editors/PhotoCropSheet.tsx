// TL.GAL.3b — the gallery photo framing sheet.
//
// Door B of the crop plan: tap any photo in the Gallery panel and frame it here.
// The output is `style_json.crop` — react-easy-crop's croppedArea PERCENTAGES,
// stored verbatim and resolved back to CSS by src/lib/gallery-framing.ts. This
// sheet never rasterises anything: no canvas, no re-upload, no CORS (the crop
// engine in lib/crop.ts needs `crossOrigin` precisely because it DOES touch a
// canvas — framing by percentage sidesteps that whole class of failure).
//
// Two rules this file exists to keep:
//
//   1. GALLERY_MIN_ZOOM feeds BOTH the Cropper's minZoom and the slider's min.
//      Two independent floors drift, and then the slider dials a zoom the
//      cropper refuses (or the reverse) and the stored crop stops matching what
//      the user was shown.
//   2. The frame can never show tile background (TL.GAL.3b.1). minZoom is 1 —
//      cover-fit, the point where the photo exactly fills the square — and
//      restrictPosition keeps the window inside the photo. So a 9:16 photo
//      width-fills at the floor and pans vertically only; a wide one
//      height-fills and pans horizontally.
//
// Overlay mechanics follow the proven hero-crop pattern in EditableProfileView:
// portal to body, fixed inset-0, touchAction/overscroll none (preventDefault in
// a passive React listener is a no-op and only spams warnings), safe-area pad.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { useLanguage } from '@/hooks/useLanguage';
import { GALLERY_MIN_ZOOM, type GalleryCrop } from '@/lib/gallery-framing';

/** Ceiling of the zoom range. Like the floor, ONE constant feeds the Cropper
 *  and the slider — see rule 1 in the header. */
const GALLERY_MAX_ZOOM = 3;

/** react-easy-crop speaks {x,y,width,height}; we store {x,y,w,h}. */
const toArea = (c: GalleryCrop): Area => ({ x: c.x, y: c.y, width: c.w, height: c.h });
const fromArea = (a: Area): GalleryCrop => ({ x: a.x, y: a.y, w: a.width, h: a.height });

/**
 * Is the cropper sitting in its suggested (auto-cover) state?
 *
 * zoom 1 at offset 0 is exactly what `object-cover` already paints — the
 * unit-tested identity in gallery-framing. Applying from there stores NULL
 * rather than a numerically-equivalent crop, so an unframed photo keeps the
 * plain object-cover render path instead of carrying dead framing data that
 * would mis-frame it if the image were ever replaced.
 *
 * Epsilons, not equality: seeding from a saved crop round-trips through
 * getInitialCropFromCroppedAreaPercentages and lands a hair off exact.
 */
const isSuggested = (crop: Point, zoom: number) =>
  Math.abs(zoom - 1) < 1e-3 && Math.abs(crop.x) < 0.5 && Math.abs(crop.y) < 0.5;

interface PhotoCropSheetProps {
  /** Image to frame — a staged data URL or an already-uploaded public URL. */
  src: string;
  /** The photo's saved crop, or null for a photo that has never been framed. */
  crop: GalleryCrop | null;
  onCancel: () => void;
  /** null means "no crop" — the suggested framing, stored as absence. */
  onApply: (crop: GalleryCrop | null) => void;
}

export function PhotoCropSheet({ src, crop, onCancel, onApply }: PhotoCropSheetProps) {
  const { t } = useLanguage();
  const [point, setPoint] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  // Bumped by Reset to remount the Cropper WITHOUT a seed, so it recomputes the
  // suggested framing from scratch — initialCroppedAreaPercentages is only read
  // when the media loads, so re-seeding any other way is a no-op.
  const [seed, setSeed] = useState(0);

  // Lock background scroll while the sheet is up (the panel behind it scrolls).
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const scrollables = document.querySelectorAll<HTMLElement>('.overflow-y-auto, .overflow-auto');
    scrollables.forEach((el) => { el.style.overflow = 'hidden'; });
    return () => {
      document.body.style.overflow = '';
      scrollables.forEach((el) => { el.style.overflow = ''; });
    };
  }, []);

  // Esc cancels, like every other overlay in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const reset = () => {
    setPoint({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setSeed((s) => s + 1);
  };

  const apply = () => {
    // Suggested framing stores as absence; anything else stores the percentages
    // the cropper just reported.
    onApply(isSuggested(point, zoom) || !area ? null : fromArea(area));
  };

  // z-150 clears the editor panel (120) AND the toast viewport (140, see
  // src/components/ui/toast.tsx) — at an equal z the sheet would win only on
  // DOM order, and a toast firing behind an opaque overlay is invisible.
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 sm:p-4"
      style={{
        overflow: 'hidden',
        touchAction: 'none',
        overscrollBehavior: 'none',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* The panel this opens from is 420px wide, so the sheet matches it and
          the controls sit under the crop box on either surface. On a phone it
          fills the screen with the buttons pinned low; on a desktop it HUGS its
          content as a centred card — a full-height 420px column beside the
          panel strands Cancel/Apply below a screen of dead space. */}
      <div className="flex h-full w-full max-w-[420px] flex-col overflow-hidden bg-[#0e0c09] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-white/10">
        <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-white/10 px-3">
          <div className="w-8" />
          <p className="text-sm font-semibold text-white">{t('galleryEditor.cropTitle')}</p>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('galleryEditor.cropClose')}
            className="flex h-8 w-8 items-center justify-center text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="relative w-full flex-shrink-0 overflow-hidden bg-black" style={{ height: 'min(52dvh, 420px)' }}>
          <Cropper
            key={seed}
            image={src}
            crop={point}
            zoom={zoom}
            aspect={1}
            minZoom={GALLERY_MIN_ZOOM}
            maxZoom={GALLERY_MAX_ZOOM}
            // The window may not leave the photo — see rule 2 in the header.
            // (react-easy-crop's default, stated outright because this file
            // deliberately said the opposite until TL.GAL.3b.1.)
            restrictPosition
            initialCroppedAreaPercentages={crop && seed === 0 ? toArea(crop) : undefined}
            onCropChange={setPoint}
            onZoomChange={setZoom}
            onCropComplete={(percentages) => setArea(percentages)}
          />
        </div>

        {/* flex-1 on a phone so `mt-auto` pins the buttons to the bottom of the
            screen; flex-none on a desktop so the card ends under them. */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4 sm:flex-none">
          <p className="text-center text-xs leading-snug text-white/50">{t('galleryEditor.cropHint')}</p>

          <div className="flex w-full items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {t('galleryEditor.cropZoom')}
            </span>
            <input
              type="range"
              min={GALLERY_MIN_ZOOM}
              max={GALLERY_MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[#C9A55C]"
              aria-label={t('galleryEditor.cropZoom')}
            />
          </div>

          <button
            type="button"
            onClick={reset}
            className="h-11 w-full rounded-xl border border-[#C9A55C]/30 bg-[#C9A55C]/10 text-xs font-semibold text-[#C9A55C] transition-colors hover:bg-[#C9A55C]/20"
          >
            {t('galleryEditor.cropReset')}
          </button>

          <div className="mt-auto flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="h-12 flex-1 rounded-xl border border-white/20 bg-white/10 font-semibold text-white transition-colors hover:bg-white/20"
            >
              {t('blockEditor.cancel')}
            </button>
            <button
              type="button"
              onClick={apply}
              className="h-12 flex-1 rounded-xl bg-[#C9A55C] font-semibold text-[#0e0c09] transition-colors hover:bg-[#C9A55C]/90"
            >
              {t('galleryEditor.cropApply')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

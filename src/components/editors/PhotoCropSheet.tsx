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
//
// IMG.FIT.1 — the ONE picture fitter for the app. With the optional `fit` prop
// the same sheet also offers "Fit whole picture" (the picture shown whole on a
// background colour) beside today's Fill cropper, seeded from the item's
// style_json and handing back one PictureFitChoice. It knows only a style_json
// and a box aspect, never what it is serving. Without `fit` the DOM and the
// behaviour are today's, byte for byte — the gallery and the events poster
// keep their onApply(crop | null) contract.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { useLanguage } from '@/hooks/useLanguage';
import { GALLERY_MIN_ZOOM, type GalleryCrop } from '@/lib/gallery-framing';
import { pictureFitSeed, type PictureFitChoice } from '@/lib/picture-fit';
import { analyzePictureEdge } from '@/lib/logo-detect';

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

/** IMG.FIT.1 — opt-in Fill / Fit support. */
export interface PictureFitSheetOptions {
  /** The item's style_json: seeds the mode, the window and the background. */
  styleJson: unknown;
  /** The picture's edge colour when the caller already read it (null = read,
   *  nothing usable). Undefined → the sheet reads it itself, without waiting. */
  edgeColor?: string | null;
  /** One choice: cover (suggested Fill), crop (+ the frame's aspect) or fit (+ bg). */
  onApply: (choice: PictureFitChoice) => void;
}

interface PhotoCropSheetBaseProps {
  /** Image to frame — a staged data URL or an already-uploaded public URL. */
  src: string;
  /** The crop window's aspect (width / height). Defaults to the gallery's
   *  square tile; the events poster passes EVENT_POSTER_ASPECT (TL.EVNT
   *  Stage 3a.3). MUST equal the aspect of the box the consumer paints the
   *  resolved crop into — the stored percentages assume the window and the
   *  render box are the same shape, and a mismatch skews the image. */
  aspect?: number;
  /** IMG.FIT.1: the header title. Default: the gallery's "Frame photo". */
  title?: string;
  onCancel: () => void;
}

type PhotoCropSheetProps = PhotoCropSheetBaseProps & (
  | {
      fit?: undefined;
      /** The photo's saved crop, or null for a photo that has never been framed. */
      crop: GalleryCrop | null;
      /** null means "no crop" — the suggested framing, stored as absence. */
      onApply: (crop: GalleryCrop | null) => void;
    }
  | {
      /** IMG.FIT.1: with this, the sheet seeds itself from `fit.styleJson` and
       *  answers through `fit.onApply`. */
      fit: PictureFitSheetOptions;
      crop?: undefined;
      onApply?: undefined;
    }
);

/** The two fixed backgrounds a fitted picture can sit on. */
const FIT_WHITE = '#ffffff';
const FIT_BLACK = '#000000';
type BgPick = 'auto' | 'white' | 'black' | 'stored' | null;
const sameColor = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
/** The pick a stored background reads as. */
const pickFor = (bg: string | null, edge: string | null | undefined): BgPick =>
  !bg ? null : sameColor(bg, edge) ? 'auto' : sameColor(bg, FIT_WHITE) ? 'white' : sameColor(bg, FIT_BLACK) ? 'black' : 'stored';

export function PhotoCropSheet(props: PhotoCropSheetProps) {
  const { src, aspect = 1, title, onCancel } = props;
  const fit = props.fit;
  const { t } = useLanguage();
  // IMG.FIT.1: read once, at open — the sheet frames what the item held then.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fitSeed = useMemo(() => (fit ? pictureFitSeed(fit.styleJson, aspect) : null), []);
  const crop = fit ? fitSeed?.crop ?? null : props.crop;
  const [mode, setMode] = useState<'fill' | 'fit'>(fitSeed?.mode ?? 'fill');
  const [edge, setEdge] = useState<string | null | undefined>(fit?.edgeColor);
  const [bgPick, setBgPick] = useState<BgPick>(() => pickFor(fitSeed?.bg ?? null, fit?.edgeColor));
  const [bgTouched, setBgTouched] = useState(false);
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

  // IMG.FIT.1: read the picture's edge colour when the caller did not, without
  // holding the sheet for it. A picture that cannot be read (no CORS) simply
  // never offers Auto.
  useEffect(() => {
    if (!fit || fit.edgeColor !== undefined) return;
    let alive = true;
    analyzePictureEdge(src).then((r) => { if (alive) setEdge(r ? r.edgeColor : null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Once a colour is read, Auto is the default: an untouched pick with no
  // stored background adopts it, and a stored background equal to it reads as
  // Auto rather than as the fixed chip of the same value.
  useEffect(() => {
    if (!fit || !edge || bgTouched) return;
    setBgPick((p) => (p === null || pickFor(fitSeed?.bg ?? null, edge) === 'auto' ? 'auto' : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge]);

  const bgValue: string | null =
    bgPick === 'auto' ? edge ?? fitSeed?.bg ?? null
      : bgPick === 'white' ? FIT_WHITE
        : bgPick === 'black' ? FIT_BLACK
          : bgPick === 'stored' ? fitSeed?.bg ?? null
            : null;
  const pickBg = (p: BgPick) => { setBgTouched(true); setBgPick(p); };

  const reset = () => {
    setPoint({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setSeed((s) => s + 1);
  };

  const apply = () => {
    if (!fit) {
      // Suggested framing stores as absence; anything else stores the percentages
      // the cropper just reported.
      props.onApply?.(isSuggested(point, zoom) || !area ? null : fromArea(area));
      return;
    }
    if (mode === 'fit') {
      fit.onApply({ mode: 'fit', bg: bgValue });
      return;
    }
    fit.onApply(isSuggested(point, zoom) || !area ? { mode: 'cover' } : { mode: 'crop', crop: fromArea(area), aspect });
  };

  const bgChips: { id: Exclude<BgPick, 'stored' | null>; label: string; color: string }[] = [
    ...(edge ? [{ id: 'auto' as const, label: t('pictureFit.bgAuto'), color: edge }] : []),
    { id: 'white', label: t('pictureFit.bgWhite'), color: FIT_WHITE },
    { id: 'black', label: t('pictureFit.bgBlack'), color: FIT_BLACK },
  ];
  const chipClass = (on: boolean) =>
    `flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border-2 px-2 text-xs font-semibold transition-colors ${
      on ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]' : 'border-white/15 text-white/60 hover:text-white'
    }`;

  // z-150 clears the editor panel (120) AND the toast viewport (140, see
  // src/components/ui/toast.tsx) — at an equal z the sheet would win only on
  // DOM order, and a toast firing behind an opaque overlay is invisible.
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 sm:p-4"
      data-testid={fit ? 'picture-fit-sheet' : undefined}
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
          <p className="text-sm font-semibold text-white">{title ?? t('galleryEditor.cropTitle')}</p>
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
            aspect={aspect}
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
          {/* IMG.FIT.1 Fit: a box of the card's own aspect, painted in the
              chosen background, with the whole picture inside it. It covers
              the cropper, which stays mounted underneath so switching back to
              Fill keeps the framing. No background chosen → a neutral check. */}
          {fit && mode === 'fit' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black p-4">
              <div
                data-testid="fit-preview"
                className="relative overflow-hidden"
                style={{
                  aspectRatio: String(aspect),
                  width: `min(100%, calc((min(52dvh, 420px) - 2rem) * ${aspect}))`,
                  background: bgValue
                    ?? 'repeating-conic-gradient(#2a2620 0% 25%, #1a1814 0% 50%) 0 0 / 16px 16px',
                }}
              >
                <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
              </div>
            </div>
          )}
        </div>

        {/* flex-1 on a phone so `mt-auto` pins the buttons to the bottom of the
            screen; flex-none on a desktop so the card ends under them. */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4 sm:flex-none">
          {/* IMG.FIT.1: Fill the card | Fit whole picture, above the zoom row.
              Labels truncate rather than push the sheet past a 360 px phone. */}
          {fit && (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={title ?? t('pictureFit.title')}>
              {([
                { id: 'fill', label: t('pictureFit.fill') },
                { id: 'fit', label: t('pictureFit.fit') },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`fit-mode-${id}`}
                  aria-pressed={mode === id}
                  title={label}
                  onClick={() => setMode(id)}
                  className={chipClass(mode === id)}
                >
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-xs leading-snug text-white/50">
            {fit && mode === 'fit' ? t('pictureFit.fitHint') : t('galleryEditor.cropHint')}
          </p>

          {fit && mode === 'fit' && (
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-wider text-white/40">
                {t('pictureFit.background')}
              </span>
              <div className="flex w-full gap-2">
                {bgChips.map(({ id, label, color }) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={`fit-bg-${id}`}
                    aria-pressed={bgPick === id}
                    title={label}
                    onClick={() => pickBg(id)}
                    className={`flex-1 ${chipClass(bgPick === id)}`}
                  >
                    <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full border border-white/30" style={{ background: color }} />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'fill' && (
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
          )}

          {mode === 'fill' && (
          <button
            type="button"
            onClick={reset}
            className="h-11 w-full rounded-xl border border-[#C9A55C]/30 bg-[#C9A55C]/10 text-xs font-semibold text-[#C9A55C] transition-colors hover:bg-[#C9A55C]/20"
          >
            {t('galleryEditor.cropReset')}
          </button>
          )}

          <div className="mt-auto flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              data-testid={fit ? 'picture-fit-cancel' : undefined}
              className="h-12 flex-1 rounded-xl border border-white/20 bg-white/10 font-semibold text-white transition-colors hover:bg-white/20"
            >
              {t('blockEditor.cancel')}
            </button>
            <button
              type="button"
              onClick={apply}
              data-testid={fit ? 'picture-fit-apply' : undefined}
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

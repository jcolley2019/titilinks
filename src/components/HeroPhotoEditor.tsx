/**
 * PHOTO.EDITOR.1 — the hero photo editor: ONE screen, shell included, for
 * sign-up, the editor's camera and pencil, and Page 2's own hero. The two
 * callers render this component and nothing else, so they cannot differ.
 *
 * The photo sits behind an outline box in the page's shape (the hero box, or
 * the whole screen on a full-screen page). Drag to move, slider to zoom —
 * manual only. OK bakes through bakeHeroPhoto below, the one function every
 * hero crop goes through: the display file is the framed area plus the margin
 * other screen shapes can show (heroDisplayRegion), and the framed WINDOW is
 * stored against that file, so the page paints exactly what was framed here.
 *
 * ## Auto enhance, shown in the cropper
 *
 * The enhanced look is shown by swapping the Cropper's `image` for an enhanced
 * copy of the WHOLE picture (same aspect, long side at most 1600 px); switch
 * off, the Cropper holds the real source itself. Two facts about
 * react-easy-crop make that safe (Stage 0 measured the framed area staying
 * within 0.04 percent across a swap, at rest and under a held pointer):
 *   - every media load re-applies `initialCroppedAreaPercentages` while the prop
 *     is present, so it is passed for the FIRST load of a picture only; without
 *     it `crop` and `zoom` are controlled and stay where they are;
 *   - `onMediaLoaded` and `onCropComplete`'s pixel area describe whichever
 *     picture is loaded, so the bake never reads them: it takes the framed area
 *     in PERCENT times the real source's natural size, kept from that source's
 *     own first load.
 *
 * Turning the switch on analyses ONCE, on the area framed at that moment (or
 * re-uses the stored params when the editor reopened on a stored enhancement
 * and the switch was not touched). A strength change repaints with the same
 * params; a drag or a zoom never re-analyses; the bake paints exactly the
 * params the preview shows. The canvas work stays in its own lazy chunk
 * (loadHeroEnhanceCanvas): it is fetched only when the switch is used or a
 * stored enhancement is reopened.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/hooks/useLanguage';
import { getCroppedImage } from '@/lib/crop';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '@/lib/device-presets';
import { HERO_BOX_ASPECTS, heroDisplayRegion } from '@/lib/hero-window';
import { writePictureFit } from '@/lib/picture-fit';
import { loadHeroEnhanceCanvas, type HeroEnhance } from '@/lib/hero-enhance';
import type { EnhanceParams } from '@/lib/auto-enhance-params';

/** HERO.FIT.3 — the hero cropper's max zoom, named once: the Cropper and its zoom slider read it. */
export const HERO_CROP_MAX_ZOOM = 3;

export type HeroPhotoKind = 'hero' | 'full_bleed';

/** A framed area in percent of its picture (react-easy-crop's shape). */
export type HeroPhotoArea = Area;

/** What OK hands back. `file` is null only for a picture kept as picked (a GIF). */
export interface HeroPhotoResult {
  file: File | null;
  /** The framed window over `file` (what paints). */
  window: Record<string, unknown> | null;
  /** The same window over the kept original (what reopens the editor), when the picture is that original. */
  windowSource: Record<string, unknown> | null;
  /** The Auto enhance baked into `file`, or null for none. */
  enhance: HeroEnhance | null;
}

const frameAspect = (kind: HeroPhotoKind) => (kind === 'full_bleed' ? canonicalFullBleedAspect() : canonicalHeroAspect());

/**
 * The ONE bake of a hero photo. `area` is the framed area in percent of the
 * picture, `natural` the real source's natural size. With `enhance`, the region
 * is enhanced before it is encoded — with the params given (what the preview
 * showed), or analysed on the framed window, never the margin, when none are.
 */
export async function bakeHeroPhoto(input: {
  image: string;
  kind: HeroPhotoKind;
  natural: { width: number; height: number };
  area: HeroPhotoArea;
  isOriginal: boolean;
  enhance: { strength: number; params: EnhanceParams | null } | null;
}): Promise<HeroPhotoResult & { file: File }> {
  const { image, kind, natural, area, isOriginal, enhance } = input;
  const aspect = frameAspect(kind);
  const framed = {
    x: (area.x / 100) * natural.width,
    y: (area.y / 100) * natural.height,
    width: (area.width / 100) * natural.width,
    height: (area.height / 100) * natural.height,
  };
  // The display file is the framed area plus only the margin other screen
  // shapes can show, and the framed WINDOW is stored against that file.
  const display = heroDisplayRegion(framed, natural, HERO_BOX_ASPECTS[kind]);
  const window = display && writePictureFit(null, { mode: 'crop', crop: display.window, aspect });
  if (!display || !window) throw new Error('Crop failed');
  // The same framed area over the kept original, to reopen the editor on.
  const windowSource = isOriginal
    ? writePictureFit(null, { mode: 'crop', crop: { x: area.x, y: area.y, w: area.width, h: area.height }, aspect })
    : null;
  const baked: { value: HeroEnhance | null } = { value: null };
  const file = await getCroppedImage(image, display.region, enhance ? async (canvas) => {
    baked.value = (await loadHeroEnhanceCanvas()).bakeEnhance(canvas, {
      strength: enhance.strength,
      params: enhance.params,
      framed: display.window,
    });
  } : undefined);
  return { file, window, windowSource, enhance: baked.value };
}

export interface HeroPhotoEditorProps {
  /** The picture: a fresh pick, the kept original, or the page's own display file. */
  image: string;
  kind: HeroPhotoKind;
  /** The area to open on, in percent of the picture. Absent: zoom 1, centred. */
  initialArea?: HeroPhotoArea | null;
  /** The stored enhancement to open on (the switch on, at its strength). */
  initialEnhance?: HeroEnhance | null;
  /** The picture is the kept original (or a pick that becomes it): OK returns `windowSource`. */
  isOriginal: boolean;
  /** Auto enhance is offered: the picture is un-enhanced. */
  enhanceOffered: boolean;
  /** False for a GIF: shown as the page will show it, kept as picked. */
  croppable: boolean;
  /** The editor opened on a photo the page already has: OK with nothing touched closes and writes nothing. */
  isExisting: boolean;
  saving: boolean;
  onApply: (result: HeroPhotoResult) => void | Promise<void>;
  onNewPhoto: () => void;
  onClose: () => void;
  /** The bake failed; the editor stays open unless the caller closes it. */
  onBakeError?: (err: unknown) => void;
}

/** A thrown value's name and message, for the console (error truth: never fail silently). */
const errorLabel = (err: unknown): string => {
  const e = err as { name?: string; message?: string } | null | undefined;
  return `${e?.name ?? 'Error'}: ${e?.message ?? ''}`;
};

/** Below this much difference (percent of the picture) two framed areas are the same one. */
const SAME_AREA = 0.1;
/** Hold to compare: a press held this long, and this still, shows the real source. */
const HOLD_MS = 300;
const HOLD_SLOP_PX = 8;

export function HeroPhotoEditor({
  image, kind, initialArea, initialEnhance, isOriginal, enhanceOffered, croppable, isExisting,
  saving, onApply, onNewPhoto, onClose, onBakeError,
}: HeroPhotoEditorProps) {
  const { t } = useLanguage();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // Passed to the Cropper for the first load of the picture only (see the header).
  const [seed, setSeed] = useState<HeroPhotoArea | undefined>(croppable ? initialArea ?? undefined : undefined);
  // The real source's natural size, from its own first load.
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  // The framed area as last reported, and as it was when the first input began.
  const area = useRef<HeroPhotoArea | null>(null);
  const baseline = useRef<HeroPhotoArea | null>(null);
  const inputSeen = useRef(false);
  const markInput = () => {
    if (inputSeen.current) return;
    inputSeen.current = true;
    baseline.current = area.current;
  };

  const showRow = enhanceOffered && croppable;
  const stored = showRow ? initialEnhance ?? null : null;
  const [enhanceOn, setEnhanceOn] = useState(!!stored);
  const [strength, setStrength] = useState(stored ? Math.max(1, Math.round(stored.strength * 100)) : 100);
  const switchTouched = useRef(false);
  // The params the enhanced copy is painted with, and the area they are analysed on.
  const params = useRef<EnhanceParams | null>(stored?.params ?? null);
  const analyseArea = useRef<HeroPhotoArea | null>(null);
  const [copy, setCopy] = useState<string | null>(null);
  const [hold, setHold] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = busy || saving;
  // The strength rows change the cropper's height, and react-easy-crop must
  // never be resized while a picture swap is still loading: WebKit measures the
  // half-loaded <img>, and the framed area drifts (0.33 percent, measured on
  // the mobile project). So the two never overlap:
  //   - switch ON: the rows appear at once; the enhanced copy is shown only
  //     once that layout has been measured (`rowsSettled`, two frames later);
  //   - switch OFF: the picture swaps back first; the rows go once it has
  //     loaded (`collapsing` holds them until then).
  const [rowsSettled, setRowsSettled] = useState(true);
  const [collapsing, setCollapsing] = useState(false);
  useEffect(() => {
    if (rowsSettled) return;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setRowsSettled(true));
    });
    return () => { window.cancelAnimationFrame(first); window.cancelAnimationFrame(second); };
  }, [rowsSettled]);
  // A swap whose load never reports back must not strand the rows.
  useEffect(() => {
    if (!collapsing) return;
    const timer = window.setTimeout(() => setCollapsing(false), 1000);
    return () => window.clearTimeout(timer);
  }, [collapsing]);

  // The real source as a decoded, canvas-readable image. One load.
  const source = useRef<Promise<HTMLImageElement> | null>(null);
  const loadSource = () => {
    if (!source.current) {
      source.current = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = image;
      });
      source.current.catch(() => { source.current = null; });
    }
    return source.current;
  };

  /** The enhanced copy of the whole picture at a strength; fixes the params on its first run. */
  const makeCopy = async (at: number): Promise<{ url: string; params: EnhanceParams } | null> => {
    const [img, mod] = await Promise.all([loadSource(), loadHeroEnhanceCanvas()]);
    const framed = analyseArea.current;
    return mod.enhancedCopy(img, {
      strength: at / 100,
      params: params.current,
      framed: framed ? { x: framed.x, y: framed.y, w: framed.width, h: framed.height } : null,
    });
  };

  // Re-made on every switch or strength change, debounced. Never on a drag or a zoom.
  useEffect(() => {
    if (!showRow || !enhanceOn) {
      setCopy(null);
      return;
    }
    let cancelled = false;
    // The canvas work is a lazy chunk: start fetching it while the debounce runs.
    loadHeroEnhanceCanvas().catch(() => {});
    const timer = window.setTimeout(async () => {
      try {
        const made = await makeCopy(strength);
        if (!made) return;
        if (cancelled) {
          URL.revokeObjectURL(made.url);
          return;
        }
        params.current = made.params;
        setCopy(made.url);
      } catch (err) {
        console.error('[ENHANCE] preview failed:', errorLabel(err), err);
      }
    }, 120);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRow, enhanceOn, strength]);
  // A replaced (or dropped) copy is released.
  useEffect(() => {
    if (!copy) return;
    return () => URL.revokeObjectURL(copy);
  }, [copy]);

  // Lock the page behind the editor (and every scroller in it) while it is open.
  useEffect(() => {
    const scrollables = Array.from(document.querySelectorAll<HTMLElement>('.overflow-y-auto, .overflow-auto'))
      .filter((el) => !el.closest('[data-hero-photo-dialog]'));
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    scrollables.forEach((el) => { el.style.overflow = 'hidden'; });
    return () => {
      document.body.style.overflow = before;
      scrollables.forEach((el) => { el.style.overflow = ''; });
    };
  }, []);

  // What the cropper shows: the enhanced copy, or the real source (switch off,
  // the copy not made yet, or the photo held).
  const copyShowing = showRow && enhanceOn && !!copy && !!natural && rowsSettled;
  const previewState: 'on' | 'original' | 'off' = copyShowing ? (hold ? 'original' : 'on') : 'off';
  const shown = copyShowing && !hold ? copy! : image;

  // Hold to compare: a press held still shows the real source until release. A press that moves is a drag.
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setHold(false);
  };
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);

  const handleOk = async () => {
    if (locked) return;
    if (!croppable) {
      // Kept as picked. On a photo the page already has there is nothing to save.
      if (isExisting) onClose();
      else await onApply({ file: null, window: null, windowSource: null, enhance: null });
      return;
    }
    const now = area.current;
    const was = baseline.current;
    const moved = inputSeen.current && (!was || !now || Math.max(
      Math.abs(now.x - was.x), Math.abs(now.y - was.y), Math.abs(now.width - was.width), Math.abs(now.height - was.height),
    ) > SAME_AREA);
    const wanted = showRow && enhanceOn && strength > 0;
    const enhanceChanged = wanted
      ? !stored || switchTouched.current || Math.round(stored.strength * 100) !== strength
      : !!stored;
    // Nothing touched since it opened on an existing photo: close, write nothing.
    if (isExisting && !moved && !enhanceChanged) {
      onClose();
      return;
    }
    // An untouched frame is baked from the area it opened on, to the digit.
    const framed = !moved && initialArea ? initialArea : now;
    if (!framed || !natural) return;
    setBusy(true);
    try {
      if (wanted && !params.current) {
        // OK before the first copy landed: analyse now, as the copy would have.
        const made = await makeCopy(strength);
        if (made) {
          URL.revokeObjectURL(made.url);
          params.current = made.params;
        }
      }
      const result = await bakeHeroPhoto({
        image, kind, natural, area: framed, isOriginal,
        enhance: wanted ? { strength: strength / 100, params: params.current } : null,
      });
      await onApply(result);
    } catch (err) {
      console.error('[CROP] apply failed:', errorLabel(err), err);
      onBakeError?.(err);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      data-hero-photo-dialog=""
      data-hero-editor-kind={kind}
      data-enhance-preview={previewState}
      className="fixed inset-0 z-[130] flex flex-col items-center bg-black/95"
      style={{ overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Phones: full screen. Wider than 480px: the same column, at most 440px, centred on the backdrop. */}
      <div className="flex flex-col w-full min-[481px]:max-w-[440px] flex-1 min-h-0 bg-[#0e0c09]">
        <div className="flex items-center justify-between px-3 border-b border-white/10" style={{ height: '44px', flexShrink: 0 }}>
          <div className="w-8" />
          <p className="text-white font-semibold text-sm truncate">{t('editor.editPhoto')}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label={t('editor.cancel')}
            className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* The cropper takes the height that is left. A GIF is shown as the
            page will show it (Fill, centred) and cannot be moved. */}
        <div
          className="relative bg-black rounded-xl overflow-hidden w-full flex-1"
          style={{
            minHeight: '180px',
            pointerEvents: croppable ? undefined : 'none',
            // A press-and-hold must not select or call up the image menu.
            userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
          }}
          onPointerDown={(e) => {
            if (!copyShowing) return;
            // A second pointer is a pinch, not a hold.
            if (press.current) { endPress(); return; }
            press.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(() => setHold(true), HOLD_MS) };
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (!p || hold) return;
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= HOLD_SLOP_PX) {
              window.clearTimeout(p.timer);
              press.current = null;
            }
          }}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Cropper
            image={shown}
            crop={crop}
            zoom={zoom}
            maxZoom={HERO_CROP_MAX_ZOOM}
            aspect={frameAspect(kind)}
            keyboardStep={croppable ? undefined : 0}
            mediaProps={{ draggable: false }}
            initialCroppedAreaPercentages={seed}
            onMediaLoaded={(media) => {
              // The first load is always the real source (the copy waits for it).
              if (loaded.current) {
                // The swap back to the source has landed: the rows may go, a frame later.
                if (collapsing) window.requestAnimationFrame(() => setCollapsing(false));
                return;
              }
              loaded.current = true;
              setNatural({ width: media.naturalWidth, height: media.naturalHeight });
              setSeed(undefined);
            }}
            onInteractionStart={markInput}
            onWheelRequest={() => { markInput(); return true; }}
            onTouchRequest={() => { markInput(); return true; }}
            onCropChange={setCrop}
            onZoomChange={(z) => { if (loaded.current) markInput(); setZoom(z); }}
            onCropComplete={(areaPercent) => { area.current = areaPercent; setReady(true); }}
          />
        </div>

        <div className="px-5 pb-5 pt-4 flex flex-col gap-3" style={{ flexShrink: 0 }}>
          <div className="w-full flex items-center gap-3">
            <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">{t('editor.crop.zoom')}</span>
            <input
              type="range"
              min={1}
              max={HERO_CROP_MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => { markInput(); setZoom(Number(e.target.value)); }}
              disabled={!croppable || locked}
              data-testid="hero-editor-zoom"
              aria-label={t('editor.crop.zoom')}
              className={`flex-1 min-w-0 accent-[#C9A55C]${croppable ? '' : ' opacity-40 cursor-not-allowed'}`}
            />
          </div>
          {!croppable && (
            <p className="text-white/40 text-[10px] text-center leading-snug">{t('editor.hero.gifNoCrop')}</p>
          )}

          {/* Auto enhance: a switch, and while it is on a strength slider. The
              display file is what gets enhanced, never the kept original. */}
          {showRow && (
            <div data-testid="hero-enhance-row" className="w-full flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span id="hero-enhance-label" className="min-w-0 truncate text-white/80 text-sm font-semibold">{t('editor.hero.autoEnhance')}</span>
                <Switch
                  data-testid="hero-enhance-switch"
                  aria-labelledby="hero-enhance-label"
                  checked={enhanceOn}
                  disabled={locked}
                  onCheckedChange={(on) => {
                    // A fresh switch-on analyses again, on the area framed now.
                    switchTouched.current = true;
                    params.current = null;
                    analyseArea.current = area.current;
                    // The rows and the picture swap never change together (see above).
                    if (on) setRowsSettled(false);
                    setCollapsing(!on && copyShowing);
                    endPress();
                    setEnhanceOn(on);
                  }}
                  className="data-[state=checked]:bg-[#C9A55C] data-[state=unchecked]:bg-white/20"
                />
              </div>
              {(enhanceOn || collapsing) && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-white/40 text-[10px]">{t('editor.hero.enhanceStrength')}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={strength}
                      onChange={(e) => setStrength(Number(e.target.value))}
                      disabled={locked || !enhanceOn}
                      data-testid="hero-enhance-strength"
                      aria-label={t('editor.hero.enhanceStrength')}
                      className="flex-1 min-w-0 accent-[#C9A55C]"
                    />
                    <span className="text-white/40 text-[10px] tabular-nums w-6 text-right">{strength}</span>
                  </div>
                  <p className="text-white/40 text-[10px] text-center leading-snug">{t('editor.hero.holdToCompare')}</p>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onNewPhoto}
              disabled={locked}
              data-testid="hero-editor-new-photo"
              className="flex-1 min-w-0 truncate py-2.5 rounded-xl border border-white/20 text-white font-semibold text-xs disabled:opacity-60"
            >
              {t('editor.hero.newPhoto')}
            </button>
            <button
              type="button"
              onClick={handleOk}
              disabled={locked || (croppable && !ready)}
              data-testid="hero-editor-ok"
              className="flex-1 min-w-0 truncate py-2.5 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-bold text-xs disabled:opacity-60"
            >
              {locked ? t('editor.hero.saving') : t('editor.hero.ok')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

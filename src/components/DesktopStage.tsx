import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DEFAULT_DEVICE_ID, resolveDevicePreset } from '@/lib/device-presets';
import type { ThemeJson } from '@/lib/theme-defaults';

/**
 * DESK.STAGE.1 — the public page renders the phone on a desktop viewport.
 *
 * ## Why
 *
 * The page is composed for a phone. Painted across a 1440px-wide browser
 * window its full-bleed media covers a landscape box, so a portrait photo
 * framed for a phone gets blown up and cropped to almost nothing — the exact
 * opposite of what the editor previewed. Rather than teach every surface a
 * second desktop geometry, this component gives the page a phone-shaped box to
 * live in and fills the rest of the window with an ambient blur of the page's
 * own hero media (the link.me pattern).
 *
 * ## Why this makes desktop == mobile for free
 *
 * FIX.MEDIA.1 made every hero surface resolve its framing through
 * `resolveHeroMediaStyle` at a MEASURED container aspect. Nothing guesses. So
 * once the page's boxes are the stage's boxes, `useElementAspect` reports the
 * stage's (phone) aspect and the resolver emits the mobile rectangle — no
 * desktop branch anywhere in the render path. The stage is the whole fix.
 *
 * Two mechanisms do the confining, and they must stay split:
 *
 *   1. A `transform` on the STAGE makes it the containing block for
 *      `position: fixed` descendants (CSS: a transformed ancestor becomes the
 *      containing block for fixed children). That is what pulls the live page's
 *      `fixed inset-0` full-bleed media layer — and the public header — inside
 *      the stage instead of across the window. No re-parenting, no prop.
 *      FIX.STAGE.2b: that transform is now the fit `scale()` (it was a bare
 *      `translateZ(0)`), so one property covers both jobs.
 *
 *   2. The SCROLLER is a separate child, not the transformed element itself.
 *      This is the FS.PAGE.1 lesson: the editor's device frame is transformed
 *      AND scrolls, so its fixed descendants resolve against the scrolling box
 *      and slide away with the content — which is why edit mode needs the
 *      sticky + negative-margin workaround. Splitting the two roles keeps the
 *      stage stationary while its inner scroller moves, so `fixed` pins and
 *      `sticky` sticks exactly as they do on a real phone.
 *
 * `--pv-vh` is the third piece, and it is DP.2's existing mechanism reused
 * verbatim: the hero window is `calc(var(--pv-vh, 1dvh) * 50 + 60px)`, so
 * publishing the stage's own hundredth-of-height makes 50dvh mean half the
 * STAGE, not half the window. Below the breakpoint the var is never set and
 * the 1dvh fallback keeps the narrow render byte-identical to today.
 *
 * FIX.STAGE.2b closed the last gap between those three and the editor preview:
 * the stage lays out at the preset's TRUE pixels and fits by scaling, so every
 * length the page can measure — including `--pv-vh` — is the device's own,
 * whatever the window is doing. See `useStageSize` for why reflow-shrinking was
 * not merely blurrier but a different crop.
 */

/** Wide enough that a phone-width column plus ambient surround reads as
 *  intentional rather than cramped. Below this the page owns the viewport,
 *  exactly as it does today. */
const STAGE_MIN_VIEWPORT_PX = 768;

/** Breathing room around the stage, top/bottom and left/right. */
const STAGE_MARGIN_PX = 24;

interface StageSize {
  /** The preset's TRUE logical width in px — the layout box, never reduced. */
  width: number;
  /** The preset's TRUE logical height in px — the layout box, never reduced. */
  height: number;
  /** Uniform fit factor applied as a transform. 1 when the window has room;
   *  never above 1 (a phone render is not magnified). */
  scale: number;
}

/** Live `(min-width: …)` match. Re-renders on resize/zoom, SSR-safe. */
function useIsWideViewport(minWidthPx: number): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${minWidthPx}px)`);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [minWidthPx]);
  return wide;
}

/**
 * The stage box: ALWAYS the chosen preset's exact logical pixels, plus a uniform
 * `scale` that fits it into the window. FIX.STAGE.2b — this is DP.1's approach,
 * adopted verbatim, and the reason is a real bug it replaces.
 *
 * The stage used to reflow-shrink: it kept the aspect but reduced the layout box
 * (a 1200x700 window gave a 300x652 stage). Same shape, fewer real pixels — and
 * the page's fixed-px geometry does not shrink with it. Worst of all, the hero
 * window is `calc(var(--pv-vh) * 50 + HERO_EXTRA)`: that additive 60px is a
 * GROWING fraction of a shrinking box, so the hero container's own aspect moved
 * (0.8089 at true size, 0.7769 at 300x652). Since FIX.MEDIA.1 resolves framing
 * from the MEASURED container aspect, a drifting aspect is a genuinely different
 * crop of the same media — the editor preview and the live stage disagreed.
 *
 * Laying out at true pixels and scaling with a transform makes every one of those
 * numbers identical to the editor's, at any window size: a transform is applied
 * after layout, so nothing inside can observe it. `--pv-vh` is likewise pinned to
 * the preset, not to the fitted footprint.
 *
 * DESK.STAGE.2: `deviceId` is the page OWNER's choice, read from theme_json.
 * `resolveDevicePreset` is total — an unknown or absent id yields the default
 * preset — so an unrecognized value degrades silently to today's stage.
 */
function useStageSize(active: boolean, deviceId?: string | null): StageSize | null {
  const [size, setSize] = useState<StageSize | null>(null);
  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') {
      setSize(null);
      return;
    }
    const preset = resolveDevicePreset(deviceId ?? DEFAULT_DEVICE_ID);
    const measure = () => {
      const availH = window.innerHeight - STAGE_MARGIN_PX * 2;
      const availW = window.innerWidth - STAGE_MARGIN_PX * 2;
      // Fit, never magnify — same expression as the editor's preview scale.
      const s = Math.min(availW / preset.width, availH / preset.height, 1);
      setSize({ width: preset.width, height: preset.height, scale: s > 0 ? s : 1 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, deviceId]);
  return size;
}

export interface DesktopStageProps {
  /** Painted behind the stage, blown up and blurred. The hero photo the page
   *  already loads — a video's own frames are deliberately not used (a second
   *  decoding video for pure decoration is not worth the battery). */
  backdropImage?: string | null;
  /** Fallback backdrop when the page has no hero media at all. */
  theme?: ThemeJson | null;
  /** DESK.STAGE.2 — the DEVICE_PRESETS id the page owner picked for their
   *  desktop stage (theme_json.desktopStage.deviceId). Absent / unknown → the
   *  default preset, so every page that never set one is untouched. */
  deviceId?: string | null;
  /** Receives the element the page should read scroll position from — the
   *  stage's inner scroller when staged, `null` (meaning `window`) when not.
   *  The window does not scroll while the stage owns the scrolling. */
  onScrollHost?: (el: HTMLElement | null) => void;
  children: ReactNode;
}

export function DesktopStage({ backdropImage, theme, deviceId, onScrollHost, children }: DesktopStageProps) {
  const wide = useIsWideViewport(STAGE_MIN_VIEWPORT_PX);
  const size = useStageSize(wide, deviceId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const staged = wide && !!size;

  // Publish the scroll host on every transition, including back to `null` when
  // the viewport narrows and the window takes the scrolling back.
  useEffect(() => {
    onScrollHost?.(staged ? scrollRef.current : null);
  }, [staged, onScrollHost]);

  if (!staged) return <>{children}</>;

  const bg = theme?.background;
  const fallbackBackdrop: CSSProperties =
    bg?.type === 'gradient' && bg.gradient_css
      ? { backgroundImage: bg.gradient_css }
      : { backgroundColor: bg?.solid_color || '#0e0c09' };

  return (
    <div data-testid="desk-stage-root">
      {/* Ambient backdrop — full viewport, behind the stage. Static image +
          CSS blur only: no extra request beyond the hero the page already
          fetches, and nothing decoding on a loop. Scaled up so the blur's
          soft edge never reveals the window edge. */}
      <div
        aria-hidden="true"
        data-testid="desk-stage-backdrop"
        className="fixed inset-0 z-0 overflow-hidden bg-[#0e0c09]"
      >
        {backdropImage ? (
          <img
            src={backdropImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: 'scale(1.25)', filter: 'blur(56px) saturate(1.25)' }}
          />
        ) : (
          <div className="absolute inset-0" style={fallbackBackdrop} />
        )}
        {/* Dark scrim — keeps the stage the focal point and stops a bright
            photo from washing out its edges. */}
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Stage host — centres the phone in the window. */}
      <div className="fixed inset-0 z-10 flex items-center justify-center">
        <div
          data-testid="desk-stage"
          // The preset the stage actually resolved to — after the silent
          // fallback, so it reports what is on screen, not what was asked for.
          data-device-id={resolveDevicePreset(deviceId ?? DEFAULT_DEVICE_ID).id}
          data-stage-scale={size.scale}
          style={
            {
              // The preset's TRUE pixels. Nothing inside can observe the fit
              // transform below, so this is the device the page renders at.
              width: `${size.width}px`,
              height: `${size.height}px`,
              // (1) containing block for the page's `position: fixed` layers —
              //     any transform establishes one, so the fit scale does double
              //     duty here and `translateZ(0)` is no longer needed on its own.
              // FIX.STAGE.2b: fit by SCALING, never by reflow-shrinking the box.
              transform: `scale(${size.scale})`,
              transformOrigin: 'center center',
              // A scaled flex item still occupies its unscaled size in layout;
              // `flex: 0 0 auto` stops the centring container from stretching or
              // squashing it, exactly as the editor's device frame does.
              flex: '0 0 auto',
              // (3) DP.2's unit proxy — 50dvh means half the DEVICE, pinned to
              //     the preset so it cannot drift with the window (see above).
              '--pv-vh': `${size.height / 100}px`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '28px',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 40px 90px rgba(0,0,0,0.6)',
              backgroundColor: '#0e0c09',
            } as CSSProperties
          }
        >
          {/* (2) the scroller, deliberately NOT the transformed element.
              `min-h-screen` inside it would still resolve against the WINDOW —
              taller than the stage — leaving dead scroll under a short page.
              Retarget any such descendant to the stage's own height. */}
          <div
            ref={scrollRef}
            data-testid="desk-stage-scroll"
            className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-hide [&_.min-h-screen]:min-h-full"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as CSSProperties}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

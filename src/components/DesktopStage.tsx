import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DEFAULT_DEVICE_ID, canonicalFullBleedAspect, resolveDevicePreset } from '@/lib/device-presets';
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
 *   1. `transform: translateZ(0)` on the STAGE makes it the containing block
 *      for `position: fixed` descendants (CSS: a transformed ancestor becomes
 *      the containing block for fixed children). That is what pulls the live
 *      page's `fixed inset-0` full-bleed media layer — and the public header —
 *      inside the stage instead of across the window. No re-parenting, no prop.
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
 */

/** Wide enough that a phone-width column plus ambient surround reads as
 *  intentional rather than cramped. Below this the page owns the viewport,
 *  exactly as it does today. */
const STAGE_MIN_VIEWPORT_PX = 768;

/** Breathing room around the stage, top/bottom and left/right. */
const STAGE_MARGIN_PX = 24;

interface StageSize {
  width: number;
  height: number;
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
 * The stage box: the default device preset's logical size when the window has
 * room for it, shrunk proportionally when it does not. Both numbers come from
 * DEVICE_PRESETS — the stage is literally the phone the editor previews, so a
 * page framed in the editor lands here unchanged.
 */
function useStageSize(active: boolean): StageSize | null {
  const [size, setSize] = useState<StageSize | null>(null);
  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') {
      setSize(null);
      return;
    }
    const preset = resolveDevicePreset(DEFAULT_DEVICE_ID);
    const aspect = canonicalFullBleedAspect();
    const measure = () => {
      const availH = Math.max(320, window.innerHeight - STAGE_MARGIN_PX * 2);
      const availW = Math.max(280, window.innerWidth - STAGE_MARGIN_PX * 2);
      // Natural size first; shrink to whichever axis actually constrains.
      let height = Math.min(preset.height, availH);
      let width = height * aspect;
      if (width > availW) {
        width = availW;
        height = width / aspect;
      }
      setSize({ width: Math.round(width), height: Math.round(height) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);
  return size;
}

export interface DesktopStageProps {
  /** Painted behind the stage, blown up and blurred. The hero photo the page
   *  already loads — a video's own frames are deliberately not used (a second
   *  decoding video for pure decoration is not worth the battery). */
  backdropImage?: string | null;
  /** Fallback backdrop when the page has no hero media at all. */
  theme?: ThemeJson | null;
  /** Receives the element the page should read scroll position from — the
   *  stage's inner scroller when staged, `null` (meaning `window`) when not.
   *  The window does not scroll while the stage owns the scrolling. */
  onScrollHost?: (el: HTMLElement | null) => void;
  children: ReactNode;
}

export function DesktopStage({ backdropImage, theme, onScrollHost, children }: DesktopStageProps) {
  const wide = useIsWideViewport(STAGE_MIN_VIEWPORT_PX);
  const size = useStageSize(wide);
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
          style={
            {
              width: `${size.width}px`,
              height: `${size.height}px`,
              // (1) containing block for the page's `position: fixed` layers.
              transform: 'translateZ(0)',
              // (3) DP.2's unit proxy — 50dvh now means half the STAGE.
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

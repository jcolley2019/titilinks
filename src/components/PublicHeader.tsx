// TL.PREV.HDR.1 — the public page's fade-in header, as a component.
//
// Transparent at the top; the name (left) and, on hero pages, the solid
// background fade in over the first FADE_DISTANCE_PX of scroll. The
// Save-Contact button (right) is always visible. Full-bleed pages keep the
// background transparent and instead paint a top gradient scrim (FS.HEADER-b)
// so content melts away as it scrolls under the name.
//
// Lived inline in src/pages/PublicProfile.tsx from 2026-06-13; extracted so the
// editor's phone preview (Editor.tsx desktop stage, edit + visitor modes) can
// mount the SAME markup driven by the frame's own scroller. Every class and
// style value below is byte-identical to the PublicProfile original except the
// position class, which is a prop: `fixed` on the public page (viewport /
// DesktopStage), `absolute` inside the editor's device frame, whose rounded
// wrapper is the containing block.
//
// The scroll listener is the DESK.STAGE.1 one: `scrollHost` is the element
// that actually scrolls (the DesktopStage / device-frame scroller); `null`
// means the window scrolls the page, as on a narrow public viewport. It
// resyncs whenever the host changes so a late-mounting scroller never leaves
// the header stuck at 0.

import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

/** Scroll distance over which the header fades from 0 to 1 (the public page's constant). */
export const HEADER_FADE_DISTANCE_PX = 220;

export interface PublicHeaderProps {
  /** What the header shows once faded in — display_name, falling back to the handle. */
  name: string;
  /** The element that scrolls the page; null → window. */
  scrollHost: HTMLElement | null;
  /** Full-bleed pages: transparent background + gradient scrim instead of a solid fill. */
  isFullBleed: boolean;
  /** Opens the Save-Contact sheet. Undefined → the button renders inert (visual parity only). */
  onSaveContact?: () => void;
  /** `fixed` (public page, default) or `absolute` (inside the editor's device frame). */
  position?: 'fixed' | 'absolute';
  fadeDistancePx?: number;
  /** Extra right inset (px) for the row, so the button clears chrome the host
   *  draws at the top-right (the editor's edit-mode camera/pencil column).
   *  Undefined on the public page → the original `px-4` row, untouched. */
  rightInsetPx?: number;
}

export function PublicHeader({
  name,
  scrollHost,
  isFullBleed,
  onSaveContact,
  position = 'fixed',
  fadeDistancePx = HEADER_FADE_DISTANCE_PX,
  rightInsetPx,
}: PublicHeaderProps) {
  const { t } = useLanguage();
  const [headerOpacity, setHeaderOpacity] = useState(0);

  useEffect(() => {
    const target: HTMLElement | Window = scrollHost ?? window;
    const onScroll = () => {
      const y = scrollHost ? scrollHost.scrollTop : window.scrollY;
      setHeaderOpacity(Math.min(y / fadeDistancePx, 1));
    };
    onScroll(); // resync when the scroller changes under us
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [scrollHost, fadeDistancePx]);

  const inert = !onSaveContact;

  return (
    <>
      {/* Public header — transparent at top; color + name fade in on scroll (Step 2) */}
      <header
        data-testid="public-header"
        className={`${position} top-0 left-0 right-0 z-50${inert ? ' pointer-events-none' : ''}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', backgroundColor: `rgba(14, 12, 9, ${isFullBleed ? 0 : headerOpacity})` }}
      >
        <div
          className="flex items-center justify-between px-4 h-14"
          style={rightInsetPx ? { paddingRight: 16 + rightInsetPx } : undefined}
        >
          <div
            data-testid="public-header-name"
            className="min-w-0 flex-1"
            style={{ opacity: headerOpacity, ...(isFullBleed ? { textShadow: '0 1px 8px rgba(0,0,0,0.7)' } : {}) }}
          >
            <p className="truncate text-white font-semibold text-[15px] leading-none">
              {name}
            </p>
          </div>
          <button
            type="button"
            onClick={onSaveContact}
            disabled={inert}
            aria-hidden={inert || undefined}
            tabIndex={inert ? -1 : undefined}
            aria-label={t('publicProfile.saveContactAria')}
            className="flex items-center justify-center h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm text-white"
          >
            <UserPlus className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* FS.HEADER-b: full-screen only — content melts away as it
          scrolls under the transparent header, keeping the header
          name legible. Sits below the header (z-50), above the
          scrolling content. Hero pages: none. */}
      {isFullBleed && (
        <div
          aria-hidden="true"
          className={`${position} top-0 left-0 right-0 z-40 pointer-events-none`}
          style={{
            height: 'calc(env(safe-area-inset-top, 0px) + 96px)',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.45) 45%, transparent 100%)',
            opacity: headerOpacity,
          }}
        />
      )}
    </>
  );
}

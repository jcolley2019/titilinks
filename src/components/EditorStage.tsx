// TL.ONB.STAGE.1 — the editor's desktop stage, lifted verbatim from
// Editor.tsx so onboarding can mount the same preview (STAGE.2).
// Pure move: no behaviour change.
//
// Backdrop, top bar, device frame, PublicHeader and the desktop
// EditableProfileView mount. State and effects own the device preset,
// fit-scale, frame scroller and the edit/visitor preview toggle.
//
// TL.ONB.STAGE.2: every editing callback is OPTIONAL and the chrome is
// switchable, so a read-only caller (onboarding) mounts the same stage with
// no handlers. Every default reproduces the editor's output exactly.
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { DEVICE_PRESETS, resolveDevicePreset } from '@/lib/device-presets';
import { Eye, Pencil } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { EditableProfileView } from '@/components/EditableProfileView';
import { PublicHeader } from '@/components/PublicHeader';
import { resolveEffectivePageStyle } from '@/lib/surface';
import { cn } from '@/lib/utils';
import type { BlockWithItems, ClickHandler } from '@/components/blocks/types';
import type { HeaderDraft } from '@/lib/header-draft';
import type { ThemeJson } from '@/lib/theme-defaults';
import type { HeroFraming } from '@/lib/hero-framing';
import type { Tables } from '@/integrations/supabase/types';

/** Defaults for the optional callbacks — a read-only stage needs no handlers. */
const noop = () => {};
const noopFalse = () => false;
const noopAsyncFalse = async () => false;

export interface EditorStageProps {
  page: Tables<'pages'>;
  editBlocks: BlockWithItems[];
  visitorBlocks: BlockWithItems[];
  headerDraft?: HeaderDraft | null;
  themeDraft?: ThemeJson | null;
  showBranding: boolean;
  selectedMode: 'page1' | 'page2';
  onModeChange: (mode: 'page1' | 'page2') => void;
  panelOpen?: boolean;
  onOpenPanel?: () => void;
  onViewLive?: () => void;
  onVisitorOutbound?: ClickHandler;
  onBlockEdit?: (blockId: string) => void;
  onBlockToggle?: (blockId: string, enabled: boolean) => void;
  onBlockReorder?: (blockIds: string[]) => void;
  onRefresh?: () => void;
  onEditVideo?: () => void;
  openPhotoRequest?: number;
  videoPosDraft?: HeroFraming | null;
  onGalleryStagedDelete?: (itemId: string) => boolean;
  onItemEdit?: (blockId: string, itemId: string) => void;
  onItemDelete?: (itemId: string) => void;
  onItemAdd?: (blockId: string) => void;
  onItemsReorder?: (blockId: string, orderedItemIds: string[]) => void;
  /** Wrapper left inset. The editor's sidebar is w-64; onboarding's panel is wider. */
  leftClass?: string;
  /** Which top-bar controls this caller wants. Each flag defaults to shown. */
  chrome?: {
    label?: string;
    modeToggle?: boolean;
    handle?: boolean;
    editProfile?: boolean;
    viewLive?: boolean;
  };
  /** Seeds the preview mode. The editor boots into 'edit'; onboarding shows the visitor view. */
  initialMode?: 'edit' | 'visitor';
}

export function EditorStage({
  page,
  editBlocks,
  visitorBlocks,
  headerDraft = null,
  themeDraft = null,
  showBranding,
  selectedMode,
  onModeChange,
  panelOpen = false,
  onOpenPanel = noop,
  onViewLive = noop,
  onVisitorOutbound,
  onBlockEdit = noop,
  onBlockToggle = noopAsyncFalse,
  onBlockReorder = noop,
  onRefresh = noop,
  onEditVideo = noop,
  openPhotoRequest = 0,
  videoPosDraft = null,
  onGalleryStagedDelete = noopFalse,
  onItemEdit = noop,
  onItemDelete = noop,
  onItemAdd = noop,
  onItemsReorder = noop,
  leftClass = 'left-64',
  chrome,
  initialMode = 'edit',
}: EditorStageProps) {
  const { t } = useLanguage();

  // ── DP.1: device-truthful preview frame ──
  // The desktop preview renders at a real device's LOGICAL CSS viewport
  // (src/lib/device-presets.ts) instead of a made-up 390×844 box, so what the
  // user composes matches what phones actually show. Selection persists.
  const devicePrefKey = 'titilinks-editor-device';
  const [deviceId, setDeviceId] = useState<string>(
    () => resolveDevicePreset(localStorage.getItem(devicePrefKey)).id
  );
  const devicePreset = resolveDevicePreset(deviceId);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  // TL.PREV.HDR.1: the device frame's scroller, handed to the preview's
  // PublicHeader as its scrollHost (callback ref → state so the header's
  // listener re-binds when the element mounts, not just when it changes).
  const [frameScrollEl, setFrameScrollEl] = useState<HTMLElement | null>(null);
  // ── DP.2: visitor-preview toggle ──
  // 'edit' shows the WYSIWYG editing chrome; 'visitor' renders the same shared
  // EditableProfileView in view mode (editMode=false) — exactly what a visitor
  // gets, including public 18+ gating (stripped hrefs + tap-to-gate). Session-
  // only on purpose: it resets to 'edit' on reload so the editor never boots into
  // a read-only surface. The device selector stays live in both modes.
  const [previewMode, setPreviewMode] = useState<'edit' | 'visitor'>(initialMode);
  const isVisitor = previewMode === 'visitor';

  useEffect(() => {
    try { localStorage.setItem(devicePrefKey, deviceId); } catch { /* storage disabled */ }
  }, [deviceId]);

  // Scale the frame uniformly to fit the preview column (never magnify past
  // 100%). Recomputes on column resize — including the dashboard panel opening,
  // which narrows the column — and on preset change.
  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const fitPad = 24; // px of breathing room around the frame
    const compute = () => {
      const availW = el.clientWidth - fitPad * 2;
      const availH = el.clientHeight - fitPad * 2;
      if (availW <= 0 || availH <= 0) return;
      const s = Math.min(availW / devicePreset.width, availH / devicePreset.height, 1);
      setPreviewScale(s > 0 ? s : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [devicePreset.width, devicePreset.height]);

  return (
  <div
    className={cn(
      "hidden lg:block fixed top-0 bottom-0 overflow-hidden transition-all duration-300 ease-out",
      leftClass,
      panelOpen ? "right-[420px]" : "right-0"
    )}
  >
    {/* Blurred hero background */}
    <div className="absolute inset-0 z-0 overflow-hidden">
      <div
        style={{
          backgroundImage: `url(${page.avatar_url || ''})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(40px)',
          transform: 'scale(1.15)',
          opacity: 0.35,
          position: 'absolute',
          inset: '-20px',
        }}
      />
      <div className="absolute inset-0 bg-black/50" />
    </div>

    {/* Desktop top bar */}
    <div className="relative z-30 flex items-center justify-between px-6 h-[52px] bg-black/30 backdrop-blur-md border-b border-white/5">
      <div className="flex items-center">
        <span className="text-sm font-bold text-white">
          Titi<span className="italic text-[#C9A55C]">Links</span>
        </span>
        {chrome?.label && (
          <span data-testid="stage-label" className="ml-3 text-xs uppercase tracking-[0.2em] text-white/60">{chrome.label}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* DP.1: device-truthful preview selector. Device names stay
            untranslated; the aria-label / caption are localized. */}
        <div className="flex items-center gap-1.5">
          <select
            data-testid="device-selector"
            aria-label={t('editor.devicePreset')}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="text-xs bg-black/40 text-white/80 border border-white/15 rounded-full px-3 py-1.5 max-w-[210px] cursor-pointer hover:border-white/30 focus:outline-none focus:border-[#C9A55C]/60 transition-colors"
          >
            {DEVICE_PRESETS.map((d) => (
              <option key={d.id} value={d.id} className="bg-[#1a1a1a] text-white">
                {d.label} · {d.width}×{d.height}
              </option>
            ))}
          </select>
          {previewScale < 0.999 && (
            <span
              data-testid="device-scale"
              title={t('editor.deviceScaled')}
              className="text-[10px] text-white/40 tabular-nums"
            >
              {Math.round(previewScale * 100)}%
            </span>
          )}
        </div>
        {/* DP.2: visitor-preview toggle — flips the frame between the editing
            chrome and the exact public view (view mode + public 18+ gating).
            Session-only; the device selector stays live in both modes. */}
        {chrome?.modeToggle !== false && (
          <button
            type="button"
            data-testid="preview-mode-toggle"
            onClick={() => setPreviewMode((m) => (m === 'edit' ? 'visitor' : 'edit'))}
            aria-pressed={isVisitor}
            aria-label={isVisitor ? t('editor.previewBackToEditing') : t('editor.previewAsVisitor')}
            title={isVisitor ? t('editor.previewBackToEditing') : t('editor.previewAsVisitor')}
            className={cn(
              'flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 transition-colors',
              isVisitor
                ? 'bg-[#C9A55C] text-[#0e0c09] border-[#C9A55C] font-bold'
                : 'bg-black/40 text-white/80 border-white/15 hover:border-white/30'
            )}
          >
            {isVisitor ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{isVisitor ? t('editor.previewEditingLabel') : t('editor.previewVisitorLabel')}</span>
          </button>
        )}
        {chrome?.handle !== false && (
          <span className="text-xs text-white/50">@{page.handle}</span>
        )}
        {chrome?.editProfile !== false && (
          <button
            onClick={onOpenPanel}
            className="text-xs font-bold px-4 py-1.5 rounded-full bg-[#C9A55C] text-[#0e0c09] active:scale-95 transition-transform"
          >
            {t('dashLayout.editProfile')}
          </button>
        )}
        {chrome?.viewLive !== false && (
          <button
            onClick={onViewLive}
            className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
          >
            {t('editor.viewLive')} ↗
          </button>
        )}
      </div>
    </div>

    {/* Phone frame — DP.1 device-truthful preview */}
    <div
      ref={previewAreaRef}
      className="relative z-10 flex items-center justify-center h-[calc(100vh-52px)] overflow-hidden"
    >
      {devicePreset.note && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 text-[10px] text-white/45 bg-black/40 px-2 py-0.5 rounded-full pointer-events-none">
          {t('editor.deviceAndroidNote')}
        </div>
      )}
      <div
        data-testid="device-frame"
        className="relative overflow-hidden"
        style={{
          // Exact logical CSS-viewport of the selected device — the frame
          // renders at these px so the composition is device-truthful. The
          // hairline uses `outline` (not `border`) so the box stays exactly
          // width×height. Scaled to fit; offsetWidth/Height ignore transform.
          width: `${devicePreset.width}px`,
          height: `${devicePreset.height}px`,
          // DP.2: expose the frame's logical height / 100 as a viewport-unit
          // proxy. Descendant `dvh` reads that opt in via `var(--pv-vh, 1dvh)`
          // then resolve against the DEVICE frame instead of the desktop
          // window, so the hero container's `50dvh` is truthful per preset.
          // Absent on the public route → the 1dvh fallback keeps it identical.
          '--pv-vh': `${devicePreset.height / 100}px`,
          flex: '0 0 auto',
          transform: `scale(${previewScale})`,
          transformOrigin: 'center center',
          borderRadius: '44px',
          outline: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 0 0 2px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.8)',
        } as CSSProperties}
      >
        {/* FIX.STAGE.3: the scaled element must NOT be the scroller — a
            fractional `scale` on the scrolling element forces the GPU
            compositor to re-tile scrolled content on every scale churn,
            which intermittently drops rastered tiles (grey regions) on
            full-bleed pages. Same split as DesktopStage: the parent owns
            the transform, this unscaled child owns the scrolling. */}
        {/* TL.PREV.HDR.1: the live page's fade-in header (name + save-contact,
            full-bleed scrim), positioned against the frame and driven by the
            frame's scroller — so edit AND visitor preview fade it in exactly
            like the public page. Sibling of the scroller, not a child: it
            sits at the frame's top edge and scrolls with nothing. Name reads
            the same draft the on-canvas name does, so a renamed-but-unsaved
            name matches. Edit mode passes no onSaveContact → inert button +
            pointer-events-none, so EPV's top-right camera/pencil overlays
            (z-[15], under this z-50) stay clickable through it. */}
        <PublicHeader
          position="absolute"
          name={headerDraft?.displayName ?? (page.display_name || page.handle)}
          scrollHost={frameScrollEl}
          isFullBleed={resolveEffectivePageStyle(page.theme_json, selectedMode) === 'full_bleed'}
          onSaveContact={isVisitor ? () => {} : undefined}
          // Edit mode only: EPV draws its camera/pencil column at top-3 right-3
          // (48px wide); slide the inert button left of it so the two never
          // overlap. Visitor mode has no overlays → live layout, untouched.
          rightInsetPx={isVisitor ? undefined : 56}
        />
        <div
          ref={setFrameScrollEl}
          data-testid="device-frame-scroll"
          className="absolute inset-0 overflow-y-auto overflow-x-hidden scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          } as CSSProperties}
        >
          {/* DP.2: same shared render path in both modes. Visitor mode drops
              editMode (public chrome + gating), shows enabled blocks only, and
              routes gated taps through the 18+ modal. The live-mirror props
              (previewBlocks/headerDraft/themeDraft) still flow, so unsaved
              drafts remain visible in visitor mode. */}
          <EditableProfileView
            page={page}
            blocks={isVisitor ? visitorBlocks : editBlocks}
            headerDraft={headerDraft}
            themeDraft={themeDraft}
            editMode={!isVisitor}
            showBranding={showBranding}
            onOutboundClick={isVisitor ? onVisitorOutbound : undefined}
            onBlockEdit={onBlockEdit}
            onBlockToggle={onBlockToggle}
            onBlockReorder={onBlockReorder}
            onRefresh={onRefresh}
            selectedMode={selectedMode}
            onModeChange={onModeChange}
            onAddContent={onOpenPanel}
            onEditVideo={onEditVideo}
            openPhotoRequest={openPhotoRequest}
            videoPosDraft={videoPosDraft}
            onGalleryStagedDelete={onGalleryStagedDelete}
            onItemEdit={onItemEdit}
            onItemDelete={onItemDelete}
            onItemAdd={onItemAdd}
            onItemsReorder={onItemsReorder}
          />
        </div>
      </div>
    </div>
  </div>
  );
}

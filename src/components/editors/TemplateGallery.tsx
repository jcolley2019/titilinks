import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Smartphone, Sparkles, Shirt, Star, Dumbbell, TrendingUp, Music, Store, Square, Flame } from 'lucide-react';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATES,
  getTemplatesByCategory,
  type TemplateCategory,
  type TemplateDefinition,
} from '@/lib/template-gallery';
import { TPL_PRESETS, TPL_CATEGORIES, type TplCategory, type TplPreset } from '@/lib/tpl-presets';
import { resetItemAppearanceStyleJson, stripPreservedThemeKeys } from '@/lib/tpl-apply';
import { resolveEffectivePageStyle } from '@/lib/surface';
import type { PageId, PageStyle, BlockStyleConfig } from '@/lib/theme-defaults';
import type { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { captureSnapshot } from '@/lib/snapshots';
import { useLanguage } from '@/hooks/useLanguage';
// AIS.0: apply path + preset preview lifted to a shared module so the
// PageSetupWizard reuses them (reuse, not fork). ApplyButton is re-imported here
// because HoverApplyOverlay / TouchApplyBar below still render it.
import { LayoutPreview, ApplyButton, useApplyLayout } from './gallery-shared';

interface TemplateGalleryProps {
  pageId: string;
  onApply: () => void;
  // TPL.3: Layout applies need the active mode + page style. Optional with safe
  // fallbacks so any other render site keeps working (Styles tab is unaffected).
  modeId?: string | null;
  activePageId?: PageId;
  themeJson?: unknown;
}

// TPL.3b TASK 2: on a full-bleed photo page an opaque button hides the photo, so
// an apply drops an OPAQUE template's button opacity to this translucent value so
// the image reads through. Tunable. Self-flagged after eyeballing a dark
// full-bleed: 0.65 mainly drives the fade render path — the filled→glass coercion
// already forces a much lower alpha — so it reads as "translucent", not a wash.
const FULLBLEED_BUTTON_OPACITY = 0.65;

// GAL.2: premium line icons for the category chips — monochrome,
// inheriting the chip's text color, replacing the emoji set.
const CATEGORY_ICONS: Record<TemplateCategory, React.ComponentType<{ className?: string }>> = {
  all: Sparkles,
  fashion: Shirt,
  influencer: Star,
  health: Dumbbell,
  marketing: TrendingUp,
  social: Smartphone,
  music: Music,
  business: Store,
  minimal: Square,
  bold: Flame,
};

function CategoryIcon({ id }: { id: TemplateCategory }) {
  const Icon = CATEGORY_ICONS[id];
  return <Icon className="mr-1.5 inline-block h-3.5 w-3.5 -mt-0.5" />;
}

// GAL.TOUCH: coarse-pointer / no-hover detection via the exact media query the
// brick names — matchMedia feature detection (NOT UA device-sniffing), mirroring
// the repo's established matchMedia hooks (use-mobile.tsx, HeroSection). SSR-safe:
// both the lazy initializer and the effect guard `window`. Chosen over a pure-CSS
// arbitrary media variant so exactly ONE Apply affordance mounts per device — no
// second (hidden) button lingering in the DOM/a11y tree. Drives which surface each
// gallery card renders: the persistent bar on touch, the hover overlay on desktop.
function useCoarsePointer(): boolean {
  const query = '(hover: none) and (pointer: coarse)';
  const [coarse, setCoarse] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setCoarse(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return coarse;
}

// GAL.TOUCH: hover-reveal overlay — fine-pointer devices ONLY. On coarse/no-hover
// devices it never mounts, so a tap's synthetic mouseenter can't pop it over the
// preview; those devices get <TouchApplyBar> instead. Desktop behavior unchanged.
function HoverApplyOverlay({
  coarse,
  hovered,
  isApplying,
  isApplied,
  onApply,
}: {
  coarse: boolean;
  hovered: boolean;
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
}) {
  return (
    <AnimatePresence>
      {!coarse && hovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center"
        >
          <ApplyButton isApplying={isApplying} isApplied={isApplied} onApply={onApply} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// GAL.TOUCH: the persistent Apply affordance for coarse/no-hover (touch) devices —
// ALWAYS visible, no gesture to discover. A full-width button in a bordered footer
// at the card's bottom edge (FS.SURFACE-consistent), below the info so it never
// covers the preview bars. Not mounted on fine-pointer devices (they hover-reveal).
function TouchApplyBar({
  coarse,
  isApplying,
  isApplied,
  onApply,
}: {
  coarse: boolean;
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
}) {
  if (!coarse) return null;
  return (
    <div data-testid="tpl-touch-apply" className="border-t border-border p-2">
      <ApplyButton isApplying={isApplying} isApplied={isApplied} onApply={onApply} className="w-full" />
    </div>
  );
}

export function TemplateGallery({ pageId, onApply, modeId, activePageId, themeJson }: TemplateGalleryProps) {
  const { t } = useLanguage();
  // TPL.3: the gallery splits into two tabs. Layouts (default) = TplPreset
  // compositions applied via applyTplPreset; Styles = the legacy theme templates,
  // behavior byte-identical to before.
  const [tab, setTab] = useState<'layouts' | 'styles'>('layouts');

  // ── Styles tab state (unchanged behavior) ──────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('all');
  const [applying, setApplying] = useState<string | null>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);

  const templates = getTemplatesByCategory(selectedCategory);

  // ── Layouts tab state ──────────────────────────────────────────────────────
  const [layoutCategory, setLayoutCategory] = useState<TplCategory | 'all'>('all');
  // AIS.0: the apply path (snapshot → theme → blocks), applying/applied preset
  // state, and the TPL.5 re-entry lock now live in useApplyLayout, shared with
  // the PageSetupWizard. Behavior is byte-identical to the former local closure.
  const { applyLayout, applyingPreset, appliedPreset } = useApplyLayout({
    pageId,
    modeId,
    activePageId,
    themeJson,
    onApply,
  });

  const layouts = layoutCategory === 'all'
    ? TPL_PRESETS
    : TPL_PRESETS.filter((p) => p.category === layoutCategory);

  // TPL.3c TASK 2.4: the Layout cards preview the rendition the ACTIVE page style
  // will actually apply (hero vs full_bleed), resolved from the same props the
  // apply path uses. Threaded into each card so the card can't drift from the
  // result. Defaults to page1/hero for any render site that omits the props.
  const layoutPageStyle: PageStyle = resolveEffectivePageStyle(themeJson, activePageId ?? 'page1');

  const applyTemplate = async (template: TemplateDefinition, applyBlockStyles: boolean = false) => {
    setApplying(template.id);
    try {
      // BUG.THEME.1: applying a template resets the VISUAL theme only
      // (background/buttons/typography/motion — the keys templates define).
      // Merge over the page's existing raw theme_json so structural keys
      // (pageStyle, headerConfig, headerCardOrder, heroConfig, pages,
      // avatar_url_page2, header image) survive. pageStyle is stripped from
      // the template payload defensively — JSON.stringify drops undefined —
      // so a template can never flip hero <-> full_bleed.
      const { data: pageRow, error: fetchError } = await supabase
        .from('pages')
        .select('theme_json')
        .eq('id', pageId)
        .single();

      if (fetchError) throw fetchError;

      const existing = (pageRow?.theme_json && typeof pageRow.theme_json === 'object')
        ? (pageRow.theme_json as Record<string, unknown>)
        : {};

      // SNAP.1c: auto-snapshot the current look BEFORE the destructive theme
      // write, so a template apply is always undoable. A capture failure aborts
      // the apply — we never overwrite the page without a safety net first.
      try {
        await captureSnapshot(pageId, t('snapshots.autoBeforeTemplate').replace('{name}', template.name), 'auto');
      } catch (snapErr) {
        console.error('[snapshots] pre-template capture failed:', snapErr);
        toast.error(t('snapshots.autoFailed'));
        return;
      }

      // TPL.3b TASK 2: the button treatment depends on the ACTIVE page's effective
      // style. Resolve it from the fresh theme_json (RAW — the resolver reads
      // pages.<id>.style, which getThemeWithDefaults strips), defaulting to page1
      // for any legacy render site that doesn't thread activePageId.
      const pageStyle = resolveEffectivePageStyle(existing, activePageId ?? 'page1');
      // full_bleed → glassy: an OPAQUE template (background_opacity 1) would hide
      // the photo, so drop it to FULLBLEED_BUTTON_OPACITY; templates that already
      // define translucency keep their own value. hero uses the template as-is.
      const templateOpacity = template.blockStyles.background_opacity ?? 1;
      const effectiveOpacity =
        pageStyle === 'full_bleed' && templateOpacity === 1
          ? FULLBLEED_BUTTON_OPACITY
          : templateOpacity;
      const effectiveBlockStyles: Partial<BlockStyleConfig> = {
        ...template.blockStyles,
        background_opacity: effectiveOpacity,
      };

      // TPL.3b TASK 1.1: total ownership at the theme level. The spread already
      // wholesale-replaces theme.buttons, but non-showcase templates omit the
      // FS.SURFACE surface keys (variant / outline_width / background_opacity),
      // which resolveButtonSurface + LinkButton read FIRST — so own them explicitly
      // and deterministically. Prefer the template's OWN theme.buttons value
      // (showcase templates set variant/outline_width there — e.g. golden-hour's
      // outline_width:1 must survive) and fall back to blockStyles otherwise.
      // Structural non-button keys (pageStyle / heroConfig* / pages / header*) still
      // survive via `existing` — BUG.THEME.1 intact; this owns button appearance only.
      const tb = (template.theme.buttons ?? {}) as Record<string, any>;
      const ownedVariant = tb.variant ?? effectiveBlockStyles.variant;
      const ownedButtons = {
        variant: ownedVariant,
        outline_width:
          tb.outline_width ??
          (ownedVariant === 'outline' ? (effectiveBlockStyles.border_width ?? 1) : 0),
        background_opacity: tb.background_opacity ?? effectiveOpacity,
      };

      // The incoming template gives up every PRESERVED_THEME_KEYS entry (pageStyle,
      // desktopStage) so the page's own structural settings always win the merge.
      const nextTheme = {
        ...existing,
        ...stripPreservedThemeKeys(template.theme),
      };
      nextTheme.buttons = { ...(nextTheme.buttons ?? {}), ...ownedButtons };

      const { error: pageError } = await supabase
        .from('pages')
        .update({ theme_json: nextTheme })
        .eq('id', pageId);

      if (pageError) throw pageError;

      // Optionally apply block styles to all link-type blocks
      if (applyBlockStyles) {
        // Get all modes for this page
        const { data: modes, error: modesError } = await supabase
          .from('modes')
          .select('id')
          .eq('page_id', pageId);

        if (modesError) throw modesError;

        if (modes && modes.length > 0) {
          const modeIds = modes.map((m) => m.id);

          // Get all blocks that support style variants
          const { data: blocks, error: blocksError } = await supabase
            .from('blocks')
            .select('id, type, title')
            .in('mode_id', modeIds)
            .in('type', ['primary_cta', 'links']);

          if (blocksError) throw blocksError;

          // Update each block's title with the new style config (full replacement
          // of the `style` key — the template owns per-block appearance).
          if (blocks && blocks.length > 0) {
            for (const block of blocks) {
              let existingConfig: Record<string, unknown> = {};
              try {
                existingConfig = JSON.parse(block.title || '{}');
              } catch {
                existingConfig = {};
              }

              const newConfig = {
                ...existingConfig,
                style: effectiveBlockStyles,
              };

              const { error: updateError } = await supabase
                .from('blocks')
                .update({ title: JSON.stringify(newConfig) })
                .eq('id', block.id);

              if (updateError) {
                console.error('Error updating block style:', updateError);
              }
            }

            // TPL.3b TASK 1.3: a Styles apply owns EVERY layer. On links blocks the
            // per-item overrides (block_items.style_json.{border_color, border_width,
            // bg_gradient} and the bg_color / title_color columns) WIN over the
            // block-level style in LinksBlock.buildLinkButton, so a stale look (e.g.
            // an old orange outline) survives a theme + block apply. Clear the
            // appearance overrides ONLY — never content (labels, urls, images, or the
            // leading-icon style_json keys icon_source/icon_image/icon_color). The
            // pre-apply auto-snapshot above makes this recoverable.
            const linkBlockIds = blocks.filter((b) => b.type === 'links').map((b) => b.id);
            if (linkBlockIds.length > 0) {
              const { data: items, error: itemsError } = await supabase
                .from('block_items')
                .select('id, style_json, bg_color, title_color')
                .in('block_id', linkBlockIds);

              if (itemsError) throw itemsError;

              for (const item of items ?? []) {
                // ANIM.1: the reset list (incl. `animation`) lives in tpl-apply's
                // PER_ITEM_APPEARANCE_KEYS; this strips them, keeping content keys
                // (icon_source/…). Behavior-identical to the old inline deletes.
                const { next: nextStyle, hadAppearance } = resetItemAppearanceStyleJson(item.style_json);
                const hadColumns = item.bg_color != null || item.title_color != null;
                // Skip clean items — no needless writes on every apply.
                if (!hadAppearance && !hadColumns) continue;

                const { error: itemError } = await supabase
                  .from('block_items')
                  .update({
                    style_json: nextStyle as Tables<'block_items'>['style_json'],
                    bg_color: null,
                    title_color: null,
                  })
                  .eq('id', item.id);

                if (itemError) {
                  console.error('Error resetting item style:', itemError);
                }
              }
            }
          }
        }
      }

      setAppliedTemplate(template.id);
      toast.success(t('templateGallery.appliedToast').replace('{name}', template.name));
      onApply();

      // Reset applied indicator after a delay
      setTimeout(() => setAppliedTemplate(null), 2000);
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error(t('templateGallery.applyFailed'));
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* TPL.3: Layouts / Styles tab header — full-width segmented control,
          panel-friendly (mirrors the LinksEditor color-tab bar). */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        {(['layouts', 'styles'] as const).map((key) => (
          <button
            key={key}
            type="button"
            data-testid={`gallery-tab-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              'flex-1 py-2 text-sm font-medium transition-colors',
              tab === key ? 'bg-secondary text-foreground' : 'text-muted-foreground'
            )}
          >
            {t(key === 'layouts' ? 'templateGallery.tab.layouts' : 'templateGallery.tab.styles')}
          </button>
        ))}
      </div>

      {tab === 'layouts' ? (
        <>
          {/* Layout category chips: leading "All" + TPL_CATEGORIES. Reuses the
              Styles chip styling; icons omitted (optional per brick). */}
          <div className="w-full">
            <div className="flex flex-wrap gap-2 pb-2">
              {([{ id: 'all' as const, label: 'tpl.category.all' }, ...TPL_CATEGORIES]).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setLayoutCategory(c.id)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                    'border border-border hover:border-primary/50',
                    layoutCategory === c.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(c.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Layout Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {layouts.map((preset) => (
                <LayoutCard
                  key={preset.id}
                  preset={preset}
                  pageStyle={layoutPageStyle}
                  isApplying={applyingPreset === preset.id}
                  isApplied={appliedPreset === preset.id}
                  onApply={() => applyLayout(preset)}
                />
              ))}
            </AnimatePresence>
          </div>

          {layouts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('templateGallery.emptyCategory')}</p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Category Chips — GAL.2-v2: wrapping rows, all ten always
              visible. The old horizontal ScrollArea overflowed without
              actually scrolling, guillotining the last chips. */}
          <div className="w-full">
            <div className="flex flex-wrap gap-2 pb-2">
              {TEMPLATE_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                    'border border-border hover:border-primary/50',
                    selectedCategory === category.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground hover:text-foreground'
                  )}
                >
                  <CategoryIcon id={category.id} />
                  {t(category.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Template Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isApplying={applying === template.id}
                  isApplied={appliedTemplate === template.id}
                  onApply={() => applyTemplate(template, true)}
                />
              ))}
            </AnimatePresence>
          </div>

          {templates.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t('templateGallery.emptyCategory')}</p>
            </div>
          )}
        </>
      )}

    </div>
  );
}

interface LayoutCardProps {
  preset: TplPreset;
  pageStyle: PageStyle;
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
}

// TPL.3: a Layout preset card. Preview is theme-derived (real preview assets are
// TPL.4 scope) so the grid still reads as "alive" next to the Styles cards.
function LayoutCard({ preset, pageStyle, isApplying, isApplied, onApply }: LayoutCardProps) {
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  // GAL.TOUCH: touch devices get a persistent Apply bar (no hover to discover).
  const coarse = useCoarsePointer();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        data-testid="tpl-layout-card"
        className="border border-border rounded-xl overflow-hidden bg-card hover:border-primary/50 transition-all"
      >
        {/* AIS.0: theme-derived preview via the shared LayoutPreview (the same
            component the PageSetupWizard renders). The hover overlay is injected
            as its child so the touch/desktop apply affordances are unchanged. */}
        <LayoutPreview preset={preset} pageStyle={pageStyle}>
          {/* GAL.TOUCH: fine-pointer devices reveal Apply on hover (TPL.3d,
              unchanged); coarse/no-hover devices use the persistent <TouchApplyBar>
              below instead — one shared mechanism across both card types. */}
          <HoverApplyOverlay
            coarse={coarse}
            hovered={hovered}
            isApplying={isApplying}
            isApplied={isApplied}
            onApply={onApply}
          />
        </LayoutPreview>

        {/* Preset Info: name, description, category tag */}
        <div className="p-2.5">
          <p className="text-sm font-medium text-foreground truncate">{preset.name}</p>
          <p className="text-xs text-muted-foreground truncate">{t(preset.description)}</p>
          <span className="mt-1.5 inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t(`tpl.category.${preset.category}`)}
          </span>
        </div>

        <TouchApplyBar coarse={coarse} isApplying={isApplying} isApplied={isApplied} onApply={onApply} />
      </div>
    </motion.div>
  );
}

interface TemplateCardProps {
  template: TemplateDefinition;
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
}

function TemplateCard({ template, isApplying, isApplied, onApply }: TemplateCardProps) {
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  // GAL.TOUCH: touch devices get a persistent Apply bar (no hover to discover).
  const coarse = useCoarsePointer();

  // Generate inline preview styles
  const getPreviewBackground = () => {
    if (template.theme.background.type === 'gradient') {
      return template.theme.background.gradient_css;
    }
    return template.theme.background.solid_color;
  };

  const getButtonRadius = () => {
    switch (template.theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '6px';
      case 'square': return '2px';
      default: return '6px';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="border border-border rounded-xl overflow-hidden bg-card hover:border-primary/50 transition-all">
        {/* Mobile Preview Mock */}
        <div className="relative aspect-[9/16] overflow-hidden">
          {/* Background */}
          <div
            className="absolute inset-0"
            style={{ background: getPreviewBackground() }}
          />

          {/* Phone Frame Overlay */}
          <div className="absolute inset-0 flex flex-col items-center">
            {/* Hero photo mock — full-width half-screen hero, matches the real layout */}
            <div
              className="w-full mb-2"
              style={{ height: '42%', backgroundColor: template.theme.buttons.fill_color, opacity: 0.85 }}
            />
            {/* Name mock */}
            <div
              className="w-16 h-2 rounded mb-1"
              style={{ backgroundColor: template.theme.typography.text_color, opacity: 0.8 }}
            />
            {/* Bio mock */}
            <div
              className="w-20 h-1.5 rounded mb-4"
              style={{ backgroundColor: template.theme.typography.text_color, opacity: 0.4 }}
            />

            {/* Button mocks */}
            <div className="w-full space-y-2 px-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-full h-6"
                  style={{
                    backgroundColor: template.blockStyles.variant === 'outline' || template.blockStyles.variant === 'glass'
                      ? 'transparent'
                      : template.theme.buttons.fill_color,
                    border: template.blockStyles.variant === 'outline' || template.blockStyles.variant === 'glass'
                      ? `1px solid ${template.theme.buttons.fill_color}`
                      : 'none',
                    borderRadius: getButtonRadius(),
                    opacity: 1 - i * 0.15,
                  }}
                />
              ))}
            </div>
          </div>

          {/* GAL.TOUCH: hover-reveal on fine pointers; coarse/no-hover devices use
              the persistent <TouchApplyBar> below (shared with LayoutCard). */}
          <HoverApplyOverlay
            coarse={coarse}
            hovered={hovered}
            isApplying={isApplying}
            isApplied={isApplied}
            onApply={onApply}
          />
        </div>

        {/* Template Info */}
        <div className="p-2.5">
          <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
          <p className="text-xs text-muted-foreground truncate">{t(template.description)}</p>
        </div>

        <TouchApplyBar coarse={coarse} isApplying={isApplying} isApplied={isApplied} onApply={onApply} />
      </div>
    </motion.div>
  );
}

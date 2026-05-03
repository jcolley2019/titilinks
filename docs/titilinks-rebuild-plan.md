# TitiLinks → Link.me Parity Rebuild — Audit & Plan

_Date: 2026-05-03. Read-only audit by Claude. All file:line citations are verified against the working tree at the time of writing._

---

## A. Executive Summary

TitiLinks already has more of the Link.me skeleton than it looks like from the outside. The DB schema covers 11 block types, the public renderer (`EditableProfileView.tsx`) already implements a **scroll-driven sticky hero with content sliding over it on a higher z-axis**, the **6px card-rhythm** is in place, `LinkButton` accepts the full `big | medium | small | button` size system, and a **slide-out editor panel host already exists** in `ProfileDashboard.tsx` — used today for the "add new block" flow with 7 editors already wired in `panelMode`.

The gaps are concentrated and concrete: (1) **per-card customization is wired in the UI but not in the schema or save path** — `LinksEditor`'s size/Title/Background pickers don't persist anywhere because `block_items` has no columns for them; (2) the **slide-out panel host is not used for editing _existing_ blocks** — the `onBlockEdit` flow in `Editor.tsx` still routes through `BlockEditorContent` → `BlockEditorDialog` (Radix dialog overlay); (3) **no color-matched scroll header, no auto-scrolling social row, no URL-bar collapse** — these specific Link.me micro-behaviors haven't been started; (4) several **dead components** (`BlockList.tsx`, `BlockItem.tsx`, `MobileDashboard.tsx`, `MobileInlineEditor.tsx`) sit in the tree with no consumers; (5) the **3-col desktop dashboard** described in `design-system/README.md` does not exist — current dashboard is 2-col (sidebar + main with custom phone-frame chrome).

The rebuild scope is **narrower than a full rewrite**. The right path is: lock down the schema gap first (it blocks _everything_ per-card), finish the Phase 2 panel host that's already half-built, then layer the missing scroll micro-behaviors. After that, feature parity adds (Music Smart Link, Custom Events, animations, etc.) sit on top cleanly.

---

## B. What Already Exists (Inventory)

### B.1 Block rendering & visual layer

| System | Location | Status |
|---|---|---|
| `LinkButton` size system (`lb-size-big/medium/small/button`) | `src/components/LinkButton.tsx:159-168` | ✅ Built — props plumbed, CSS classes emitted |
| `LinkButton` span system (`lb-span-full/half`) | `src/components/LinkButton.tsx:163` | 🟡 Class emitted but no parent flex-row wrapper exists; halves don't actually pair |
| `LinkRow` flex wrapper | `src/components/LinkButton.tsx:89-91` (`<div className="lb-row">`) | 🟡 Component exists but **no consumer** in any block. Not wired. |
| `MediaThumb` (image / video / YouTube poster) | `src/components/MediaThumb.tsx:28-65` | ✅ Built |
| `BlockRenderer` switch (all 11 types) | `src/components/EditableProfileView.tsx:170-198` | ✅ Built |
| Sticky hero (content slides over photo) | `src/components/EditableProfileView.tsx:1417` (`position: sticky; top: 0; height: 50dvh; zIndex: 1`) | ✅ Built |
| Gradient fade between hero and content | `src/components/EditableProfileView.tsx:1486-1498` (`linear-gradient(to bottom, transparent 0%, #0e0c09 100%)`) | ✅ Built |
| 6px card-to-card gap | `src/components/EditableProfileView.tsx:1910` (edit mode) and `:2006` (view mode) — both use `flex flex-col gap-[6px]` | ✅ Built |
| `SortablePreviewCard` (edit-mode block wrapper) | `src/components/EditableProfileView.tsx:624-720` | ✅ Built |
| Free-drag header cards (`NameHandleCard`, `SocialIconsCard`) | `src/components/EditableProfileView.tsx:322+` and `:486+` | ✅ Built |
| `headerCardOrder` (header section reorder) | Used at `:1925-1980` | ✅ Built |
| Block reorder (DndContext) | `src/components/EditableProfileView.tsx:1982-2001` | ✅ Built |
| Phone frame on desktop preview | `src/pages/Editor.tsx:384-411` | ✅ Built |
| Blurred avatar background on desktop editor | `src/pages/Editor.tsx:317-333` | ✅ Built |
| Page 1 / Page 2 mode tabs | `src/pages/Editor.tsx:341-365`, with mode detection in `src/pages/PublicProfile.tsx:39-71` | ✅ Built |
| Photo crop with zoom + face-aware AI crop | `src/components/EditableProfileView.tsx:971-1016` (`getCroppedCanvas`), full crop modal `:1667-1900` | ✅ Built |
| `avatar_original_url` re-crop persistence | DB col `pages.avatar_original_url` (`src/integrations/supabase/types.ts:284`); editor reads it at `:1451` | ✅ Built (shipped 2026-04-26) |

### B.2 Block components (`src/components/blocks/`)

All 9 extracted block components from Phase 3a are in place. The two stragglers (`bio`, `gallery`) are still inline in `EditableProfileView.tsx`.

| Block | File | Lines | Notes |
|---|---|---|---|
| `primary_cta` | `blocks/PrimaryCtaBlock.tsx` | 60 | ✅ Reads block.title JSON for `style`. Hardcodes `size={item.subtitle ? 'medium' : 'button'}` at `:55`. |
| `social_links` | `blocks/SocialLinksBlock.tsx` | 53 | ✅ `flex flex-wrap justify-center gap-3`. **No auto-scroll on overflow.** |
| `links` | `blocks/LinksBlock.tsx` | 72 | 🟡 Reads block.title JSON for `style` but **forces `size="medium"`** at `:66`. Per-item size from editor never reaches render. |
| `product_cards` | `blocks/ProductCardsBlock.tsx` | 269 | ✅ 'stacked' (2-col grid) and 'split' (horizontal) layouts via `block.title.layout`. Full price/discount/badge/CTA support. |
| `featured_media` | `blocks/FeaturedMediaBlock.tsx` | 114 | ✅ aspect-video + gradient overlay. |
| `hero_card` | `blocks/HeroCardBlock.tsx` | 102 | ✅ Reads config from **`item.badge` JSON** (different storage than other blocks). aspect-square recently shipped. |
| `social_icon_row` | `blocks/SocialIconRowBlock.tsx` | 105 | ✅ Reads config from `block.title` JSON: `icon_size`, `spacing`, `use_theme_color`, `custom_color`. Uses `flex flex-wrap` — **no auto-scroll**. |
| `email_subscribe` | `blocks/EmailSubscribeBlock.tsx` | 208 | ✅ Reads config from **`item.badge` JSON**. Uses Supabase RPC `subscribe_to_page`. |
| `content_section` | `blocks/ContentSectionBlock.tsx` | 272 | ✅ 3 layouts (carousel + dots / grid / list). Reads config from `block.title` JSON. |
| `bio` | inline in `EditableProfileView.tsx:201-215` | — | ✅ Single paragraph from `items[0].label`. Uses `whitespace-pre-wrap` so flex-height already works. Not extracted to `blocks/`. |
| `gallery` | inline in `EditableProfileView.tsx:217-306` | — | ✅ Horizontal `overflow-x-auto snap-x snap-mandatory` with chevron arrows. Not extracted to `blocks/`. |

Per-block config storage inconsistency (confirmed):

- **Stored in `block.title` JSON:** `links`, `primary_cta`, `social_icon_row`, `content_section`, `product_cards` (layout)
- **Stored in `item.badge` JSON:** `hero_card`, `email_subscribe`
- **Stored in `pages.theme_json`:** header layout (`headerCardOrder`, `nameSize`, `nameColor`, `iconsCardY`, `contentStartY`, etc.)
- **Stored in DB columns directly:** everything in `block_items` schema

This inconsistency is real but not currently breaking anything — all readers know which field to parse for which block type. Worth consolidating on one pattern eventually, not urgently.

### B.3 Editors (`src/components/editors/`)

12 editor files. `panelMode` prop is wired in 7 of the block editors:

| Editor | File | Lines | `panelMode`? | Persists size? | Has Title/Bg color? |
|---|---|---|---|---|---|
| `LinksEditor` | `editors/LinksEditor.tsx` | 836 | ✅ (`:365, :821-826`) | ❌ — UI exists at `:211-225` but `handleSave` `:559-589` doesn't write `size`/`bg_color`/`title_color`. `fetchItems` `:426-439` hardcodes `size: 'big'`. | ✅ UI at `:263-307` |
| `PrimaryCtaEditor` | `editors/PrimaryCtaEditor.tsx` | 437 | ✅ (`:66, :413`) | n/a (single item, single size by design) | n/a |
| `SocialLinksEditor` | `editors/SocialLinksEditor.tsx` | 736 | ✅ (`:285, :712`) | n/a | n/a |
| `ProductCardsEditor` | `editors/ProductCardsEditor.tsx` | 795 | ✅ (`:351, :771`) | n/a | n/a |
| `EmailSubscribeEditor` | `editors/EmailSubscribeEditor.tsx` | 317 | ✅ (`:44, :293`) | n/a | n/a |
| `GalleryEditor` | `editors/GalleryEditor.tsx` | 327 | ✅ (`:34, :303`) | n/a | n/a |
| `BioEditor` | `editors/BioEditor.tsx` | 153 | ✅ (`:23, :132`) | n/a | n/a |
| `ContentSectionEditor` | `editors/ContentSectionEditor.tsx` | 644 | ❌ | n/a | n/a |
| `FeaturedMediaEditor` | `editors/FeaturedMediaEditor.tsx` | 544 | ❌ | n/a | n/a |
| `SocialIconRowEditor` | `editors/SocialIconRowEditor.tsx` | 632 | ❌ | n/a | n/a |
| `HeroCardEditor` | `editors/HeroCardEditor.tsx` | 490 | ❌ | n/a | n/a |
| Helper editors | `editors/SuggestLinksDialog.tsx` (300), `editors/ThumbnailUpload.tsx`, `editors/CanvaDesignPicker.tsx`, `editors/TemplateGallery.tsx`, `editors/DesignEditor.tsx`, `editors/ThemePreview.tsx` | — | n/a | n/a | n/a |

So **4 of the 11 block editors do NOT yet implement `panelMode`** — that's the remaining Phase 2 editor work.

`LinksEditor` has the most complete editor UI of any of them — it includes the per-item detail panel (`LinkDetailPanel` at `:152-358`) with image upload, size picker, URL/title/subtitle, two-tab color picker, 18+ toggle, and the Animations Pro upsell card. None of the size/color fields persist.

### B.4 Editor host architecture

The editor flow has **two parallel hosts** in the codebase right now:

1. **Dialog overlay path** (legacy, still used for editing existing blocks):
   `Editor.tsx:439-445` → `<BlockEditorContent>` → `BlockEditorContent.tsx` (24-line shim) → `<BlockEditorDialog>` → `BlockEditorDialog.tsx:65-173` (switch on block.type, renders `<LinksEditor open={open} />` etc. **without** `panelMode`).
   This is the path triggered when the user **taps a block in the live preview**.

2. **Slide-out panel path** (new, Phase 2 partial):
   `Editor.tsx:430-437` mounts `<ProfileDashboard>` → `ProfileDashboard.tsx:278-307` renders `editorProps.panelMode = true` and switches on activeBlockType to render the panelMode-capable editors.
   This is **only used for the "add new block" flow** triggered from the Edit Profile button (`Editor.tsx:315`, mobile `DashboardLayout.tsx:355-362`, desktop `Editor.tsx:370-374`).

The seam where the unified panel host plugs in is `Editor.tsx:235-238` — `handleEditBlock` currently flips `editorOpen=true` and the dialog renders. To complete Phase 2, this should instead route through a panel host (either reuse `ProfileDashboard` or create a new `BlockEditorPanel` and have `ProfileDashboard` defer to it for both new + existing flows).

`BlockEditorContent.tsx` itself is a 24-line "Phase 1 shim" — its docblock explicitly says _"Phase 2 will render editor content inline in a slide-out panel instead of a dialog overlay."_ That phase wasn't completed.

### B.5 Schema (`src/integrations/supabase/types.ts`)

**`pages` table** (`:282-348`):
```
avatar_original_url   text | null
avatar_url            text | null
bio                   text | null
display_name          text | null
goal_primary_offer_item_id  uuid | null  -> block_items.id
goal_recruit_item_id        uuid | null  -> block_items.id
handle                text  (PK behavior — unique-lower)
id                    uuid
theme_json            jsonb | null
user_id               uuid  -> profiles.id
created_at, updated_at
```

**`modes` table** (`:215-249`):
```
id              uuid
page_id         uuid -> pages.id
type            mode_type ('shop' | 'recruit')
sticky_cta_enabled  boolean
created_at, updated_at
```

**`blocks` table** (`:79-119`):
```
id          uuid
mode_id     uuid -> modes.id
type        block_type (12 enum values, see below)
title       text | null      <-- doubles as JSON config blob for several block types
order_index int
is_enabled  boolean
created_at, updated_at
```

**`block_items` table** (`:17-77`):
```
id                  uuid
block_id            uuid -> blocks.id
label               text  (NOT NULL)
url                 text  (NOT NULL)
subtitle            text | null
badge               text | null     <-- doubles as JSON config blob for hero_card, email_subscribe
image_url           text | null
is_adult            boolean | null
price               numeric | null
compare_at_price    numeric | null
currency            text | null
cta_label           text | null
order_index         int
created_at, updated_at
```

**`block_type` enum** (`:486-498`): `primary_cta`, `product_cards`, `featured_media`, `social_links`, `links`, `hero_card`, `social_icon_row`, `email_subscribe`, `content_section`, `product_catalog`, `gallery`, `bio` (12 values; `product_catalog` is in the enum but has no renderer).

**Critical schema gap:** `block_items` has **no column for** per-item `size`, per-item `bg_color`, per-item `title_color`, per-item `style_json`. There's nowhere for the LinksEditor per-item picker output to land.

### B.6 Theme system (`src/lib/theme-defaults.ts`)

```
ThemeJson:
  background       ThemeBackground (type: solid|gradient|image, solid_color, gradient_css, image_url, overlay_color, overlay_opacity, source)
  buttons          ThemeButtons (shape: pill|rounded|square, fill_color, text_color, border_enabled, border_color, shadow_enabled, density: compact|normal|roomy, variant_style?: 'velvet')
  typography       ThemeTypography (font: 14 named fonts incl 'playfair', text_color)
  motion           ThemeMotion (enabled)
  header?          ThemeHeader (image_url, enabled, source, layout: 'overlay'|'card'|'split'|'cinematic'|'immersive')
  auto_contrast?   boolean
  online_indicator? boolean
  canva_last_import? CanvaImportMetadata

BlockStyleConfig (per-block, stored in block.title JSON for some block types):
  variant: 'filled'|'outline'|'glass'|'minimal'
  border_width, border_color
  background_opacity
  font_style: 'normal'|'mono'|'serif'
  letter_spacing
  size?: 'big'|'medium'|'small'|'button'   <-- typed but not persisted by any editor
  span?: 'full'|'half'                     <-- typed but not persisted by any editor
```

The `size` and `span` fields on `BlockStyleConfig` are only ever read from `block.title` JSON in `LinksBlock` etc. — but `LinksEditor.handleSave` doesn't write them, and they're per-block here, not per-item. Per-item size/color is the harder gap.

`pages.theme_json` also stores ad-hoc keys: `pages.page1.label`, `pages.page2.label`, `linkLayout`, `linkCount`, `headerConfig` (with `nameSize`, `handleSize`, `nameColor`, `handleColor`, `namePadTop`, `namePadBottom`, `nameHandleGap`, `iconsPaddingY`, `iconSize`, `nameCardY`, `iconsCardY`, `contentStartY`, `headerCardOrder`), `avatar_url_page2`. These are referenced via `theme_json as ThemeJson` casts and are not in the type definition.

### B.7 Standalone systems (already shipping)

| System | Location | Status |
|---|---|---|
| Shortlinks (`/r/<code>`) | `supabase/functions/shortlinks/index.ts` + `short_links` table + `src/components/LinkTools.tsx` + `src/pages/ShortLinkRedirect.tsx` | ✅ Built. SQL function `resolve_short_link(p_code, p_referrer, p_user_agent)`. |
| QR codes for shortlinks | `supabase/functions/qr/index.ts` | ✅ Built |
| AI link suggestions | `supabase/functions/suggest-links/index.ts` + `src/components/editors/SuggestLinksDialog.tsx` | ✅ Built |
| AI photo enhance (Real-ESRGAN via Replicate `crystal-upscaler`) | `supabase/functions/ai-enhance/index.ts` | ✅ Built — confirmed working in production 2026-04-10 (memory entry) |
| AI photo crop (face-aware) | `supabase/functions/ai-crop/index.ts` + `@vladmandic/face-api` browser-side | ✅ Built |
| Adult content gating | `src/components/AdultContentDialog.tsx` + `is_adult` col + `hasAdultConsent()` | ✅ Built |
| Onboarding form | `src/components/OnboardingForm.tsx` | ✅ Built |
| AI onboarding content | `supabase/functions/suggest-onboarding-content/index.ts` + `src/pages/AISetup.tsx` | ✅ Built |
| Auto-populate placeholder blocks | `src/pages/Editor.tsx:53-88` — runs from `theme_json.linkLayout` + `linkCount` | ✅ Built |
| Modes / Page 1 / Page 2 | `modes` table with `type: 'shop'|'recruit'` + `detectMode` in `src/pages/PublicProfile.tsx:39-71` (URL params, UTM, referrer) | ✅ Built |
| Canva integration | `supabase/functions/canva-*` (6 edge functions) + `canva_connections` + `pending_canva_auth` tables + `src/components/editors/CanvaDesignPicker.tsx` | ✅ Built |
| Sticky CTA bar | `src/components/StickyCtaBar.tsx` + `modes.sticky_cta_enabled` col | ✅ Built |
| Email capture | `page_subscribers` table + `subscribe_to_page` RPC | ✅ Built |
| AI bio generator | `supabase/functions/generate-bio/index.ts` | ✅ Built |
| Event tracking | `events` table + `useEventTracking` hook + `event_type: page_view|outbound_click|mode_routed` | ✅ Built |
| Goals (primary offer / recruit) | `pages.goal_primary_offer_item_id`, `pages.goal_recruit_item_id` + `GoalsPanel.tsx` | ✅ Built |
| i18n (EN/ES) | `useLanguage` hook + `translateContent` helper wired into all blocks | ✅ Built |
| Haptic feedback | `useHapticFeedback` hook called on touchstart in `LinkButton`, `ProductCardsBlock` | ✅ Built |
| Responsive viewport | `index.html:5` — `viewport-fit=cover` set | 🟡 Partial — no `theme-color`, no `apple-mobile-web-app-capable` |

### B.8 Dashboard layout

- `DashboardLayout.tsx` is **2-column on desktop**: fixed 64-wide left sidebar (`:224-308`) + main content area (`:478-482`).
- `src/pages/Editor.tsx:317-411` lays its own content inside that main area: blurred-bg + top-bar + centered phone frame.
- `design-system/README.md:117` says: _"Dashboard is **3 cols on ≥1024px**: left = profile preview / phone frame, center = block list, right = editor panel."_ This is an **explicit unrealized target**.

---

## C. What's Missing or Broken

### C.1 Slide-out panel host for editing existing blocks — **MISSING (Phase 2)**

Confirmed at `Editor.tsx:439-445`:
```
<BlockEditorContent
  blockId={editingBlockId}
  open={editorOpen}
  onOpenChange={handleEditorClose}
  onSave={fetchBlocks}
/>
```
That shim renders `BlockEditorDialog`, which renders editors **without `panelMode`** — i.e., as Radix `<Dialog>` overlays. Tapping a block in the preview opens a centered dialog, not a right-side panel.

`ProfileDashboard.tsx` already has the slide-out chrome and switch — it just isn't called from `handleEditBlock`. The seam is small.

### C.2 Per-item size / bg_color / title_color persistence — **BROKEN END-TO-END**

Three independent layers all need to change for the LinksEditor's per-item customization to actually do anything:

1. **DB**: `block_items` has no `size`, `bg_color`, `title_color`, `style_json` columns. (`src/integrations/supabase/types.ts:17-77`).
2. **Save path**: `LinksEditor.tsx:559-589` `handleSave` builds an insert/update payload with `label, url, subtitle, badge, is_adult, image_url, order_index` — no size/color fields.
3. **Read path**: `LinksEditor.tsx:426-439` `fetchItems` hardcodes `size: 'big' as const, bg_color: null, title_color: null` instead of reading from existing data.
4. **Render path**: `LinksBlock.tsx:66` hardcodes `size="medium"` regardless of any per-item data.

So the user can pick "Big" and a gold background in the editor, hit Save, and absolutely nothing about the rendered link changes. The UI is a Potemkin village.

### C.3 Color-matched scroll header — **MISSING**

There's no scroll listener anywhere that reads `theme.background.solid_color` and renders a pinned top bar matching it. The closest behavior is `PublicProfile.tsx:84-89`, which only tracks `window.scrollY > 300` to show a "scroll to top" button (and that button isn't even rendered — it sets state that nothing reads).

### C.4 Auto-scrolling overflow social row — **MISSING**

`SocialLinksBlock.tsx:28` and `SocialIconRowBlock.tsx:83` both use `flex flex-wrap justify-center gap-3`. No marquee, no `@keyframes`, no `requestAnimationFrame` loop. Searching for `marquee|@keyframes.*translateX|infinite|continuous` in the source returns nothing relevant.

### C.5 URL bar collapse — **MISSING**

`index.html:5` has `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />` but lacks `apple-mobile-web-app-capable`, `theme-color`, and there's no JS scroll handler that drives `dvh`-based shrinking. The Link.me effect is done via a combination of `viewport-fit=cover` + `theme-color` matching the page bg + `100dvh` instead of `100vh` + scroll-driven trim. The first piece is in place; the rest is not.

### C.6 `getCroppedCanvas` right/bottom clamp — **BUG**

`EditableProfileView.tsx:1004-1007`:
```
const srcX = Math.max(0, Math.round(relX * scale));
const srcY = Math.max(0, Math.round(relY * scale));
const srcW = Math.min(Math.round(fw * scale), nw - srcX);
const srcH = Math.min(Math.round(fh * scale), nh - srcY);
```
When the user pans the crop frame past the natural-image right or bottom edge, `srcW`/`srcH` get **truncated** rather than `srcX`/`srcY` getting clamped back. The output canvas comes out non-square. The fix is to clamp `srcX = Math.min(srcX, nw - fwScaled)` etc. before computing `srcW`/`srcH`, so the source rect is always full-size and just slid back inside the image.

### C.7 3-column dashboard layout — **MISSING**

Per `design-system/README.md:117`. Current `DashboardLayout.tsx` is 2-col.

### C.8 Half-width pairing in render — **NOT WIRED**

`LinkButton` emits `lb-span-half` when `span='half'`, but there's no parent flex-row that groups two adjacent halves into one row. `LinksBlock.tsx:43-71` renders all items in a single `<div className="space-y-3">` — vertical stack, no flex-row pairing logic. The `LinkRow` component at `LinkButton.tsx:89-91` is unused. So even if `span='half'` were persisted, two adjacent halves would render in their own full-width rows.

### C.9 Dead components — **CONFIRMED UNUSED**

| File | Lines | Imported by |
|---|---|---|
| `src/components/BlockList.tsx` | 171 | nothing (verified by grep across `src/`) |
| `src/components/BlockItem.tsx` | 99 | only `BlockList.tsx` (its only consumer is itself unused) |
| `src/components/MobileDashboard.tsx` | 306 | nothing |
| `src/components/MobileInlineEditor.tsx` | 155 | nothing |

Total ~731 lines of dead code. `BlockList`/`BlockItem` look like an early flat-list dashboard concept (they predate the visual `SortablePreviewCard` approach that won). `MobileDashboard`/`MobileInlineEditor` look like a parallel mobile UX path that was abandoned in favor of `ProfileDashboard` + `EditableProfileView`'s edit mode.

### C.10 Other smaller gaps

- `BlockEditorDialog.tsx:156-157` returns `null` for `gallery` — gallery has no edit-from-existing-block flow via the dialog. It works only via the inline `+` button in `EditableProfileView`'s `GalleryBlock`. Not necessarily broken, but inconsistent.
- `block_type` enum includes `product_catalog` (`types.ts:496`) but no renderer or editor exists for it. Phantom enum value.
- `LinksEditor` `LinkDetailPanel` renders a nested back/save view _inside_ the main editor view — when this opens in `panelMode`, the outer header from `ProfileDashboard.tsx:331-351` doesn't update; the user gets two stacked headers. Cosmetic but visible.
- `BlockEditorContent.tsx` is a 24-line wrapper around `BlockEditorDialog` adding zero behavior. Once the panel host lands, this shim should be removed (its docblock is honest about being temporary).
- The `lb-velvet`, `lb-size-*`, `lb-span-*`, `lb-text`, `lb-thumb`, `lb-arrow`, `lb-meta`, `lb-cover`, `lb-row` classes referenced in `LinkButton.tsx:160-202` need a stylesheet — I didn't find a CSS file defining `.lb-velvet`, `.lb-size-big` etc. in `src/index.css`. The classes get emitted, but if no rule defines size-specific layout (height, image position, text-size), the four sizes will all visually render the same. **This is the actual reason "all 4 sizes" doesn't work end-to-end** even before the persistence issue. → Verify `src/index.css` and look for these classes; add the rules if absent.

---

## D. Per-Block-Type Status Matrix

| Block type | Renderer | Editor | Has `panelMode`? | Per-item size in editor? | Config storage |
|---|---|---|---|---|---|
| `primary_cta` | `blocks/PrimaryCtaBlock.tsx` | `editors/PrimaryCtaEditor.tsx` | ✅ | n/a (single item) | `block.title` JSON |
| `social_links` | `blocks/SocialLinksBlock.tsx` | `editors/SocialLinksEditor.tsx` | ✅ | n/a (icons only) | none |
| `links` | `blocks/LinksBlock.tsx` | `editors/LinksEditor.tsx` | ✅ | 🟡 UI built, not persisted | `block.title` JSON for block-level; **per-item has nowhere to go** |
| `product_cards` | `blocks/ProductCardsBlock.tsx` | `editors/ProductCardsEditor.tsx` | ✅ | n/a | `block.title.layout` |
| `featured_media` | `blocks/FeaturedMediaBlock.tsx` | `editors/FeaturedMediaEditor.tsx` | ❌ | n/a | none currently used |
| `hero_card` | `blocks/HeroCardBlock.tsx` | `editors/HeroCardEditor.tsx` | ❌ | n/a | `item.badge` JSON |
| `social_icon_row` | `blocks/SocialIconRowBlock.tsx` | `editors/SocialIconRowEditor.tsx` | ❌ | n/a | `block.title` JSON |
| `email_subscribe` | `blocks/EmailSubscribeBlock.tsx` | `editors/EmailSubscribeEditor.tsx` | ✅ | n/a | `item.badge` JSON |
| `content_section` | `blocks/ContentSectionBlock.tsx` | `editors/ContentSectionEditor.tsx` | ❌ | n/a | `block.title` JSON |
| `gallery` | inline in `EditableProfileView.tsx:217-306` | `editors/GalleryEditor.tsx` (no dialog wiring at `BlockEditorDialog.tsx:156-157`) | ✅ | n/a | none |
| `bio` | inline in `EditableProfileView.tsx:201-215` | `editors/BioEditor.tsx` | ✅ | n/a | none |
| `product_catalog` | ❌ none | ❌ none | — | — | — (phantom enum) |

---

## E. Proposed Phased Plan

The right sequencing is goal-backward: the **per-card customization story is the largest visible Link.me parity gap** and it's blocked at the schema layer. Lock that down before any visual work, because a beautiful renderer that can't read per-item config is just as broken as today's. Then the panel host (small, mostly already done). Then the visible scroll/marquee/URL-bar micro-behaviors. Feature parity adds (Music Smart Link, Custom Events, animations, video embeds, Pro tiering) sit on top with no shared blockers.

### Phase R0 — Cleanup (~0.5 days)

**Goal:** Remove confirmed-dead code and fix the one confirmed crop bug, so subsequent phases work in a smaller surface.

**Deliverables:**
- Delete `src/components/BlockList.tsx` (171 lines, no consumers)
- Delete `src/components/BlockItem.tsx` (99 lines, only consumed by `BlockList`)
- Delete `src/components/MobileDashboard.tsx` (306 lines, no consumers)
- Delete `src/components/MobileInlineEditor.tsx` (155 lines, no consumers)
- Fix `getCroppedCanvas` clamp at `EditableProfileView.tsx:1004-1007` — slide `srcX/srcY` back inside `nw-fwScaled, nh-fhScaled` instead of truncating `srcW/srcH`
- Verify `src/index.css` has rules for `.lb-velvet`, `.lb-size-big`, `.lb-size-medium`, `.lb-size-small`, `.lb-size-button`, `.lb-span-full`, `.lb-span-half`, `.lb-row`, `.lb-text`, `.lb-thumb`, `.lb-arrow`, `.lb-cover`, `.lb-meta`, `.lb-social`, `.has-media`, `.has-social`, `.no-thumb`. If any are missing, add them based on `design-system/README.md` token vars

**Effort:** 0.5–1 day
**Risk:** Low. Verify-by-grep is exhaustive; deletions are reversible via git.
**Why first:** Smaller surface, fewer red herrings during the bigger phases. The crop bug also gates any photo-cropping confidence.

### Phase R1 — Per-card schema + persistence (~2-3 days)

**Goal:** Make per-item size, background color, and title color survive a save → reload round-trip.

**Deliverables:**
- New migration `supabase/migrations/<ts>_add_block_item_styling.sql` adding to `block_items`:
  - `size text` (nullable, free-text — readers cast to `'big'|'medium'|'small'|'button'`, missing → block-level default)
  - `bg_color text` (nullable hex)
  - `title_color text` (nullable hex)
  - `span text` (nullable, `'full'|'half'`)
  - `style_json jsonb` (catch-all for future per-item config — animations, gradient, link icon override)
- Regenerate `src/integrations/supabase/types.ts`
- Update `LinksEditor.tsx:426-439` `fetchItems` to read `item.size`, `item.bg_color`, `item.title_color`, `item.span` instead of hardcoded defaults
- Update `LinksEditor.tsx:559-589` `handleSave` insert/update to include those fields
- Update `LinksBlock.tsx:43-71` to read `item.size` (with fallback to block-level `style.size`, then `'medium'`) and pass to `LinkButton`. Same for `bg_color`/`title_color` (override via `blockStyle` per-item)
- Wire `span` in render: introduce flex-row pairing — when two adjacent items both have `span='half'`, wrap them in a `<div className="lb-row">` (use the already-existing `LinkRow` at `LinkButton.tsx:89-91`)

**Effort:** 2–3 days
**Risk:** Medium. Migration is additive (nullable cols, no backfill needed), but the read/write flow touches the editor's most-used path. Test thoroughly with existing user data.
**Why second:** Unblocks every later visual parity claim. Without this, Link.me-style "this link is big and red, that one is small and grey" stays impossible.

### Phase R2 — Slide-out panel host for existing blocks (~1.5-2 days)

**Goal:** Tapping a block in the live preview opens the right-side slide-out panel, not the dialog overlay. Single host for both new + existing block flows.

**Deliverables:**
- Lift the panel chrome from `ProfileDashboard.tsx:309-388` into a reusable `BlockEditorPanel` component, OR teach `ProfileDashboard` to accept an "edit existing" entry point that skips the section-list view and jumps straight to the editor
- Replace `Editor.tsx:439-445` `<BlockEditorContent>` with whatever the unified panel is
- Add `panelMode` to the 4 remaining editors:
  - `editors/ContentSectionEditor.tsx`
  - `editors/FeaturedMediaEditor.tsx`
  - `editors/SocialIconRowEditor.tsx`
  - `editors/HeroCardEditor.tsx`
- Wire `gallery` into `BlockEditorDialog`-equivalent so it has an "edit from existing block" flow (currently nulls at `:156-157`)
- Delete `BlockEditorContent.tsx` (the Phase 1 shim) once it has no consumers
- Fix the double-header issue in `LinksEditor`'s `LinkDetailPanel` when in `panelMode` (sync the outer panel header with the inner detail-view title)

**Effort:** 1.5–2 days
**Risk:** Low. The panel host already exists and works; the main risk is regressing the existing "add new block" flow during the refactor. Add a quick smoke-test pass.
**Why third:** Editor UX is a top user-visible difference from Link.me. Done after R1 because R1's persistence work is what actually makes the editor's controls do something.

### Phase R3 — Scroll micro-behaviors (~2-3 days)

**Goal:** Match the three Link.me scroll patterns — color-matched scroll header, auto-scrolling overflow social row, URL-bar collapse.

**Deliverables:**
- Color-matched scroll header:
  - Add scroll listener in `EditableProfileView` (or `PublicProfile`) that toggles a fixed top bar when `window.scrollY > heroHeight - 56`
  - Bar bg = `theme.background.solid_color` (or `theme_json.background.solid_color`)
  - Bar shows display_name + handle (small) + share button
  - Animate via `framer-motion` opacity (`mode-fade` or `slide-up-fade` keyframes already in `tailwind.config.ts:87-104`)
- Auto-scrolling social row:
  - In `SocialLinksBlock` (and/or `SocialIconRowBlock`), measure container width vs total icon width via `ResizeObserver`
  - When icons overflow, switch from `flex flex-wrap` to a single-row track that translates X via `requestAnimationFrame` at ~30px/sec, looping (duplicate the icon list in DOM)
  - Pause on hover/touch
- URL-bar collapse:
  - Add `<meta name="theme-color" content="#0e0c09">` to `index.html` (per-page color via `useEffect` setting it to `theme.background.solid_color` when profile loads)
  - Audit any `100vh` and replace with `100dvh` where it's the full-page container (the sticky hero already uses `50dvh` — confirmed at `:1417`)
  - Confirm `apple-mobile-web-app-capable` is or isn't desired (it disables top bar entirely on iOS standalone — probably _not_ what we want here)

**Effort:** 2–3 days
**Risk:** Medium. iOS Safari URL-bar behavior is finicky and can regress on Android Chrome. Test on real devices, not just simulators (memory note: iPhone-real-device discrepancies have bitten this project before).
**Why fourth:** Visible polish. Comes after editor flow is solid because users care more about being able to _build_ their page than about the scroll feel of the live profile. Also unblocks the public-profile "wow" moment for screenshots / marketing.

### Phase R4 — 3-column dashboard (~2-3 days)

**Goal:** Match `design-system/README.md:117`: left = phone-frame preview, center = block list, right = editor panel. Desktop only (`≥1024px`); mobile keeps the current full-screen flow.

**Deliverables:**
- New `src/components/DashboardThreeCol.tsx` (or extend `DashboardLayout`) with 3 panels: phone preview (left, ~390px), block list (center, ~360px), editor panel (right, fluid)
- Promote the phone-frame chrome out of `Editor.tsx:316-411` into the dashboard shell
- Block list panel = the `SortablePreviewCard` list, but as a flat list (smaller cards, no full preview content)
- Editor panel docks on the right and is now the default position for any block edit (replacing the slide-out from R2 on desktop, while keeping slide-out for mobile)
- Reconcile with the slide-out: on desktop, panel is always visible (placeholder when nothing selected); on mobile, panel is the slide-out from R2

**Effort:** 2–3 days
**Risk:** Medium-high. Layout refactors leak into many files. Editor.tsx's mode-tab placement, `DashboardLayout`'s mobile bottom nav, and `ProfileDashboard`'s panel z-index all need to be reconciled. Could be split into desktop-first delivery, then mobile reconciliation.
**Why fifth:** It's a desktop-only nice-to-have. Most users build pages on mobile (creator-first product). The schema and per-card rebuild are higher leverage. Don't sequence it earlier just because it's mentioned in the design doc — it can wait.

### Phase R5 — Feature parity adds (~ongoing, parallelizable after R3)

Each of these is independent. Estimate per-feature; rough costs:

- **Half-width pairing in render** (already covered in R1 deliverables) — verify it works
- **Animations system** (Pro upsell card already in `LinksEditor.tsx:324-343`):
  - Define `style_json.animation: 'pulse'|'shake'|'shimmer'|'wave'|...`
  - CSS keyframes + per-link `style_json.animation` driven className
  - Pro gating UI is already there
  - 2 days
- **Video embeds in blocks** (YouTube poster support already exists in `MediaThumb.tsx:48-58`, just needs proper iframe render and a video-block editor):
  - 2-3 days
- **Music Smart Link** (Spotify/Apple Music multi-platform redirect):
  - New block type `music_smart_link` (enum + migration)
  - Editor accepts a song search; backend resolves to per-platform URLs
  - Renders as a card with platform icons
  - 3-4 days
- **Custom Events** (calendar/RSVP):
  - New block type `event`
  - Editor for date/time/location/RSVP URL
  - Renders with date strip + add-to-calendar links
  - 3-4 days
- **BandsInTown integration** (artist tour dates):
  - 3rd-party API embed; cleanest as a config inside `event` block
  - 2-3 days
- **AI Compliance Scanner** (scans link destinations for adult/gambling/etc.):
  - Edge function calling an AI moderation API
  - Auto-flags `is_adult`
  - 2-3 days
- **Post stats** (per-link click counts shown to creator):
  - Aggregate `events.event_type='outbound_click'` by `metadata_json.item_id`
  - Render badges in `SortablePreviewCard`
  - 1-2 days
- **Pro tier gating**:
  - Stub already in `DashboardLayout.tsx:71-72` (`userPlan: UserPlan = 'Free'` + TODO)
  - Wire to Stripe / similar; gate animations, custom domain, advanced analytics
  - 5+ days (depends on payment infra choices)

These can be picked off in any order based on user demand.

---

## F. Open Questions for Joey

1. **Schema migration timing.** R1 needs a Supabase migration adding nullable cols to `block_items`. Confirm: are you OK running migrations against production via the Supabase dashboard, or do you want a staging run first? (Memory says project ID is `ohmvlypcbrfkuudcuqub`; the MCP shows a different one — flagging this in case it matters for migration tooling.)

2. **Phantom `product_catalog` enum value.** It's in the `block_type` enum (`types.ts:496`) but has no renderer or editor. Was this an aborted feature? Should I plan to remove it from the enum (requires migration) or keep it as a placeholder for future use?

3. **The `lb-*` CSS classes.** `LinkButton.tsx` emits classes like `lb-size-big` and `lb-velvet` but I didn't find their CSS rules. Is there a stylesheet I missed, or are these expected to be defined in a future phase? If the latter, "all 4 sizes work" is more aspirational than I described, and R0 needs to scope that work.

4. **Header-config layering.** `EditableProfileView` reads `headerConfig` keys directly off `theme_json` (e.g., `headerConfig.nameSize`, `headerCardOrder`, `contentStartY`) but these aren't in `ThemeJson`. Should I formalize them in `theme-defaults.ts` as `ThemeJson.headerConfig`, or leave the ad-hoc `theme_json as any` casts? The latter is faster; the former pays dividends when someone touches header rendering in 6 months.

5. **`BlockEditorDialog` gallery null-out.** Line 156-157 returns null for gallery — was this intentional (gallery is edit-inline only)? Or unfinished? R2 plan currently treats it as unfinished and wires gallery into the dialog/panel.

6. **Per-card persistence scope.** R1 currently plans to add `size`, `span`, `bg_color`, `title_color`, `style_json` only to `block_items`. Do you want per-item color override on `product_cards`, `featured_media`, `social_links`, etc., too? Or strictly on `links` for now? My instinct: ship for `links` first (where the editor UI is built), let other block editors adopt the same fields incrementally.

7. **Auto-scrolling marquee scope.** Should the auto-scroll apply to both `social_links` (Instagram/TikTok-style icons in the header) and `social_icon_row` (the in-page block)? They use the same renderer pattern but live in different places. Memory shows them being conceptually distinct.

8. **3-col dashboard priority.** R4 is the 3-column dashboard. Honest take: this is a desktop polish item that mostly affects you when building, not your end users. Are you OK with it sitting at R4 in the sequence, or do you want it pulled forward?

9. **i18n parity for new features.** Existing blocks all wire `tc()` for user content and `t()` for chrome. R5's new block types (Music Smart Link, Custom Events, etc.) — do you want me to add EN/ES translations from day one or leave them English-first and translate later?

10. **Brand drift risk.** `design-system/README.md` says pill is the default button shape in the Link.me aesthetic we're chasing, but the current `DEFAULT_THEME.buttons.shape` in `theme-defaults.ts:108` is `'rounded'`. Should the default switch to `'pill'`, or are we keeping `rounded` because existing users are on it?

---

## G. First Concrete Step

**Add the per-item styling columns to `block_items`** — that one migration unblocks R1 and is the smallest-possible piece of forward motion. If you change your mind about the rest of the plan, additive-nullable columns are zero-cost to leave in place.

Concretely, one new file:

```
supabase/migrations/<timestamp>_add_block_item_styling.sql
```
```sql
ALTER TABLE public.block_items
  ADD COLUMN IF NOT EXISTS size         text,
  ADD COLUMN IF NOT EXISTS span         text,
  ADD COLUMN IF NOT EXISTS bg_color     text,
  ADD COLUMN IF NOT EXISTS title_color  text,
  ADD COLUMN IF NOT EXISTS style_json   jsonb;
```

Followed by `npx supabase gen types typescript ...` to regenerate `src/integrations/supabase/types.ts`. Then a one-commit change to `LinksEditor.tsx`'s `fetchItems` and `handleSave` to read/write the new fields. After that commit, the editor's existing UI starts actually persisting data — and every other phase can build on a real persistence layer instead of a mocked one.

That's the smallest piece of work that turns a Potemkin feature into a real one, with no risk of being thrown out.

---

Audit complete. Plan written to docs/titilinks-rebuild-plan.md.

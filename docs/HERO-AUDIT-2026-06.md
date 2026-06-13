# Hero Photo Pipeline Audit — TL-AUDIT-2 (2026-06-11)

> **Scope:** Read-only inventory and diagnosis of the protected hero/crop/SmoothImage system.
> **Zero source edits were made.** All line numbers verified against `main` @ `2321e15`.

---

## 1. PIPELINE MAP

### 1.1 Entry point A — Onboarding (`StepYourProfile`)

A **completely separate crop implementation** from the editor. Uses `react-easy-crop`, not the in-house crop tool.

| Step | Location | What happens |
|---|---|---|
| File pick | `src/components/onboarding/StepYourProfile.tsx:257-263` (input), `:142-161` (`handleFileChange`) | FileReader → data URL, opens modal `'preview'`, resets `crop={0,0}`, `zoom=1`, `aspectRatio=1` |
| "Use Image" modal | `StepYourProfile.tsx:346-374` | Two buttons: **Crop Image** (→ crop modal) and **Use Original** (→ skip path, see §2) |
| Crop modal | `StepYourProfile.tsx:377-448` | `react-easy-crop` `<Cropper>` (`:422-430`), aspect options Square / Free / 4:3 / 3:2 (`:203-208`), zoom slider 1–3x |
| Apply crop | `StepYourProfile.tsx:181-201` → `getCroppedImage` `:102-140` | Canvas crop, output **capped at 800px** long edge, JPEG q0.8 → `state.avatarFile` |
| Use Original | `StepYourProfile.tsx:163-179` | Raw file; if >1MB it is recompressed to **max 800px** JPEG q0.8 (`compressImage` `:17-52`). **No crop applied.** |
| Upload | `src/pages/OnboardingFlow.tsx:106-115` | `avatars` bucket, `${userId}/${uuid}.${ext}` → `profiles.avatar_url` (`:117-121`) |
| Page creation | `OnboardingFlow.tsx:345` | `pages.insert({ avatar_url: state.avatarPreview ... })` — `avatarPreview` was swapped to the public URL at `:123` |

**The onboarding path never writes `avatar_original_url`** and (via `compressImage`) may permanently destroy the full-resolution original before upload.

### 1.2 Entry point B — Editor Pencil ("edit current photo")

`src/components/EditableProfileView.tsx:1635-1652`:
- `editSource = page.avatar_original_url || heroImage` (`:1640`) — prefers the saved original; falls back to the *already-cropped* hero for legacy photos (re-crop of a crop).
- Sets `photoPreview=editSource`, `photoFile=null`, **`photoOriginalFile=null`** (so re-crops do not re-upload an original — intentional, `:1228-1230` comment), `cropZoom=1`, `cropPosition={0,0}`, `photoStep='choose'`.

### 1.3 Entry point C — Editor Camera ("new photo")

`EditableProfileView.tsx:1653-1659` → hidden input `:2246-2252` → `handlePhotoSelect` `:1068-1084`:
- FileReader → data URL → `photoPreview`; `photoFile` **and** `photoOriginalFile` = the raw file; `photoStep='choose'`; crop state reset (`cropZoom=1`, `cropPosition={0,0}`).
- Also reused for page-2 (recruit) empty-state upload button `:1623-1628`.

### 1.4 The `photoStep` state machine

`EditableProfileView.tsx:935`:
```
'idle' | 'choose' | 'manual' | 'ai' | 'ai-preview' | 'preview'
```

Actual transitions (fullscreen overlay `z-[130]` at `:1766-1779`):

```
idle ──(Pencil/Camera/file pick)──► choose (:1782-1800: only "Crop Image" or Cancel)
choose ──► manual (:1791)
manual ──► getCroppedCanvas + handlePhotoSave  (:2028-2043 "Apply Crop")
manual ──► ai (handleAiCrop :1326 — face detect → square crop → enhance)
ai ──► ai-preview (:1451-1453)  ──Accept──► handlePhotoSave (:1840-1854)
ai-preview ──Back──► manual (:1831-1835)
ai ──(no face)──► manual (:1345-1348)
any ──Cancel──► resetPhoto → idle (:1517-1524)
```

**Dead state:** `'preview'` (`:2050-2084`) is unreachable — no `setPhotoStep('preview')` exists anywhere in `src/`. Its companion state `photoOffset {x:50,y:30}` / `photoScale` (`:938-939`) is only consumed inside this dead block (`:2061-2062`) and is never persisted. Vestigial.

**Key consequence:** in the current editor every save path bakes a crop (manual square or AI square). Onboarding is the only flow that can save an uncropped photo.

### 1.5 The manual crop tool

- Frame: fixed **1:1 square** — `getCropFrameSize` `:1086-1100` (`ratio = 1/1` at `:1095`; the comment on `:1086` still says "3:4" — stale).
- `getCropMinZoom` `:1102-1121` — min zoom so image covers the frame.
- `clampCropPosition` `:1123-1155` — pan clamped so image edges never enter the frame.
- Display: image explicitly positioned with `effectiveZoom = Math.max(cropZoom, getCropMinZoom())` (`:1909`); `onLoad` raises `cropZoom` to min and recenters (`:1921-1927`).
- Zoom slider `:1974-1989`, range `minZoom → max(minZoom*4, 3)`.
- `getCroppedCanvas` `:1157-1204` — maps frame rect back to natural pixels, clamps source rect inside the image, draws at **full natural resolution**, exports JPEG q0.95. ⚠️ Uses **raw `cropZoom`** (`:1171`), not `effectiveZoom` — see §5.

### 1.6 Face detection (AI crop)

- Library: `@vladmandic/face-api` (`:2`), TinyFaceDetector only.
- Model files: `public/models/tiny_face_detector_model.bin` + `-weights_manifest.json` (~190KB), loaded lazily from `/models` (`:1284-1288`).
- `detectFace` `:1281-1324` — draws the photo to a **full-natural-size canvas** (`:1292-1297`), tries input sizes 512/416/320, `scoreThreshold 0.15`.
- `handleAiCrop` `:1326-1462` — square crop sized by face occupancy: face = 50% of crop width (headshot) / 40% (shoulders) / 18% (fullbody) (`:1364`); face top placed at 0.48 / 0.30 / 0.22 of crop height (`:1372`). Clamped to image bounds, exported JPEG q0.92 (comment `:1389`: JPEG chosen to stay under the 6MB function payload limit).

### 1.7 AI enhance branch

- Client: `handleAiCrop` (`:1398-1448`) and `handleAiEnhance` (`:1464-1515`) both invoke the `ai-enhance` edge function with `{base64, mediaType}`; on failure the **crop-only fallback** is previewed with an amber "CROP ONLY — AI FAILED" badge (`:1822-1828`).
- Edge function: `supabase/functions/ai-enhance/index.ts` — Replicate `philz1337x/crystal-upscaler`, `scale_factor: 2` (`:49-65`), `Prefer: wait` + 90s poll loop (`:81-94`), returns a Replicate output URL. Client fetches that URL and converts to a data URL (`:1432-1442`).
- `handleAiEnhance` (upscale/face-restore) is **not currently reachable from any rendered button** in this file's UI (only `handleAiCrop` is wired at `:1996-2016`); it survives as an internal API.

### 1.8 Upload / storage — what persists

`handlePhotoSave` `:1206-1278`:

| Artifact | Condition | Destination |
|---|---|---|
| **Cropped render** (square JPEG) | always | `avatars/${userId}/${uuid}.${ext}` → `pages.avatar_url` (`:1252-1261`) |
| **Original full-size upload** | only if `photoOriginalFile != null` **and** `selectedMode !== 'recruit'` (`:1231`) | `avatars/${userId}/${uuid}-original.${ext}` → `pages.avatar_original_url` (`:1232-1241`, `:1255-1257`) |
| **Page-2 (recruit) render** | `selectedMode === 'recruit'` | `theme_json.avatar_url_page2` (`:1244-1250`); **no original ever stored** |

So an original is retained **only** for new uploads made through the editor Camera on page 1. Pencil re-crops (`photoOriginalFile=null`), recruit-mode uploads, and **all onboarding uploads** do not (and onboarding may have already downscaled to 800px). Old storage objects are never deleted — every save mints a new UUID and orphans the previous files.

Optimistic local state: `localHeroImages` (`:934`, set `:1264`) overrides the DB value until `onRefresh()` (`src/pages/Editor.tsx:152-162` re-fetches the page row specifically to keep `avatar_original_url` in sync).

### 1.9 Render sites

| # | Site | Location | Treatment |
|---|---|---|---|
| 1 | **Hero (editor preview AND public)** | `EditableProfileView.tsx:1606-1614` | Sticky container `height: 50dvh, maxHeight: 500px`, page column `max-w-[640px]` (`:1602`); `<SmoothImage className="object-cover object-top brightness-110">` |
| 2 | Hero source resolution | `:1551-1554` | recruit: `localHeroImages.recruit \|\| theme_json.avatar_url_page2`; shop: `localHeroImages.shop \|\| theme.header?.image_url \|\| page.avatar_url` — **DesignEditor's header image silently outranks the avatar** |
| 3 | Public page | `src/pages/PublicProfile.tsx:277-288` | Delegates entirely to `EditableProfileView` with `editMode={false}` — true parity by construction |
| 4 | Desktop editor blurred backdrop | `src/pages/Editor.tsx:420-433` | `page.avatar_url` as `background-image`, `blur(40px)`, cover/center |
| 5 | OG/Twitter meta image | `PublicProfile.tsx:254-257` | `avatar_url_page2` (recruit) or `page.avatar_url` |
| 6 | Onboarding upload tile | `StepYourProfile.tsx:233-237` | `aspect-[3/4]`, `object-cover` — *different aspect than anything else in the system* |
| 7 | DesignEditor header-image thumbnail | `src/components/editors/DesignEditor.tsx:794-806`, `:941` | `theme.header.image_url` preview |
| 8 | `SmoothImage` itself | `src/components/SmoothImage.tsx:86-103` | **hardcodes `object-cover`** (`:94`); callers can only append classes |

---

## 2. THE SKIP BUG — root cause

**Where skipping is possible:** only onboarding. `StepYourProfile.tsx:365-370` "**Use Original**" → `handleUseOriginal` (`:163-179`).

**What exactly gets stored:**
1. The raw photo, at its native aspect ratio (portrait 3:4, 9:16, landscape — anything), recompressed to **max 800px / JPEG q0.8 if over 1MB** (`compressImage` `:17-52`).
2. Uploaded once to `avatars/` (`OnboardingFlow.tsx:106-115`) and written to `profiles.avatar_url` (`:117-121`) and `pages.avatar_url` (`:345`).
3. **No crop rectangle, no `avatar_original_url`, no aspect metadata.** Nothing records that the user chose "no crop."

**Why the rendered hero shows a zoomed, top-anchored crop the user never chose:**

The hero render site (`EditableProfileView.tsx:1606-1611`) is a fixed-size box — `min(50dvh, 500px)` tall × `min(viewport, 640px)` wide — filled with `object-cover object-top`:

- `object-cover` scales the image until **both** axes are covered; whatever overflows is clipped.
- `object-top` pins the clip window to the top edge.
- Example: a 3:4 portrait "Use Original" photo on a desktop hero box of 640×500 (1.28:1). To cover 640px of width the image renders at 640×853; the box shows the **top 500px — 59% of the photo**, bottom 41% silently amputated. The user approved the full photo; the renderer chose this crop for them.

**Role of `cropZoom`/`cropPosition` defaults in the skip path: none.** They are editor-overlay state only (`:941-942`, reset to `1` / `{0,0}` at `:1079-1080`, `:1644-1645`) and are consumed exclusively by `getCroppedCanvas`/the manual-crop UI. In the skip path `getCroppedCanvas` never runs — **the "crop" the user sees is computed at render time by CSS**, from exactly two hardcoded tokens: `object-cover object-top` (`:1611`) plus the box geometry (`:1606`). That is the entire bug: an uncropped arbitrary-aspect image meeting a fixed-aspect cover box.

**Compounding factor for cropped photos too:** the manual/AI tools always emit a **1:1 square**, but the hero box is almost never 1:1 (see §3), so even a deliberate crop gets a *second*, top-anchored render-time crop on top — the "hero over-zoom" recorded in the paused bug notes. And because onboarding "Use Original" capped the file at 800px, the desktop hero (needs 640px width + 2x for retina) renders it soft as well.

---

## 3. ASPECT MATH

The hero box is **not a fixed aspect ratio** — it's two independent clamps (`EditableProfileView.tsx:1606`, `:1602`):

```
height = min(50dvh, 500px)        width = min(viewportWidth, 640px)
```

| Device | Viewport | Hero box | Aspect (w:h) |
|---|---|---|---|
| iPhone 15 Pro | 393×852 | 393 × 426 | **0.92:1** (slightly portrait) |
| iPhone SE | 375×667 | 375 × 333 | **1.13:1** (landscape) |
| Pixel 8 | 412×915 | 412 × 457 | 0.90:1 |
| iPad portrait | 768×1024 | 640 × 500 | 1.28:1 |
| Desktop | ≥1280×≥1000 | 640 × 500 | **1.28:1** (landscape) |

Plus `dvh` is *dynamic*: on mobile the box height changes as browser chrome collapses/expands during scroll, so the effective crop window breathes vertically on the same device.

The crop tool, meanwhile, produces **1:1** (`:1095`), onboarding offers 1:1 / free / 4:3 / 3:2 (`StepYourProfile.tsx:203-208`), and the onboarding tile previews at **3:4** (`:233`). No stored shape matches any rendered shape.

**Implication for "minimal crop to fit":** there is no single target aspect to crop to. The rendered window ranges roughly **0.90:1 → 1.28:1** (and oscillates with dvh). A minimal-crop calculation therefore must either:
- (a) crop to the *widest* box in the range (1.28:1) and accept slight extra crop on phones, or
- (b) store the original + a vertical focal point and let CSS (`object-position: 50% Y%`) place the window per-device at render time — no baked crop at all, or
- (c) Fit mode: `object-contain` with a filled backdrop (blur/color), which needs **zero** crop for any input.

Option (b)/(c) both require the original to be reliably retained — which today it is not (§4).

**Editor-vs-real caveat:** inside the desktop editor's phone frame, `50dvh` resolves against the **browser viewport**, not the 430×932 frame — the editor preview hero is a different height/aspect than the same page on a real phone.

---

## 4. STATE & DATA SHAPE

### Database (`src/integrations/supabase/types.ts:296-297`)
| Field | Table | Content |
|---|---|---|
| `avatar_url` | `pages` | Public URL of the **rendered crop** (or the raw skip-path photo). The hero's primary source. |
| `avatar_original_url` | `pages` | Public URL of the untouched upload — **populated only by editor page-1 new uploads** (`EditableProfileView.tsx:1231`) |
| `avatar_url` | `profiles` | Onboarding copy (`OnboardingFlow.tsx:117-121`); not used by the hero |
| `theme_json.avatar_url_page2` | `pages` | Page-2 (recruit) hero; **no original counterpart** |
| `theme_json.header.image_url` | `pages` | DesignEditor header image; **outranks `avatar_url`** in hero resolution (`:1554`) |

### Storage conventions (`avatars` bucket)
- Crop: `${userId}/${uuid}.${ext}` (`:1217`)
- Original: `${userId}/${uuid}-original.${ext}` (`:1233`) — pairing is by convention only; **nothing links a crop to its original** except the two DB columns, and old objects are never garbage-collected.

### Is an original untouched upload retained?
**Only sometimes.**
- ✅ Editor Camera, page 1 (shop): yes → `avatar_original_url`.
- ❌ Editor Pencil re-crop: no new original (by design — the existing one is reused).
- ❌ Page 2 / recruit: never.
- ❌ Onboarding (both Crop and Use Original): never — and `compressImage` may have irreversibly downscaled to 800px before upload.
- Legacy rows: `avatar_original_url` is null; Pencil falls back to re-cropping the crop (`:1640`).

**No crop parameters are persisted anywhere** — zoom/position/aspect are baked into pixels at save time and discarded. A future Fit/re-crop feature has nothing to replay.

---

## 5. RISKS & CONSTRAINTS

1. **Protected system** — CLAUDE.md forbids modification of hero/crop/SmoothImage/getCroppedCanvas without an explicit task.
2. **Saved crop can diverge from previewed crop.** `getCroppedCanvas` uses raw `cropZoom` (`:1171`) while the on-screen image uses `Math.max(cropZoom, getCropMinZoom())` (`:1909`). They are synced only by the `onLoad` handler (`:1921-1927`) raising `cropZoom`. Any path where min-zoom changes after load — container resize, device rotation, dvh viewport change while the crop UI is open — recreates the gap, and "Apply Crop" silently saves a wider/offset crop than displayed. Geometry also depends on live `clientWidth/clientHeight` reads at save time (`:1166-1167`).
3. **No EXIF orientation handling anywhere.** The pipeline relies on the browser honoring EXIF in `<img>` decode and `drawImage` (true in current Chrome/Safari/Firefox; historically false in older Safari). A legacy-device upload can save a rotated crop. No `image-orientation` CSS, no exif parsing, no `createImageBitmap` normalization.
4. **iOS memory pressure on large photos.** `detectFace` draws the photo to a canvas at **full natural resolution** (`:1292-1297`) — a 48MP capture (~8064×6048) approaches/exceeds Safari canvas limits on older devices, while the same image simultaneously exists as a base64 data URL (~1.33× bytes), a decoded `<img>`, and later a second full-res crop canvas (`:1197-1202`) plus a q0.95 data URL. Several hundred MB transient footprint is plausible; Safari kills the tab rather than erroring.
5. **6MB edge-function payload ceiling** (noted at `:1389`). A large square crop at JPEG q0.92 can exceed it → enhance fails → amber fallback. `handleAiEnhance` (uncropped source, `:1468-1479`) is even more exposed if ever re-wired to UI.
6. **Enhance flow assumptions:** crystal-upscaler always 2× (`ai-enhance/index.ts:61`) — output is 4× the pixel count, fetched back into memory as a data URL on the client (`:1437-1442`); Replicate output URLs are short-lived, but the file is re-uploaded immediately so that's fine. The function deploys only with `--project-ref ohmvlypcbrfkuudcuqub`.
7. **Hero source precedence trap:** `theme.header?.image_url` outranks `page.avatar_url` (`:1554`). A user with a legacy DesignEditor header image can replace their photo via the crop flow and see no change on page 1.
8. **Editor/public divergence points** (parity is otherwise excellent since both render the same component):
   - `50dvh` inside the desktop DeviceFrame measures the browser, not the frame (§3);
   - editor shows `localHeroImages` optimistically before refresh (`:1264`);
   - the desktop blurred backdrop (`Editor.tsx:424`) always uses `page.avatar_url` even in recruit mode;
   - OG image (`PublicProfile.tsx:255-257`) shows the baked crop — a render-time Fit mode wouldn't apply to link previews.
9. **Dead/vestigial code mines:** `photoStep === 'preview'` block (`:2050-2084`), `photoOffset`/`photoScale` (`:938-939`), `handleAiEnhance` (no UI caller), stale "3:4" comments (`:1086` vs actual 1:1 at `:1095`). Any redesign diff will touch near these; they invite accidental "cleanup" of the protected file.
10. **Two parallel crop systems** (react-easy-crop in onboarding vs in-house in editor) with different output sizes (800px cap vs full-res) and different aspect menus — behavioral drift is structural, not accidental.
11. **Storage growth:** every save orphans the previous crop/original objects; no deletion anywhere.

---

## 6. REDESIGN READINESS — change-points for "live preview + Fill/Fit + optional adjust"

Minimal touch-set, in dependency order (NO code here — map only):

| # | Change-point | Location | Why |
|---|---|---|---|
| 1 | **Persist hero config instead of (only) baking pixels** — e.g. `theme_json.heroConfig { fit: 'fill'\|'fit', posY }` | write: `handlePhotoSave` `EditableProfileView.tsx:1244-1261`; read: hero resolution `:1551-1554` | The single prerequisite for everything else; today no crop intent survives save |
| 2 | **Hero render** — consume fit/position: `object-cover` + `object-position: 50% {posY}%` for Fill, `object-contain` + backdrop for Fit | `EditableProfileView.tsx:1606-1614` (container + `SmoothImage` call, currently hardcoded `object-cover object-top` `:1611`) | This is where the phantom crop happens |
| 3 | **SmoothImage** — `objectFit`/`objectPosition` props (or `style` passthrough); `object-cover` is hardcoded | `src/components/SmoothImage.tsx:94` | Blocks any Fit mode for every consumer |
| 4 | **Crop frame aspect** — align the tool's frame with the rendered window (or make it a prop) | `getCropFrameSize` `EditableProfileView.tsx:1095` (and stale comment `:1086`) | 1:1 tool vs ~0.9–1.28:1 render is the double-crop source |
| 5 | **Always retain the original** — recruit branch and re-crop logic | `handlePhotoSave` `:1228-1242` (condition `:1231`), Pencil source `:1640` | Fit mode / re-crop without quality loss requires it |
| 6 | **Onboarding parity** — stop destroying originals; upload original + set `avatar_original_url` at page creation; ideally reuse the same live hero preview | `StepYourProfile.tsx:163-179` (Use Original), `:17-52` (`compressImage` 800px cap), `OnboardingFlow.tsx:106-115` (upload), `:345` (page insert) | Skip path is the bug's front door |
| 7 | **Live preview** — render the choose/adjust step inside a real hero-aspect viewport (reuse the `:1606` geometry) instead of the 192px square thumb | `EditableProfileView.tsx:1782-1800` ('choose' step) | "What you approve is what renders" |
| 8 | **Save-vs-display zoom unification** — single `effectiveZoom` source | `getCroppedCanvas` `:1171` vs display `:1909` | Must not survive into a redesign |
| 9 | *(Optional cleanup, same task)* delete dead `'preview'` state + `photoOffset`/`photoScale` | `:935`, `:938-939`, `:2050-2084` | Removes the trap for future diffs |
| 10 | **Out of scope but adjacent:** OG image (`PublicProfile.tsx:255-257`) and desktop blur (`Editor.tsx:424`) keep using the baked `avatar_url` — fine, but means a baked render should still be produced even in Fit mode | — | Link previews can't run CSS |

Public render needs **no separate change** — `PublicProfile.tsx:277` already delegates to the same component.

---

## Summary answers

**1. PIPELINE MAP** — Two disjoint crop systems (react-easy-crop in onboarding; in-house 1:1 tool + TinyFaceDetector AI crop + crystal-upscaler enhance in the editor) converge on `avatars/` storage and `pages.avatar_url`, all rendered by one shared component.

**2. THE SKIP BUG** — Onboarding "Use Original" stores an uncropped, ≤800px photo with no metadata; the hero's hardcoded `object-cover object-top` in a `min(50dvh,500px)` box then invents a top-anchored crop at render time.

**3. ASPECT MATH** — The hero is not one aspect: ~0.90:1 (tall phones) to 1.28:1 (desktop), breathing with dvh; the crop tool's 1:1 output matches none of them.

**4. STATE & DATA SHAPE** — Config lives across `pages.avatar_url`, `pages.avatar_original_url`, `theme_json.avatar_url_page2`, and (surprisingly, with top precedence) `theme_json.header.image_url`; no crop parameters are persisted; originals survive only for editor page-1 new uploads.

**5. RISKS & CONSTRAINTS** — Protected file; save/display zoom divergence; no EXIF handling; full-res canvases on iOS; 6MB enhance payload cap; header-image precedence trap; dvh-in-DeviceFrame editor mismatch; dead `'preview'` state.

**6. REDESIGN READINESS** — Ten change-points, anchored at `EditableProfileView.tsx:1606-1614` (render), `:1244-1261` (persist), `SmoothImage.tsx:94` (object-fit), `:1095` (frame aspect), and the onboarding skip path (`StepYourProfile.tsx:163-179`, `OnboardingFlow.tsx:345`).

**(a) Is the original upload preserved?** Only for new uploads via the editor Camera on page 1 (`avatar_original_url`); never for onboarding (which may also downscale to 800px first), re-crops, or page 2.

**(b) What does skip store?** The raw uncropped photo (recompressed to ≤800px JPEG q0.8 if >1MB) in `pages.avatar_url` — no crop rect, no original, no aspect metadata; the visible "crop" is pure render-time CSS (`object-cover object-top`).

**(c) What aspect does the hero render at?** No fixed aspect — `min(50dvh, 500px)` tall × `min(viewport, 640px)` wide, i.e. ~0.90:1 on tall phones up to 1.28:1 on desktop, varying with dynamic viewport height.

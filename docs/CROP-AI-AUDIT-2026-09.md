# TitiLinks — Crop & AI Enhance Audit (2026-09-13)

Scope: the hero-photo crop system (manual + AI crop) and the AI enhancement pipeline, as of `d23cbb6`.
Read: `src/lib/crop.ts`, `src/components/editors/PhotoCropSheet.tsx`, `src/components/EditableProfileView.tsx` (`detectFace`, `handleAiCrop`, `handleAiEnhance`, `handlePhotoSave`, the pencil/choose/manual/ai-preview steps), `src/components/onboarding/StepYourProfile.tsx`, `supabase/functions/ai-enhance/index.ts`, `package.json`, `public/models/`.
Checked against: npm registry, the react-easy-crop and face-api repos, Google's MediaPipe docs, Replicate's API docs and pricing, Supabase Edge Function limits.

## Bottom line

The architecture is sound and the model choice is right. Four things are worth fixing, in this order:

| # | Finding | Impact | Size |
|---|---------|--------|------|
| 1 | **AI enhance sends the full-resolution crop and asks for 2×.** Replicate bills crystal-upscaler by *output* megapixels. A 3000 px crop → 6000 px output = 36 MP = **$0.80/run**; bounded to 1024 px in → 2048 px out = **$0.05/run**. Same visible result on a phone. | Cost (up to 16×), speed, payload (Replicate recommends data-URI inputs under 1 MB; we allow 10 MB) | S — edge fn + one client line |
| 2 | **AI output is uploaded as-is** — a full-res PNG, unbounded, named `.jpg`. Bypasses the one-output-path rule (CROP.2a) that every other crop goes through. | Storage bloat, wrong extension, inconsistent hero size | S — client only |
| 3 | **Hero display copy is capped at 800 px** (`crop.ts`), and **onboarding downscales the source to 800 px *before* cropping**, so an onboarding hero can land at ~400–500 px. A phone renders the hero at full width × 50 vh; on a 3× screen that's ~1290 px wide. 800 px is soft; 450 px is visibly blurry. | Visual quality — the first thing every visitor sees | S/M — two constants + one reorder |
| 4 | **`@vladmandic/face-api` is archived** (Feb 2025, last code release 2022) and bundles TensorFlow.js — a 1.3 MB lazy chunk + 190 KB model — to draw one bounding box. Google's MediaPipe Face Detector does the same job maintained, ~1/4 the size, and returns eye/nose/mouth keypoints we could frame on. | Maintenance risk, bundle size, framing accuracy | M — one function (`detectFace`) has the only call site |

Nothing here is broken today. #1 is the one that costs money every time a Pro user presses the button.

---

## Part A — Crop system

### A.1 What's there
- **Library:** `react-easy-crop ^5.5.7`. Current is **6.2.3**. The only breaking change in 6.0 is build/test tooling (#647); no API changes noted. Low-risk bump, gate on specs 09/13/41/44. Fold into TL.DEP.2 rather than a brick of its own.
- **Engine:** `getCroppedImage()` in `crop.ts` is the single output path (onboarding + editor). It sets `crossOrigin` *before* `src` (FIX.MEDIA.1), awaits `decode()` with an `onload` fallback (CROP.3a), draws with the natural/display scale factors, and emits JPEG 0.8 capped at 800 px.
- **Framing:** canonical device aspect (`canonicalHeroAspect` / `canonicalFullBleedAspect`), proven by spec 13 against the live modal.
- **Source for re-crop:** `avatar_original_url` when present, else the cropped hero (legacy). Correct — and a pencil re-crop reuses the original rather than re-uploading it.
- **EXIF orientation:** not handled explicitly, and doesn't need to be. Every current browser applies `image-orientation: from-image` to `<img>` and honours it in `drawImage` (Chrome 81+, Safari 13.1+, Firefox 77+). No `exif-js` needed. ✅
- **HEIC:** the file inputs accept `image/jpeg,image/png,image/gif,image/webp`. iOS converts HEIC → JPEG on pick when HEIC isn't in the accept list, so this is the right list. ✅

### A.2 Findings
**A.2.1 Output resolution is too low for the surface (finding #3).**
`crop.ts :50` `maxSize = 800`. The hero is the largest image on the page — full viewport width, 50 vh, `object-fit: cover` — so on a 390 × 844 @3× phone the painted box is ~1170 × 1266 px. An 800 px crop is scaled up ~1.5× on screen. Onboarding is worse: `StepYourProfile :38-46` downscales the *source* to 800 px before the crop, so the crop of a typical framing (say 55 % of the frame) lands at ~440 px and is then upscaled ~2.7×. `HERO-AUDIT-2026-06 :94` already flagged "onboarding may have already downscaled to 800px".

Recommendation (TL.CROP.QUAL.1):
- `maxSize` 800 → **1440** (covers 3× phones with headroom; a 1440 px WebP at 0.85 is ~150–250 KB, comparable to today's 800 px JPEG 0.8).
- Encode **WebP 0.85** with JPEG fallback (`canvas.toBlob('image/webp')` is supported in Chrome, Safari 16+, Firefox; check `blob.type` and fall back). File named by actual type.
- Onboarding: crop from the full-size original, downscale *after* (same cap). The 800 px pre-downscale was a payload optimisation for the old Continue-click upload; since PERF.1 moved the upload off the click, the cost is hidden anyway. Keep the original upload as is.
- `handlePhotoSave` "Save (no crop)" path uploads the raw picked file uncapped — route it through the same cap so one save can't upload a 12 MB photo as the display copy.

**A.2.2 Face detection library is end-of-life (finding #4).**
`@vladmandic/face-api ^1.7.15`: repo archived 2025-02-05, last code release 1.7.1 (2022-07), bundles TFJS 4.16; the author points to his `Human` library. It still works and TL.BUNDLE.1 already made it lazy, so this is maintenance risk, not a bug. But it's 1.3 MB of TensorFlow to get one rectangle.

Options:
| | Size (browser) | Maintained | Keypoints | Notes |
|---|---|---|---|---|
| face-api TinyFaceDetector (today) | ~1.3 MB JS + 190 KB model | ❌ archived | none | works; threshold set to 0.15 (very permissive) |
| **MediaPipe Face Detector** (`@mediapipe/tasks-vision`, BlazeFace short-range) | 11.76 MB WASM raw (measured; ~3.4 MB gzip) + 230 KB model | ✅ Google | 6 (eyes, nose, mouth, tragions) | sync `detect(img)`; self-host WASM + model under `/public/models` (no CDN — CSP) |
| `@vladmandic/human` | ~2–3 MB | ✅ | many | heavier than needed |
| Browser `FaceDetector` (Shape Detection API) | 0 | Chrome-only, flagged | — | not shippable |

**Ruling 2026-09-24 (TL.FACE.MP.1, retired).** Built and measured, then reverted. `@mediapipe/tasks-vision` 1.0.1 ships one shared vision runtime: `vision_wasm_internal.wasm` is 11,756,954 B raw (~3.4 MB gzip, ~2.4 MB brotli), and no face-only runtime exists. The model (`blaze_face_short_range.tflite`) is 229,746 B. The first AI crop would download ~12.4 MB raw against ~1.5 MB today, and self-hosting the simd + nosimd runtimes puts 23 MB of binaries in git. Ruled out on size. face-api stays: archived but working, lazy, and public pages are unaffected. Revisit only if a face-only WASM build appears. The recommendation below is superseded.

Recommendation (TL.FACE.MP.1): swap the *inside* of `detectFace()` for MediaPipe, keep its `{x,y,w,h}` contract, keep every line of the framing math. Use `minDetectionConfidence` 0.5 (the 0.15 threshold today is why a busy background can "find a face"). Optionally centre headshots on the eye midpoint rather than the box centre — a real framing improvement for tilted heads. Delete `public/models/tiny_face_detector*` and the dependency after. Gate on a spec that runs detection on a fixture with a known face position (none exists today — spec 13 stops before detection).

**A.2.3 Small things (bundle into whichever brick touches the file first).**
- `handleAiCrop :2296-2303` loads its image with `onload` only, not `decode()` — inconsistent with `crop.ts`; harmless because `detectFace` re-draws to a canvas first, but the AI path can't distinguish a decode failure from a load failure in its cause hint.
- `detectFace` retries three input sizes (512/416/320) sequentially — with MediaPipe this becomes one call.

---

## Part B — AI enhancement

### B.1 What's there
- **Model:** `philz1337x/crystal-upscaler` on Replicate, called via the modern `models/{owner}/{name}/predictions` endpoint with `Prefer: wait` and a 90 s poll fallback. Portrait-optimised, no "plastic skin", 1.2 M+ runs, last model update Nov 2025, supports tiling to 10 K. **Still the right model** — Clarity (same author) is a creative upscaler that hallucinates detail; GFPGAN/CodeFormer are the plastic-face generation; Real-ESRGAN isn't face-aware. fal.ai hosts the same model at $0.016/MP, marginally cheaper at our sizes but a second vendor and second secret; not worth it.
- **Gates:** JWT (HYG.3), Pro plan (`plan_allows('aiTools')`, fails closed), 10 MB input cap, 20/day quota (count failure is non-blocking by design), usage recorded on success only. ✅
- **Client:** two entry points — `handleAiCrop` (face-crop → enhance → preview → accept) and `handleAiEnhance` (enhance current/cropped image). Free tier skips the network call entirely. The enhanced image is fetched from `replicate.delivery` (CORS works, URLs are short-lived, fetched immediately). ✅

### B.2 Findings
**B.2.1 Input size drives cost 16× (finding #1).**
`handleAiCrop :2347-2356`: the crop canvas is `cropSize` square at *native* resolution — for a 12 MP phone photo that's routinely 2500–3000 px — encoded JPEG 0.92 and sent as base64. The function asks for `scale_factor: 2`. Replicate prices crystal-upscaler by **output** megapixels:

| Output | Price/run |
|---|---|
| ≤ 4.4 MP (≈ 2100²) | $0.05 |
| 4.4–8.8 MP | $0.10 |
| 8.8–17.6 MP | $0.20 |
| 17.6–27.5 MP | $0.40 |
| 27.5–55 MP (a 3000² crop × 2 = 36 MP lands here) | $0.80 |

Nothing above ~1500 px is visible on the hero. Replicate also recommends data-URI inputs stay under 1 MB; ours can be up to 10 MB, and a 36 MP PNG comes back at 50–100 MB into the browser's memory.

Recommendation (TL.AI.COST.1):
- Client: downscale the crop canvas to **max 1024 px** before encoding (JPEG 0.9 ≈ 150–300 KB base64). 2× → 2048 px = 4.2 MP = the $0.05 tier, and more pixels than the display copy will keep.
- Function: enforce the same on the server side — reject or downscale inputs whose decoded dimensions exceed 1600 px (the function can't decode images cheaply in Deno without a lib; simpler: lower `MAX_IMAGE_BYTES` to 2 MB, which the 1024 px client cap satisfies with room, and document why). Keep `scale_factor: 2`.
- Same bound in `handleAiEnhance` (it sends whatever data URL it has).
- Expected effect: ~$0.05/run instead of $0.20–0.80, ~1–3 s round trip instead of 10–30 s, and the daily cap of 20 becomes a $1/day ceiling per user instead of $16.

**B.2.2 Output bypasses the one output path (finding #2).**
`:3320-3328` on Accept: `fetch(aiPreviewData)` → `new File([blob], 'ai-enhanced.jpg', { type: 'image/jpeg' })` → `handlePhotoSave(file)`. The blob is the model's **PNG** at full output resolution; the file gets a `.jpg` extension and `image/jpeg` type it doesn't have, and is uploaded uncapped as the display copy. Browsers sniff the bytes so it renders, but the bucket now holds a multi-MB PNG-in-.jpg where every other hero is a bounded JPEG. Route the accepted result through `getCroppedImage()` (full-frame crop = identity) so it gets the same cap, encoding and name as every other hero. That also makes #1 and #3 consistent: 1024 in → 2048 out → 1440 stored.

**B.2.3 Timeout budget equals the gateway's.**
`Prefer: wait` holds up to 60 s, then the poll loop runs up to 90 s → 150 s worst case. Supabase's request idle timeout is 150 s (free) — the gateway would 504 the client while the function is still polling and would then record a usage event for a result nobody received. Set the poll budget to ~75 s (total < 140 s). With the 1024 px input this path is rarely reached, but the budget should be correct.

**B.2.4 Minor.**
- `EnhanceRequest.mode/scale` are accepted-and-ignored legacy fields — fine, documented in code.
- `getCroppedCanvas()` (used by `handleAiEnhance(fromCrop)`) is in the protected hero system; any change there is a printed-diff brick.
- The edge function logs payload size and media type but not the user id — add `user.id` to the two error logs so a Replicate failure can be tied to an account when Joey reads logs.

---

## Proposed bricks (in order)

1. **TL.AI.COST.1** — bound AI input to 1024 px (both entry points), lower server `MAX_IMAGE_BYTES` to 2 MB with a comment on the pricing tiers, poll budget 75 s, `user.id` in error logs. Edge redeploy is Joey's hands. Spec: assert the request body sent to `ai-enhance` is < 500 KB for a 3000 px fixture (route-intercept, no live call). *Saves money from the first run.*
2. **TL.CROP.QUAL.1** — `maxSize` 800 → 1440, WebP 0.85 with JPEG fallback, onboarding crops from the full original (downscale after), AI accept and "Save (no crop)" go through `getCroppedImage`. Touches `crop.ts`, `StepYourProfile.tsx`, and two sites in the protected file (printed diff). Spec: crop a 3000 px fixture → stored width 1440; onboarding fixture → ≥ 1000 px. Visual gate: before/after hero screenshots at 3× DPR.
3. **TL.FACE.MP.1** — MediaPipe Face Detector replaces face-api inside `detectFace()`; self-hosted WASM + model; threshold 0.5; eye-midpoint centring for headshots; remove the old dep and model files. Spec: detection on a fixture with a known face box (±10 %). Bundle check: the lazy chunk shrinks from ~1.3 MB to ~0.3 MB.
4. **react-easy-crop 6.x** — fold into TL.DEP.2.

## Sources
- react-easy-crop: [npm latest 6.2.3](https://registry.npmjs.org/react-easy-crop/latest), [releases](https://github.com/ValentinH/react-easy-crop/releases)
- face-api: [npm 1.7.15](https://registry.npmjs.org/@vladmandic/face-api/latest), [repo (archived 2025-02-05)](https://github.com/vladmandic/face-api)
- MediaPipe Face Detector for web: [Google developers guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js), [npm @mediapipe/tasks-vision](https://registry.npmjs.org/@mediapipe/tasks-vision/latest)
- crystal-upscaler: [Replicate model page](https://replicate.com/philz1337x/crystal-upscaler), [per-provider pricing incl. Replicate's output-MP tiers](https://lumenfall.ai/models/clarity-ai/crystal-upscaler/providers)
- Replicate API: [Prefer: wait semantics](https://replicate.com/docs/topics/predictions/create-a-prediction), [input files — data URIs under 1 MB](https://replicate.com/docs/topics/predictions/input-files)
- Supabase Edge Functions: [limits — 150 s idle timeout, 256 MB, 2 s CPU](https://supabase.com/docs/guides/functions/limits)

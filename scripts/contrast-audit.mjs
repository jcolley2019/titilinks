// WCAG contrast audit for TitiLinks themes.
//
// TL.TPL.CONTRAST.1 — runs in `npm run guard`; a new template that fails
// contrast fails the guard.
//
// Imports the REAL source-of-truth presets/templates (via tsx, which resolves
// the .ts files) so the audit can never drift from what ships. Checks, per
// theme:
//   (a) page text vs EVERY background / gradient stop          — min 4.5
//   (b) button label vs its surface                            — min 4.5
//        (the fill ALPHA-COMPOSITED over each page stop — see surfaceAlpha;
//         'fade' composites at alpha/2, the gradient's midpoint where the
//         centred label actually sits — LinkButton :221)
//   (c) button distinguishability vs the background            — min 3.0
//        (skipped for variant 'fade', which is edgeless by design)
//
// Prints one table row per preset/template with ✓/✗ and the worst ratio in
// each category, then the specific failing ratios. Exits 1 if anything fails
// so it can gate CI.

import { TEMPLATES } from '../src/lib/template-gallery';
import { THEME_PRESETS, DEFAULT_BLOCK_STYLE } from '../src/lib/theme-defaults';

const TEXT_BG_MIN = 4.5;
const LABEL_MIN = 4.5;
const BUTTON_MIN = 3.0;

// --- color parsing (hex 3/6/8, rgb/rgba) ----------------------------------
function parseColor(c) {
  if (!c || typeof c !== 'string') return null;
  const s = c.trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (h.length === 8) h = h.slice(0, 6); // drop alpha — measure the solid hue
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    if (p.length >= 3 && p.every((v) => !Number.isNaN(v))) {
      return { r: p[0], g: p[1], b: p[2] };
    }
  }
  return null;
}

function relativeLuminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Returns the WCAG contrast ratio, or null if either color can't be parsed.
function contrast(a, b) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Every color a visitor's text/button actually sits on for this background.
function bgStops(bg) {
  if (bg.type === 'gradient' && bg.gradient_css) {
    const hexes = bg.gradient_css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    const rgbas = bg.gradient_css.match(/rgba?\([^)]+\)/gi) || [];
    const all = [...hexes, ...rgbas];
    if (all.length) return all;
  }
  return [bg.solid_color];
}

// min ratio across a set of surfaces; null surfaces count as a hard fail (0).
function worst(color, surfaces) {
  let min = Infinity;
  for (const s of surfaces) {
    const r = contrast(color, s);
    min = Math.min(min, r === null ? 0 : r);
  }
  return min === Infinity ? 0 : min;
}

// min ratio across [a, b] pairs — used where each painted surface must be
// compared against the SAME stop it was composited over (pairing matters once
// the fill is translucent).
function worstPaired(pairs) {
  let min = Infinity;
  for (const [a, b] of pairs) {
    const r = contrast(a, b);
    min = Math.min(min, r === null ? 0 : r);
  }
  return min === Infinity ? 0 : min;
}

// --- alpha compositing -----------------------------------------------------
// LinkButton never paints a translucent button as its raw fill: it paints an
// rgba() fill OVER the page. To measure what a visitor's eye actually lands on,
// composite the same way — per channel, blend = fill*alpha + stop*(1−alpha).
// Returns null when either color is unparseable, so worst() fails it loudly
// rather than silently measuring the wrong surface.
function blend(fill, stop, alpha) {
  // At alpha 0 the fill is never painted, so it is irrelevant — and may not even
  // be a color ('Outline Only' stores fill_color 'transparent'). Short-circuit
  // before parsing it, or an unpainted fill would hard-fail a passing theme.
  if (alpha <= 0) return stop;
  if (alpha >= 1) return fill;
  const f = parseColor(fill);
  const s = parseColor(stop);
  if (!f || !s) return null;
  const mix = (a, b) => Math.round(a * alpha + b * (1 - alpha));
  return (
    '#' +
    [mix(f.r, s.r), mix(f.g, s.g), mix(f.b, s.b)]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
  );
}

// The alpha each variant actually paints its fill at — one code path for all
// five, mirroring LinkButton exactly:
//   glass  LinkButton :196  rgbaStr(fill, Math.max(0.03, opacity * 0.05))
//   filled LinkButton :202  rgbaStr(fill, opacity)
//   fade   LinkButton :220  rgbaStr(fill, Math.max(0.25, opacity * 0.8)) → transparent
//          (label measured at alpha/2 — see audit(), rule b)
//   outline/minimal        background 'transparent' — the page shows through
// At alpha 1 blend() returns the fill itself, and at alpha 0 it returns the
// stop itself, so this single formula reproduces every case.
function surfaceAlpha(variant, opacity) {
  if (variant === 'glass') return Math.max(0.03, opacity * 0.05);
  if (variant === 'fade') return Math.max(0.25, opacity * 0.8);
  if (variant === 'filled') return opacity;
  return 0;
}

function audit(theme, blockStyles) {
  const stops = bgStops(theme.background);
  const btn = theme.buttons;
  // Mirror LinkButton's real resolution: theme.buttons.variant wins, then the
  // template's blockStyles.variant, then DEFAULT_BLOCK_STYLE.variant ('filled').
  // (Defaulting to 'glass' here was wrong — it checked dark labels against the
  // dark page bg for filled buttons and false-failed almost everything.)
  const variant = btn.variant ?? blockStyles?.variant ?? DEFAULT_BLOCK_STYLE.variant;
  // LinkButton :155 — theme.buttons wins, then the block style, then the default.
  const opacity =
    btn.background_opacity ??
    blockStyles?.background_opacity ??
    DEFAULT_BLOCK_STYLE.background_opacity ??
    1;
  const alpha = surfaceAlpha(variant, opacity);

  // (a) page text vs every background stop
  const aMin = worst(theme.typography.text_color, stops);

  // (b) button label vs the surface it REALLY sits on: the fill composited over
  // each page stop at that variant's alpha. A near-transparent glass/outline
  // fill resolves back to the stops; an opaque filled one back to the fill.
  // 'fade' is a vertical gradient (LinkButton :221) from `alpha` at one edge
  // to 0 at the other; the label is vertically centred, so the tint under the
  // text is alpha/2. Every other variant is uniform, so its label alpha IS alpha.
  const labelAlpha = variant === 'fade' ? alpha / 2 : alpha;
  const labelSurfaces = stops.map((s) => blend(btn.fill_color, s, labelAlpha));
  const bMin = worst(btn.text_color, labelSurfaces);

  // (c) button shape distinguishable from the background.
  // LinkButton :231-233 — the unified outline pass draws a SOLID border
  // whenever resolveButtonSurface reports outlineWidth > 0 (an explicit
  // outline_width, or legacy variant 'outline'). That opaque frame — not the
  // translucent fill behind it — is what separates the button from the page,
  // so it is what the edge test must measure. Mirrors src/lib/surface.ts :180-186.
  const explicitOutline = btn.outline_width;
  const outlineWidth =
    explicitOutline !== undefined && explicitOutline > 0
      ? explicitOutline
      : variant === 'outline'
        ? Math.max(blockStyles?.border_width ?? 1, 1)
        : 0;
  const solidEdge =
    outlineWidth > 0
      ? blockStyles?.border_color || btn.border_color || btn.fill_color
      : btn.border_enabled
        ? btn.border_color
        : null;

  // LinkButton :214-224 — 'fade' is a tint dissolving to transparent with no
  // border BY DESIGN. There is no edge to measure, so the test is skipped
  // rather than scored as a failure.
  let cMin = null;
  if (variant !== 'fade') {
    cMin = solidEdge
      ? worst(solidEdge, stops)
      : variant === 'filled'
        // A filled button IS its fill, so once that fill turns translucent the
        // edge is the composited result, measured against the very stop it was
        // composited over.
        ? worstPaired(stops.map((s) => [blend(btn.fill_color, s, alpha), s]))
        // glass/minimal paint no solid edge — LinkButton :197-199 gives glass a
        // 0.12-0.35 hairline that no ratio models honestly. Unchanged from the
        // pre-TL.TPL.CONTRAST.1 behaviour: measure the raw fill against the page.
        : worst(btn.fill_color, stops);
  }

  return {
    aMin, aPass: aMin >= TEXT_BG_MIN,
    bMin, bPass: bMin >= LABEL_MIN,
    cMin, cPass: cMin === null ? true : cMin >= BUTTON_MIN,
    cSkipped: cMin === null,
  };
}

// --- report ----------------------------------------------------------------
const rows = [
  ...THEME_PRESETS.map((p) => ({ group: 'preset', name: p.name, theme: p.theme, blockStyles: undefined })),
  ...TEMPLATES.map((t) => ({ group: 'template', name: t.name, theme: t.theme, blockStyles: t.blockStyles })),
];

const pad = (s, n) => String(s).padEnd(n);
const cell = (pass, min) => `${pass ? '✓' : '✗'} ${min.toFixed(2)}`;
// Wide enough to hold the fade note in the column itself.
const BTN_COL = 26;
const RULE = 22 + 12 + 14 + BTN_COL + 6;

console.log('\nWCAG Contrast Audit — TitiLinks themes');
console.log(`Thresholds: text↔bg ≥${TEXT_BG_MIN} · label↔surface ≥${LABEL_MIN} · button↔bg ≥${BUTTON_MIN}\n`);
console.log(pad('Theme', 22) + pad('Text↔BG', 12) + pad('Label↔Surf', 14) + pad('Btn↔BG', BTN_COL) + 'Result');
console.log('─'.repeat(RULE));

let failures = 0;
let lastGroup = '';
for (const row of rows) {
  if (row.group !== lastGroup) {
    console.log(`  ${row.group === 'preset' ? 'PRESETS' : 'TEMPLATES'}`);
    lastGroup = row.group;
  }
  const r = audit(row.theme, row.blockStyles);
  const ok = r.aPass && r.bPass && r.cPass;
  if (!ok) failures++;
  console.log(
    pad(row.name, 22) +
    pad(cell(r.aPass, r.aMin), 12) +
    pad(cell(r.bPass, r.bMin), 14) +
    pad(r.cSkipped ? 'fade — no edge by design' : cell(r.cPass, r.cMin), BTN_COL) +
    (ok ? '✓ PASS' : '✗ FAIL')
  );
  if (!ok) {
    const probs = [];
    if (!r.aPass) probs.push(`text↔bg ${r.aMin.toFixed(2)} (need ${TEXT_BG_MIN})`);
    if (!r.bPass) probs.push(`label↔surface ${r.bMin.toFixed(2)} (need ${LABEL_MIN})`);
    if (!r.cPass) probs.push(`button↔bg ${r.cMin.toFixed(2)} (need ${BUTTON_MIN})`);
    console.log('    └─ ' + probs.join(' · '));
  }
}

console.log('─'.repeat(RULE));
if (failures > 0) {
  console.log(`\n✗ ${failures} theme(s) fail WCAG contrast.\n`);
  process.exit(1);
} else {
  console.log(`\n✓ All ${rows.length} themes pass.\n`);
  process.exit(0);
}

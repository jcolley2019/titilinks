// WCAG contrast audit for TitiLinks themes.
//
// Imports the REAL source-of-truth presets/templates (via tsx, which resolves
// the .ts files) so the audit can never drift from what ships. Checks, per
// theme:
//   (a) page text vs EVERY background / gradient stop          — min 4.5
//   (b) button label vs its surface                            — min 4.5
//        (filled => the fill color; outline/glass/minimal => the page bg)
//   (c) button distinguishability vs the background            — min 3.0
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

function audit(theme, blockStyles) {
  const stops = bgStops(theme.background);
  const btn = theme.buttons;
  // Mirror LinkButton's real resolution: theme.buttons.variant wins, then the
  // template's blockStyles.variant, then DEFAULT_BLOCK_STYLE.variant ('filled').
  // (Defaulting to 'glass' here was wrong — it checked dark labels against the
  // dark page bg for filled buttons and false-failed almost everything.)
  const variant = btn.variant ?? blockStyles?.variant ?? DEFAULT_BLOCK_STYLE.variant;

  // (a) page text vs every background stop
  const aMin = worst(theme.typography.text_color, stops);

  // (b) button label vs its surface
  const labelSurfaces = variant === 'filled' ? [btn.fill_color] : stops;
  const bMin = worst(btn.text_color, labelSurfaces);

  // (c) button shape distinguishable from the background
  const edge = variant === 'filled'
    ? btn.fill_color
    : (btn.border_enabled ? btn.border_color : btn.fill_color);
  const cMin = worst(edge, stops);

  return {
    aMin, aPass: aMin >= TEXT_BG_MIN,
    bMin, bPass: bMin >= LABEL_MIN,
    cMin, cPass: cMin >= BUTTON_MIN,
  };
}

// --- report ----------------------------------------------------------------
const rows = [
  ...THEME_PRESETS.map((p) => ({ group: 'preset', name: p.name, theme: p.theme, blockStyles: undefined })),
  ...TEMPLATES.map((t) => ({ group: 'template', name: t.name, theme: t.theme, blockStyles: t.blockStyles })),
];

const pad = (s, n) => String(s).padEnd(n);
const cell = (pass, min) => `${pass ? '✓' : '✗'} ${min.toFixed(2)}`;

console.log('\nWCAG Contrast Audit — TitiLinks themes');
console.log(`Thresholds: text↔bg ≥${TEXT_BG_MIN} · label↔surface ≥${LABEL_MIN} · button↔bg ≥${BUTTON_MIN}\n`);
console.log(pad('Theme', 22) + pad('Text↔BG', 12) + pad('Label↔Surf', 14) + pad('Btn↔BG', 10) + 'Result');
console.log('─'.repeat(72));

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
    pad(cell(r.cPass, r.cMin), 10) +
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

console.log('─'.repeat(72));
if (failures > 0) {
  console.log(`\n✗ ${failures} theme(s) fail WCAG contrast.\n`);
  process.exit(1);
} else {
  console.log(`\n✓ All ${rows.length} themes pass.\n`);
  process.exit(0);
}

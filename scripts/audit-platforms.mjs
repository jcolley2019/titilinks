// audit-platforms.mjs — TEST.1a catalog coverage audit (read-only).
// Cross-references the platform catalog against URL builders, the
// PlatformIcon map, and platform-from-url detection. Run:
//   node scripts/audit-platforms.mjs
import { readFileSync } from 'fs';

const editor = readFileSync('src/components/editors/SocialLinksEditor.tsx', 'utf8');
const icons = readFileSync('src/components/PlatformIcon.tsx', 'utf8');
const fromUrl = readFileSync('src/lib/platform-from-url.ts', 'utf8');

// --- catalog: categories + platforms + placeholders ---
const catBlock = editor.slice(editor.indexOf('const PLATFORM_CATEGORIES'), editor.indexOf('const SOCIAL_URL_BUILDERS'));
const platforms = [];
let currentCat = null;
for (const line of catBlock.split('\n')) {
  const cat = line.match(/label:\s*'([^']+)',\s*$/);
  if (cat) { currentCat = cat[1]; continue; }
  const p = line.match(/\{\s*label:\s*'([^']+)',\s*icon:\s*'[^']*',\s*placeholder:\s*'([^']+)'/);
  if (p) platforms.push({ label: p[1], cat: currentCat, placeholder: p[2] });
}

// --- builders ---
const bBlock = editor.slice(editor.indexOf('const SOCIAL_URL_BUILDERS'), editor.indexOf('const buildSocialUrl'));
const builders = new Set([...bBlock.matchAll(/'([^']+)':\s*\(h\)/g)].map(m => m[1]));

// --- icon map (mimic PlatformIcon normalize: lowercase, strip parenthetical) ---
const norm = (s) => s.toLowerCase().replace(/\s*\(.*\)\s*/g, '').trim();
const iconKeys = new Set([...icons.matchAll(/^\s*'([^']+)':\s*\{\s*Icon:/gm)].map(m => norm(m[1])));

// --- URL detection labels (source order preserved — HOST_MAP is first-match-wins) ---
const detectOrder = [...fromUrl.matchAll(/,\s*'([^']+)'\]/g)].map(m => m[1]);
const detect = new Set(detectOrder);

// --- report ---
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('PLATFORM', 16) + pad('CATEGORY', 16) + pad('BUILDER', 9) + pad('ICON', 6) + pad('DETECT', 8) + 'INPUT TYPE');
console.log('-'.repeat(75));
const issues = [];
for (const p of platforms) {
  const hasB = builders.has(p.label);
  const hasI = iconKeys.has(norm(p.label));
  const hasD = detect.has(p.label);
  const ph = p.placeholder.toLowerCase();
  const isHandle = /username|handle|\$cashtag|number|email or phone/.test(ph);
  const type = /email or phone/.test(ph) ? 'EMAIL/PHONE' : isHandle ? 'handle' : 'URL';
  console.log(pad(p.label, 16) + pad(p.cat, 16) + pad(hasB ? 'yes' : '—', 9) + pad(hasI ? 'yes' : 'FALL', 6) + pad(hasD ? 'yes' : '—', 8) + type);
  if (type === 'EMAIL/PHONE') issues.push(`${p.label}: placeholder asks for email/phone — no URL scheme exists; raw value becomes a broken href.`);
  else if (isHandle && !hasB) issues.push(`${p.label}: handle-type placeholder but NO builder — bare handles fall through as raw text (broken href).`);
  if (!hasI) issues.push(`${p.label}: no PlatformIcon entry — renders the neutral fallback glyph.`);
}
console.log('');
if (issues.length) {
  console.log('ISSUES (' + issues.length + '):');
  for (const i of issues) console.log('  • ' + i);
} else {
  console.log('ISSUES: none');
}

// --- HOST_MAP rule-order assertions ---
// HOST_MAP is first-match-wins, so a broad rule sitting ahead of a narrow one
// silently makes the narrow one unreachable. The coverage table cannot see this
// (both labels have *a* rule) — these assertions can. Add constraints as data.
const ORDER_RULES = [
  {
    name: 'music.youtube.com precedes youtube.com',
    before: 'YouTube Music',
    after: 'YouTube',
    why: 'music.youtube.com also matches the general .youtube.com rule',
  },
];

console.log('\nRULE ORDER:');
let orderFailed = false;
for (const r of ORDER_RULES) {
  const i = detectOrder.indexOf(r.before);
  const j = detectOrder.indexOf(r.after);
  if (i === -1 || j === -1) {
    orderFailed = true;
    console.log(`  FAIL ${r.name} — no HOST_MAP rule for '${i === -1 ? r.before : r.after}'; cannot check.`);
  } else if (i < j) {
    console.log(`  ok   ${r.name}  ('${r.before}' #${i} < '${r.after}' #${j})`);
  } else {
    orderFailed = true;
    console.log(`  FAIL ${r.name} — '${r.before}' (#${i}) is shadowed by '${r.after}' (#${j}): ${r.why}. Detection for '${r.before}' is unreachable.`);
  }
}

if (orderFailed) {
  console.log('\nRule-order assertion violated — exit 1.');
  process.exit(1);
}
console.log('\nCoverage table and issues are advisory; rule order is a gate. Exit 0.');

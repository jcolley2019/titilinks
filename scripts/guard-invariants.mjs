import { readFileSync } from 'node:fs';
const F = (p) => `src/${p}`;
const checks = [
  { name:'STICKY-HERO', file:'components/EditableProfileView.tsx',
    // DP.2 re-lock: the 50dvh read now resolves through --pv-vh (container-truthful
    // preview) with a 1dvh fallback that keeps the public geometry byte-identical.
    // The 50% factor, HERO_EXTRA=60, and the sticky/top pins are unchanged.
    needs:[/position:\s*'sticky'/, /top:\s*stickyTop/, /height:\s*'calc\(var\(--pv-vh, 1dvh\) \* 50 \+ '\s*\+\s*HERO_EXTRA\s*\+\s*'px\)'/, /const HERO_EXTRA\s*=\s*60\b/] },
  { name:'STICKY-PROP', file:'components/EditableProfileView.tsx',
    needs:[/stickyTop\?\s*:\s*number\s*\|\s*string/, /stickyTop\s*=\s*0\b/] },
  { name:'FADE-SEAM', file:'components/EditableProfileView.tsx',
    needs:[/height:\s*'64px'/, /transparent 0%[^)]*80%\)/] },
  { name:'OVERLAY-CENTER', file:'components/EditableProfileView.tsx',
    needs:[/items-center\s+justify-center\s+flex-1\s+p-6\s+gap-4\s+overflow-y-auto/] },
  { name:'HERO-MT6', file:'pages/Editor.tsx',
    needs:[/lg:hidden -mx-4 -mt-6 min-h-screen bg-\[#0e0c09\]/] },
  { name:'STICKY-EDITOR-TOP', file:'pages/Editor.tsx',
    needs:[/stickyTop="4rem"/] },
  { name:'MAIN-SCROLL', file:'components/DashboardLayout.tsx',
    needs:[/isEditorPage\s*\?\s*'overflow-x-clip'\s*:\s*'overflow-x-hidden'/] },
  { name:'PUBLICPROFILE-WRAP', file:'pages/PublicProfile.tsx',
    needs:[/min-h-screen bg-\[#0e0c09\]/] },
  // ES-SWEEP.1 Task 3: en/es dictionary parity — the 9th invariant. A Spanish
  // session must never fall back to a raw key, so the two maps must hold the
  // identical key set. Fails loudly, naming the offending keys.
  { name:'I18N-PARITY', parity:true },
];
let failed = 0;
for (const c of checks) {
  if (c.parity) {
    const dict = readFileSync(F('hooks/useLanguage.tsx'), 'utf8');
    const enStart = dict.indexOf('  en: {');
    const esStart = dict.indexOf('  es: {');
    const keysOf = (s) => [...s.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]);
    const en = new Set(keysOf(dict.slice(enStart, esStart)));
    const es = new Set(keysOf(dict.slice(esStart)));
    const onlyEn = [...en].filter((k) => !es.has(k));
    const onlyEs = [...es].filter((k) => !en.has(k));
    if (onlyEn.length || onlyEs.length) {
      failed++;
      console.error(`x ${c.name} - en/es dictionaries diverge`);
      if (onlyEn.length) console.error(`      missing in ES: ${onlyEn.join(', ')}`);
      if (onlyEs.length) console.error(`      missing in EN: ${onlyEs.join(', ')}`);
    } else {
      console.log(`ok ${c.name} (${en.size} keys, en/es identical)`);
    }
    continue;
  }
  let src;
  try { src = readFileSync(F(c.file), 'utf8'); }
  catch { console.error(`x ${c.name}: cannot read ${F(c.file)}`); failed++; continue; }
  const missing = c.needs.filter(re => !re.test(src));
  if (missing.length) {
    failed++;
    console.error(`x ${c.name} (${c.file})`);
    missing.forEach(re => console.error(`      missing: ${re}`));
  } else {
    console.log(`ok ${c.name}`);
  }
}
if (failed) { console.error(`\nGUARD FAILED - ${failed} invariant(s) broken.`); process.exit(1); }
console.log('\nAll invariants intact.');

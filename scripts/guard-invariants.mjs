import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  // FIX.MEDIA.1: the crop engine must request its source with CORS. Editing an
  // EXISTING photo feeds getCroppedImage a remote Supabase URL, and without this
  // the canvas is tainted and every re-crop dies on "image is cross-origin
  // protected". It must also be set BEFORE .src, or the browser ignores it.
  { name:'CROP-CORS', file:'lib/crop.ts',
    needs:[/image\.crossOrigin\s*=\s*'anonymous';\s*\n\s*image\.src\s*=\s*imageSrc;/] },
  // FIX.MEDIA.1: hero media geometry has exactly ONE definition. If a surface
  // hardcodes object-fit again, three previews drift back into three shapes.
  { name:'HERO-ONE-RESOLVER', file:'components/EditableProfileView.tsx',
    needs:[/resolveHeroMediaStyle\(/, /data-hero-framing=/],
    absent:[/objectFit:\s*'cover'/] },
  // TL.BLOCK.1: the default-block seed has exactly ONE home. It lived inline in
  // Editor.tsx as a read-then-blind-INSERT called from fetchBlocks, and two
  // overlapping fetches minted duplicate blocks (32 on one live page), which
  // then wedged every panel shut. The engine in lib/default-blocks.ts is
  // serialized per mode and refuses to seed off an empty read; an inline
  // `blocks` INSERT reappearing here is that whole defect growing back.
  { name:'BLOCK-SEED-ONE-HOME', file:'pages/Editor.tsx',
    needs:[/ensureDefaultBlocks\(mode\.id\)/, /from '@\/lib\/default-blocks'/],
    absent:[/from\('blocks'\)\s*\n?\s*\.insert/] },
  // TL.EVNT.SGL: the events block is a per-PAGE singleton shared by both page
  // styles, with no DB floor of its own — the contract holds only because both
  // composition-replace paths PRESERVE page-singleton blocks (a page reset must
  // not destroy cross-style event data) and resolveBlockId resolves them
  // page-wide, creating only on the page1 mode. A refactor that rewrites either
  // removable filter without consulting PAGE_SINGLETON_TYPES silently makes a
  // Layout apply delete both styles' events; this catches that regrowth. The
  // set's contents ({events}) are pinned by default-blocks.test.mjs.
  { name:'EVNT-PAGE-SINGLETON-RESET', file:'components/ProfileDashboard.tsx',
    needs:[/&&\s*!PAGE_SINGLETON_TYPES\.has\(b\.type\)/, /PAGE_SINGLETON_TYPES\.has\(blockType\)/] },
  { name:'EVNT-PAGE-SINGLETON-TPL', file:'lib/tpl-apply.ts',
    needs:[/!HEADER_TYPES\.has\(b\.type\)\s*&&\s*!PAGE_SINGLETON_TYPES\.has\(b\.type\)/] },
  // ES-SWEEP.1 Task 3: en/es dictionary parity — the 9th invariant. A Spanish
  // session must never fall back to a raw key, so the two maps must hold the
  // identical key set. Fails loudly, naming the offending keys.
  { name:'I18N-PARITY', parity:true },
  // TL.ISO.2: every spec runs behind the default-deny write fixture. The ONLY
  // door to @playwright/test is tests/fixtures.ts (which builds the guarded
  // test) and tests/auth.setup.ts (the one real login, minted before any spec
  // context exists). A spec reaching the raw runner — even for a type — skips
  // the deny layer entirely; that is the Aug 18-19 incident class growing back.
  { name:'PW-ONE-DOOR', pwOneDoor:true },
  // TL.ISO.2: route.continue()/route.fetch() skip every remaining handler and
  // go straight to the network. Behind a non-GET gate that is a spec
  // hand-carrying a WRITE around the deny layer. Grep-level by design — the
  // TL.ISO.0 recon ruled this bypass not fully closable in-process; this
  // catches the same-line idiom (both orderings). route.fallback() is the
  // correct verb: it lets the fixture rule on the request.
  { name:'PW-WRITE-BYPASS', pwWriteBypass:true },
  // TL.ISO.5: the TL.ISO.4b lesson, promoted to an invariant now that it is a
  // proven hazard class rather than one spec's bad day. `blocks` and
  // `block_items` both carry `FOR SELECT USING (true)` — public pages have to
  // render for anonymous visitors — so a spec-side `.select()` with NO filter
  // returns every public page's rows IN THE WHOLE DATABASE, not the battery
  // account's. It stays invisible until the numbers move: TL.ISO.1 gave the
  // battery its own account and specs 41/44 started counting a stranger's
  // photos (13 rows against a 5-photo gallery), and spec 45's sweep was
  // issuing writes at every account's blocks trusting RLS to refuse them
  // quietly. A read of those two tables must carry an `.eq(` scope in the same
  // chain. Nothing is file-exempt — a shared helper is the worst place for an
  // unscoped read, not the safest — so the escape hatch is per-read and has to
  // be written down, on the read's own line or the one directly above it:
  //     // PW-SCOPED-READS ok: <why this unscoped read is safe>
  // The discovery reads in specs 41-45 carry one: they self-correct off a DOM
  // discriminator (the block whose first photo is actually on screen), which
  // is a real answer to the hazard rather than a silencer.
  { name:'PW-SCOPED-READS', pwScopedReads:true },
];

// Every .ts under tests/ (specs, helpers, fixtures) — output dirs skipped.
const walkTests = (dir = 'tests') => {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'results' || name === 'screenshots' || name === '.auth') continue;
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) out.push(...walkTests(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
};
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
  if (c.pwOneDoor) {
    const DOORS = new Set(['tests/fixtures.ts', 'tests/auth.setup.ts']);
    const bad = [];
    for (const f of walkTests()) {
      if (DOORS.has(f)) continue;
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (line.includes('@playwright/test')) bad.push(`${f}:${i + 1}  ${line.trim()}`);
      });
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - direct '@playwright/test' import outside the fixture door`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      specs must import { test, expect } (and types) from tests/fixtures.ts -`);
      console.error(`      the TL.ISO.2 default-deny write guard only exists behind that door.`);
    } else {
      console.log(`ok ${c.name} (${walkTests().length} files, one door)`);
    }
    continue;
  }
  if (c.pwWriteBypass) {
    const idiom = /(!==\s*['"]GET['"].*route\.(continue|fetch)\()|(route\.(continue|fetch)\(.*!==\s*['"]GET['"])/;
    const bad = [];
    for (const f of walkTests()) {
      if (f === 'tests/fixtures.ts') continue;
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (idiom.test(line)) bad.push(`${f}:${i + 1}  ${line.trim()}`);
      });
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - a non-GET gate hands writes to route.continue()/route.fetch()`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      continue()/fetch() bypass the TL.ISO.2 deny layer straight to the network -`);
      console.error(`      use route.fallback() so the fixture rules on the mutation instead.`);
    } else {
      console.log(`ok ${c.name}`);
    }
    continue;
  }
  if (c.pwScopedReads) {
    const TABLE = /\.from\(\s*['"](blocks|block_items)['"]\s*\)/g;
    // A mutation is the write guard's business, not this one's.
    const WRITE = /\.(insert|update|upsert|delete)\(/;
    const WAIVER = /PW-SCOPED-READS ok/;
    const bad = [];
    let reads = 0;
    for (const f of walkTests()) {
      const src = readFileSync(f, 'utf8');
      const lines = src.split(/\r?\n/);
      for (const m of src.matchAll(TABLE)) {
        // The statement this read belongs to: from `.from(` to the `;` that
        // ends the chain, capped so an unterminated one cannot swallow the
        // file. Multi-line chains are the common shape, hence not line-wise.
        const semi = src.indexOf(';', m.index);
        const stop = semi === -1 ? m.index + 600 : Math.min(semi, m.index + 600);
        const stmt = src.slice(m.index, stop);
        if (WRITE.test(stmt) || !/\.select\(/.test(stmt)) continue;
        reads++;
        if (/\.eq\(/.test(stmt)) continue;
        const n = src.slice(0, m.index).split('\n').length;   // 1-indexed
        if (WAIVER.test(lines[n - 1]) || (n > 1 && WAIVER.test(lines[n - 2]))) continue;
        bad.push(`${f}:${n}  ${lines[n - 1].trim()}`);
      }
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - unscoped read of blocks/block_items in the battery`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      both tables are world-readable (FOR SELECT USING (true)), so a select`);
      console.error(`      with no filter returns EVERY public page's rows, not this account's -`);
      console.error(`      the TL.ISO.4b defect. Add an .eq( scope to the chain, or, if the read`);
      console.error(`      genuinely cannot be scoped, waive it in writing on that line or the`);
      console.error(`      one above: // PW-SCOPED-READS ok: <why this is safe>`);
    } else {
      console.log(`ok ${c.name} (${reads} reads of blocks/block_items)`);
    }
    continue;
  }
  let src;
  try { src = readFileSync(F(c.file), 'utf8'); }
  catch { console.error(`x ${c.name}: cannot read ${F(c.file)}`); failed++; continue; }
  const missing = c.needs.filter(re => !re.test(src));
  // `absent` is the mirror of `needs`: a pattern that must NOT reappear.
  const forbidden = (c.absent ?? []).filter(re => re.test(src));
  if (missing.length || forbidden.length) {
    failed++;
    console.error(`x ${c.name} (${c.file})`);
    missing.forEach(re => console.error(`      missing: ${re}`));
    forbidden.forEach(re => console.error(`      must not be present: ${re}`));
  } else {
    console.log(`ok ${c.name}`);
  }
}
if (failed) { console.error(`\nGUARD FAILED - ${failed} invariant(s) broken.`); process.exit(1); }
console.log('\nAll invariants intact.');

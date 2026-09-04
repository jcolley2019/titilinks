import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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
  // TL.PANEL.1a: every editor-panel footer stays pinned to the panel's bottom
  // edge. The FOOTER.1-3 epic (July) put `sticky bottom-0 z-10 mt-auto` on all
  // of them; TL.SOC.1b then dropped the sticky half from SocialLinksEditor on
  // the theory that mt-auto alone suffices once the footer sits outside an
  // inner scroller. It does not, and that is the whole trap this catches: the
  // dashboard wrapper is `min-h-full` — a FLOOR, not a cap — so long content
  // grows the wrapper past the scrollport, the inner scroller never engages,
  // the dashboard's own scroller scrolls instead, and a footer with only
  // mt-auto rides off-screen. Both classes, always, belt AND suspenders.
  { name:'PANEL-FOOTER-PIN', panelFooterPin:true },
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
  // TL.COMP.2: the comp functions (admin_grant_comp / admin_revoke_comp, both
  // SECURITY DEFINER as postgres) are the one door to a free Pro plan, and the
  // door is meant to open from the SQL editor ONLY. Supabase's default
  // privileges hand EXECUTE on every new public function to anon,
  // authenticated and service_role, so the migration that creates them must
  // REVOKE ALL from PUBLIC and from those three roles, and no migration —
  // this one or a later "convenience" one — may GRANT EXECUTE on them back.
  // A grant to `authenticated` would let any JWT comp itself through
  // PostgREST. Comments are stripped before matching, so prose may name the
  // hazard; only live SQL trips it.
  // KNOWN BOUNDARY (accepted at the TL.COMP.1+2 review): a schema-wide
  // `grant execute on all functions in schema public to …` re-opens the door
  // without naming either function and is NOT caught here. The migration's
  // verification SELECT (grants_ok / proacl) is the backstop for that idiom —
  // re-run it after any migration that touches schema-wide privileges.
  { name:'COMP-NO-GRANT', compNoGrant:true },
  // TL.FONT.1 (AUDIT_rev6 #1): the brand fonts (Playfair Display, DM Sans,
  // Bebas Neue, Pacifico) are loaded by <link rel="stylesheet"> tags in
  // index.html, NOT by @import in src/index.css. An @import placed after the
  // @tailwind lines violates the CSS rule that @import precede every other
  // statement, so PostCSS DROPS it at build ("@import must precede all other
  // statements") and production ships with zero brand fonts on every page
  // that does not inject its own <link> at runtime - the marketing site fell
  // back to Georgia/system-ui. A <link> in <head> is immune to that rule and
  // starts the download earlier. Any @import returning to index.css is the
  // defect regrowing, whatever its position.
  { name:'FONTS-IN-HEAD', fontsInHead:true },
  // TL.MIG.1 (AUDIT_rev6 #4): prod is managed by hand in the SQL editor and
  // schema_migrations is empty, so this directory is a RECORD, not a ledger.
  // Nine files would resurrect deliberately dropped objects (short_links, the
  // Canva OAuth tables) or reopen closed write paths (anonymous INSERT into
  // events / page_subscribers) if pasted again, and one more is a pure record
  // of the live profiles UPDATE policy. Each must announce "DO NOT RUN" within
  // its first 10 lines, and supabase/migrations/README.md must list EVERY .sql
  // in the directory so a new file cannot arrive unclassified.
  { name:'MIG-HEADERS', migHeaders:true },
  // TL.HYG.1 (AUDIT_rev6 §4.4): tests/ is typechecked. Nothing else compiles
  // the specs — Playwright's Babel transform strips types without checking
  // them, and tsconfig.app.json includes src/ only — so a wrong-shaped test
  // option is a silent no-op: test.use({ reducedMotion }) sat in three glide
  // specs and never applied (the key belongs under contextOptions) until tsc
  // read it. tests/tsconfig.json extends the app config over tests/**/*.ts;
  // `tsc -p tests/tsconfig.json` must exit 0. Runs last: it is the slow one.
  { name:'TESTS-TYPECHECK', testsTypecheck:true },
  // TL.BUNDLE.1 (AUDIT_rev6 #13): the build is split. ONE 3.4 MB chunk used to
  // serve every route, and @vladmandic/face-api (TensorFlow inside, 1.33 MB
  // pre-minified) rode in it because EditableProfileView imported it
  // statically — so a visitor to /:handle downloaded the editor, the dashboard,
  // onboarding and a face detector to look at a link page. This runs
  // `vite build --manifest` into dist/ and reads the manifest: the static
  // import closure of the entry (what /:handle actually loads) must not carry
  // the face-api chunk or its model strings, assets/ must hold >= 4 JS chunks,
  // and no app chunk may exceed 1.2 MB raw. The face-api chunk is the one
  // named exception to that cap: it is a single pre-minified module that
  // cannot be split further, it is lazy, and it gets its own ceiling. A full
  // build, so it is the slowest invariant — it runs last.
  { name:'BUNDLE-SPLIT', bundleSplit:true },
];

// TL.MIG.1: the files whose re-run would harm prod. Adding a file here means
// its header carries the "DO NOT RUN" line; see README.md for the classes.
const DO_NOT_RUN = [
  '20260111040649_7b135b54-cfb3-49ff-bd02-a80e016b80f7.sql', // schema init: events INSERT + profiles UPDATE stanzas
  '20260111060233_9da7a4a9-6332-427e-a5ba-46d37a758149.sql', // short_links (dropped, TL.RETIRE.L.1)
  '20260111060716_c36f7fc9-bad1-44bf-b135-d01bd08684a3.sql', // resolve_short_link v2 (dropped)
  '20260111224757_2710e13d-7969-48c7-9901-5f5d22c00f9d.sql', // canva_connections (dropped, TL.CANVA.RM.1)
  '20260111225219_25f5d823-1e2d-4ae7-aa92-457655b15aa1.sql', // canva_connections tightening
  '20260111230038_d0cd2999-d909-441b-9dd3-c12cbe7578f8.sql', // pending_canva_auth
  '20260111233755_0c50de22-15b5-4c3a-a12b-e4e04126f403.sql', // pending_canva_auth.redirect_origin
  '20260328233337_8781412c-19ee-45d8-ae3a-2ce2625c842b.sql', // pending_canva_auth SELECT policy
  '20260328233922_d99ccf5f-b378-44be-99fa-29bf5f0e5056.sql', // page_subscribers public INSERT (dropped)
  '20260901120000_profiles_update_policy_mirror.sql',       // record of the live profiles UPDATE policy
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
  if (c.panelFooterPin) {
    // A footer strip is identified by the two classes every one of them carries
    // on the same element: mt-auto (the anchor) and border-t (the separator).
    // Panels that are footer-LESS by design contribute no strips and so pass
    // trivially — the TL.PANEL.1-RECON ruling names four, and they stay named
    // here so a future reader doesn't "fix" them: TemplateGallery (apply is a
    // per-preset hover-reveal, the TPL.3d ruling) and TextBlocksPanel (a list
    // that routes into TextBlockEditor, which owns the footer) are skipped by
    // name; Pages and Video Profile live inside ProfileDashboard.tsx, which is
    // scanned for the Name & Handle hub's own strip — both write on change and
    // have no Save gesture, so neither contributes a match.
    const FOOTERLESS = new Set(['TemplateGallery.tsx', 'TextBlocksPanel.tsx']);
    const files = readdirSync('src/components/editors')
      .filter((n) => n.endsWith('.tsx') && !FOOTERLESS.has(n))
      .map((n) => `src/components/editors/${n}`)
      .concat('src/components/ProfileDashboard.tsx');
    const bad = [];
    let strips = 0;
    for (const f of files) {
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (!/\bmt-auto\b/.test(line) || !/\bborder-t\b/.test(line)) return;
        strips++;
        if (/\bsticky bottom-0\b/.test(line) && /\bz-10\b/.test(line)) return;
        bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 110)}`);
      });
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - an editor footer lost its pin`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      a panel footer needs 'sticky bottom-0 z-10 mt-auto', not mt-auto alone:`);
      console.error(`      the dashboard wrapper is min-h-full (a floor), so long content grows it`);
      console.error(`      past the scrollport and an unstuck strip scrolls off the bottom edge -`);
      console.error(`      the TL.SOC.1b defect. Copy the strip from any compliant editor.`);
    } else {
      console.log(`ok ${c.name} (${strips} footer strips pinned)`);
    }
    continue;
  }
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
  if (c.fontsInHead) {
    const html = readFileSync('index.html', 'utf8');
    const css = readFileSync(F('index.css'), 'utf8');
    const bad = [];
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
    const fontLinks = links.filter((t) => /rel=["']stylesheet["']/.test(t) && /href=["']https:\/\/fonts\.googleapis\.com\//.test(t));
    if (!fontLinks.length) bad.push('index.html has no <link rel="stylesheet" href="https://fonts.googleapis.com/..."> in <head>');
    css.split(/\r?\n/).forEach((line, i) => {
      if (/^\s*@import\b/.test(line)) bad.push(`src/index.css:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - brand fonts must load from index.html, never via @import`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      an @import after the @tailwind lines is dropped by PostCSS at build time`);
      console.error(`      ("@import must precede all other statements"), so production ships with`);
      console.error(`      no Playfair/DM Sans/Bebas/Pacifico. Put the URL in a <link> in index.html.`);
    } else {
      console.log(`ok ${c.name} (${fontLinks.length} font stylesheet link(s) in <head>, zero @import in index.css)`);
    }
    continue;
  }
  if (c.migHeaders) {
    const DIR = 'supabase/migrations';
    const bad = [];
    const sqlFiles = readdirSync(DIR).filter((n) => n.endsWith('.sql')).sort();
    for (const name of DO_NOT_RUN) {
      let src;
      try { src = readFileSync(`${DIR}/${name}`, 'utf8'); }
      catch { bad.push(`${DIR}/${name}  is in DO_NOT_RUN but does not exist`); continue; }
      const head = src.split(/\r?\n/).slice(0, 10).join('\n');
      if (!head.includes('DO NOT RUN')) bad.push(`${DIR}/${name}  has no "DO NOT RUN" line in its first 10 lines`);
    }
    let readme = '';
    try { readme = readFileSync(`${DIR}/README.md`, 'utf8'); }
    catch { bad.push(`${DIR}/README.md is missing`); }
    for (const name of sqlFiles) {
      if (!readme.includes(name)) bad.push(`${DIR}/README.md  does not list ${name}`);
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - landmine migrations must be labelled and every file classified`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      prod is pasted by hand and schema_migrations is empty, so this directory is a`);
      console.error(`      record, not a ledger. A file in DO_NOT_RUN reopens a closed write path or`);
      console.error(`      resurrects a dropped table if pasted again; it must say "DO NOT RUN" up top.`);
      console.error(`      Every .sql must appear in README.md's table with a class label.`);
    } else {
      console.log(`ok ${c.name} (${DO_NOT_RUN.length} DO-NOT-RUN headers, ${sqlFiles.length} files listed in README)`);
    }
    continue;
  }
  if (c.compNoGrant) {
    const FNS = ['admin_grant_comp', 'admin_revoke_comp'];
    const DIR = 'supabase/migrations';
    // Comments and string literals (COMMENT ON … IS '…', RAISE messages) are
    // prose; only live SQL is matched. '' inside a literal is an escaped quote.
    const stripComments = (sql) => sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");
    const bad = [];
    let creators = 0;
    for (const name of readdirSync(DIR).filter((n) => n.endsWith('.sql')).sort()) {
      const f = `${DIR}/${name}`;
      const sql = stripComments(readFileSync(f, 'utf8'));
      for (const fn of FNS) {
        if (!sql.includes(fn)) continue;
        // Any GRANT that names the function, in any migration, ever.
        const g = sql.match(new RegExp(`\\bgrant\\s+(all|execute)\\b[^;]*\\bon\\s+(function|routine|procedure)\\s+(public\\.)?${fn}\\b`, 'i'));
        if (g) bad.push(`${f}  GRANT on ${fn}:  ${g[0].replace(/\s+/g, ' ').trim()}`);
        // The migration that (re)defines the function must lock it.
        if (!new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\b`, 'i').test(sql)) continue;
        creators++;
        const revokeFrom = (who) =>
          new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)\\s+from\\s+[^;]*\\b${who}\\b[^;]*;`, 'i');
        for (const who of ['public', 'anon', 'authenticated', 'service_role']) {
          if (!revokeFrom(who).test(sql)) bad.push(`${f}  ${fn} is created here but never REVOKE ALL … FROM ${who}`);
        }
      }
    }
    if (creators === 0) bad.push(`no migration under ${DIR} creates ${FNS.join(' / ')}`);
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - the comp functions must stay SQL-editor-only`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      admin_grant_comp / admin_revoke_comp are SECURITY DEFINER as postgres and`);
      console.error(`      flip profiles.plan. Supabase grants EXECUTE on new public functions to`);
      console.error(`      anon/authenticated/service_role by default, so the creating migration must`);
      console.error(`      REVOKE ALL from public AND those three roles, and nothing may GRANT it back.`);
    } else {
      console.log(`ok ${c.name} (${creators} function definition(s) locked, zero grants)`);
    }
    continue;
  }
  if (c.testsTypecheck) {
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    const r = spawnSync(process.execPath, [tsc, '-p', 'tests/tsconfig.json', '--pretty', 'false'], { encoding: 'utf8' });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.split(/\r?\n/).filter(Boolean);
    if (r.error || r.status !== 0) {
      failed++;
      console.error(`x ${c.name} - tests/ does not typecheck (tsc -p tests/tsconfig.json: ${r.error ? r.error.message : `exit ${r.status}`})`);
      out.slice(0, 40).forEach((l) => console.error(`      ${l}`));
      if (out.length > 40) console.error(`      … ${out.length - 40} more line(s)`);
      console.error(`      nothing else compiles the specs (Playwright strips types, tsconfig.app.json`);
      console.error(`      is src/ only), so a wrong-shaped test option is a silent no-op until tsc`);
      console.error(`      reads it - the TL.HYG.1 reducedMotion defect. Fix the errors; never widen`);
      console.error(`      tests/tsconfig.json to hide them.`);
    } else {
      console.log(`ok ${c.name} (tsc -p tests/tsconfig.json exit 0, ${walkTests().length} files)`);
    }
    continue;
  }
  if (c.bundleSplit) {
    const OUT = 'dist';
    const CAP = 1_200_000;           // bytes raw, every app chunk
    const FACE_CAP = 1400000;       // bytes raw, the lazy face-api chunk (one pre-minified module)
    const FACE_KEY = '@vladmandic/face-api';
    const MODEL_MARK = /tiny_face_detector_model|ssd_mobilenetv1_model|face_landmark_68_model/;
    const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');
    const bad = [];
    let summary = '';
    const r = spawnSync(process.execPath, [vite, 'build', '--manifest', '--outDir', OUT, '--logLevel', 'error'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      bad.push(`vite build failed (${r.error ? r.error.message : `exit ${r.status}`})`);
      `${r.stdout ?? ''}${r.stderr ?? ''}`.split(/\r?\n/).filter(Boolean).slice(-20).forEach((l) => bad.push(l));
    } else {
      let manifest = null;
      try { manifest = JSON.parse(readFileSync(`${OUT}/.vite/manifest.json`, 'utf8')); }
      catch (e) { bad.push(`${OUT}/.vite/manifest.json unreadable: ${e.message}`); }
      if (manifest) {
        const js = readdirSync(`${OUT}/assets`).filter((n) => n.endsWith('.js'));
        const size = (n) => statSync(`${OUT}/assets/${n}`).size;
        // The eager closure: every chunk an entry pulls in through STATIC
        // imports before first paint. Dynamic imports — the lazy routes and
        // face-api — are exactly what must stay out of it.
        const eager = new Set();
        const walk = (key) => {
          const m = manifest[key];
          if (!m || eager.has(m.file)) return;
          eager.add(m.file);
          (m.imports ?? []).forEach(walk);
        };
        Object.entries(manifest).filter(([, m]) => m.isEntry).forEach(([k]) => walk(k));
        const entry = Object.values(manifest).find((m) => m.isEntry && m.file.endsWith('.js'));
        const faceFiles = new Set(Object.keys(manifest).filter((k) => k.includes(FACE_KEY)).map((k) => manifest[k].file));
        if (js.length < 4) bad.push(`assets/ holds ${js.length} JS chunk(s); route-level splitting should produce at least 4`);
        if (!faceFiles.size) bad.push(`no chunk for ${FACE_KEY} in the manifest - the library is no longer a separate lazy chunk`);
        for (const f of faceFiles) if (eager.has(f)) bad.push(`${f} (face-api) is in the entry's static import closure - /:handle would download it`);
        for (const f of eager) {
          if (f.endsWith('.js') && MODEL_MARK.test(readFileSync(`${OUT}/${f}`, 'utf8'))) bad.push(`${f} is eager and carries face-api model strings`);
        }
        for (const n of js) {
          const isFace = faceFiles.has(`assets/${n}`);
          const cap = isFace ? FACE_CAP : CAP;
          const b = size(n);
          if (b > cap) bad.push(`assets/${n} is ${b.toLocaleString('en-US')} B raw, over the ${cap.toLocaleString('en-US')} B ${isFace ? 'face-api' : 'chunk'} cap`);
        }
        const entryBytes = entry ? statSync(`${OUT}/${entry.file}`).size : 0;
        summary = `${js.length} JS chunks, entry ${entry ? entry.file.replace('assets/', '') : '?'} ${entryBytes.toLocaleString('en-US')} B raw, ${eager.size} eager, face-api lazy`;
      }
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - the build must stay route-split with face-api out of the entry`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      one chunk serving every route is the AUDIT_rev6 #13 defect: /:handle visitors`);
      console.error(`      download the editor, the dashboard and a face detector. Keep the routes in`);
      console.error(`      App.tsx lazy and face-api behind loadFaceApi(); never re-add a static import.`);
    } else {
      console.log(`ok ${c.name} (${summary})`);
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

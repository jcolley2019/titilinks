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
  // TP.F2a (audit S1/S5): the fade strip and the content panel under the hero
  // photo paint from ONE value, heroBgValue, so the join cannot mismatch. The
  // old rule (FADE-SEAM) pinned the literals of a strip painted in a colour
  // worked out apart from the panel's — the two could not match on a
  // 135-degree gradient, and "fixing" the pair was done four times.
  //   · solid page: the panel paints heroBgValue and the strip ramps from
  //     `transparent` to that same variable.
  //   · gradient page: panel and strip both paint heroBgValue as their image
  //     (two slices of one gradient) and the ramp is a mask on the strip ONLY.
  // The panel always keeps an opaque background of its own: a mask under page
  // text costs desktop its subpixel antialiasing (TP.F2). This rule fails if a
  // separately computed fade colour comes back, if a ramp runs between
  // `transparent` and anything but heroBgValue, or if the mask is used a second
  // time or on the panel. It pins no colour, height or ramp length —
  // tests/97-seam-pixels.spec.ts reads the pixels.
  { name:'JOIN-ONE-SURFACE', file:'components/EditableProfileView.tsx',
    needs:[/:\s*\{\s*background:\s*heroBgValue\s*\}/,
      /gradient\([^)\n]*\btransparent\b[^,)\n]*,\s*\$\{heroBgValue\}[^,)\n]*,\s*\$\{heroBgValue\}[^,)\n]*\)/,
      /backgroundImage:\s*heroBgValue\b[\s\S]*backgroundImage:\s*heroBgValue\b/,
      /maskImage:\s*heroFadeMask\b/, /WebkitMaskImage:\s*heroFadeMask\b/,
      /heroPanelPaint\),\s*\n\s*minHeight:\s*'60vh'/, /:\s*heroStripPaint\)/],
    absent:[/heroFadeColor/,
      /gradient\([^)\n]*\btransparent\b[^,)\n]*,\s*\$\{(?!heroBgValue\})/, /gradient\([^)\n]*\$\{(?!heroBgValue\})[^}\n]*\}[^,)\n]*,\s*transparent\b/,
      /\bmaskImage:[\s\S]*\bmaskImage:/, /const heroPanelPaint[^;]*[mM]askImage/] },
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
  // FRAGILE.COLOR.1 (audit N2): every literal key handed to t() must exist in
  // the dictionary. A missing key renders as the raw key string on screen —
  // d120cce shipped `editor.saveFailed` that way. Literal = single quotes,
  // double quotes, or a backtick string with no `${}`; keys built at run time
  // (`blocks.${type}.title`) are out of scope. Parity (above) covers es, so
  // the en map is the dictionary checked here.
  { name:'I18N-USED-KEYS', usedKeys:true },
  // TL.ISO.2: every spec runs behind the default-deny write fixture. The ONLY
  // door to @playwright/test is tests/fixtures.ts (which builds the guarded
  // test) and tests/auth.setup.ts (the one real login, minted before any spec
  // context exists). A spec reaching the raw runner — even for a type — skips
  // the deny layer entirely; that is the Aug 18-19 incident class growing back.
  // TL.HARNESS.FREE.1 adds the SECOND key to the same door and a second rule
  // under the same name. The battery key (tests/.auth/user.json) is a
  // project-level storageState, so every spec context is built by the runner
  // and carries the fixture's routes. The FREE key is not: a spec has to open
  // it explicitly, and `browser.newContext({ storageState: '…/free.json' })`
  // produces a context with NO write guard on it at all — every mutation would
  // reach the free account's live rows. fixtures.withFreeUser() is the one
  // opener that installs the guard, so naming the free key anywhere outside
  // the two doors fails here. (The battery key is deliberately NOT covered:
  // specs 41-45 hand-roll rescue contexts from it, a hole the TL.ISO.2 header
  // records and review owns. The free account is the one that must never be
  // written to by accident, so its key gets the stricter rule.)
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
  // `block_items` are both readable by the public role — since TL.RLS.BLOCKS.1
  // that is `USING (is_enabled)` on `blocks` and a public SELECT on
  // `block_items` joined to its enabled block, with a separate owner policy
  // carrying the full read — because public pages have to render for
  // anonymous visitors, so a spec-side `.select()` with NO filter
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
  // TL.FONT.1 (AUDIT_rev6 #1) → TL.SEO.FONTS.1: web fonts are SELF-HOSTED.
  // src/lib/fonts.css declares every family with @font-face (woff2 from the
  // Fontsource packages, emitted hashed under /assets/) and is imported by
  // src/main.tsx BEFORE index.css. Three regressions fail this check:
  //  - an @import in src/index.css, whatever its position: after the
  //    @tailwind lines PostCSS DROPS it ("@import must precede all other
  //    statements") and production ships with zero brand fonts — the original
  //    TL.FONT.1 defect, when the marketing site fell back to Georgia/system-ui;
  //  - any fonts.googleapis.com / fonts.gstatic.com reference in index.html or
  //    src/ — a render-blocking cross-origin stylesheet, the thing FONTS.1 removed;
  //  - fonts.css missing, not declaring the brand families, or not imported
  //    ahead of index.css.
  { name:'FONTS-SELF-HOSTED', fontsSelfHosted:true },
  // TL.MIG.1 (AUDIT_rev6 #4): prod is managed by hand in the SQL editor and
  // schema_migrations is empty, so this directory is a RECORD, not a ledger.
  // Nine files would resurrect deliberately dropped objects (short_links, the
  // Canva OAuth tables) or reopen closed write paths (anonymous INSERT into
  // events / page_subscribers) if pasted again, and one more is a pure record
  // of the live profiles UPDATE policy. Each must announce "DO NOT RUN" within
  // its first 10 lines, and supabase/migrations/README.md must list EVERY .sql
  // in the directory so a new file cannot arrive unclassified.
  { name:'MIG-HEADERS', migHeaders:true },
  // TL.PUB.SAMPLES.1: one sample-item rule, two runtimes. The sitemap (Deno,
  // supabase/functions/sitemap/rules.ts) lists a page only when it has a real
  // destination; the app (src/lib/placeholder-item.ts) hides every item that
  // lacks one from visitors. They cannot share a module, so isRealDestination
  // and the two constants it reads are copied verbatim — if the copies drift, a
  // page can be listed for content no visitor sees, or hidden content listed.
  // Compared whitespace-normalised; change both or neither.
  { name:'PLACEHOLDER-RULE-PARITY', placeholderParity:true },
  // FRAGILE.WRITES.1 (AUDIT.FRAGILE.1 E3/O3): supabase-js table writes and rpc
  // calls never throw — they RETURN { error }. A bare `await supabase.from(…)
  // .update(…)` statement inside a try/catch therefore can never reach its
  // catch, and the code after it announces success for a write that failed
  // (the half-applied reorder loops, the onboarding Finish that navigated on a
  // rejected onboarding_complete). Every awaited insert/update/upsert/delete or
  // rpc in src/ must keep its result; the statement form that discards it — one
  // line, or `await supabase` with the chain on the following lines — fails
  // here. `.auth`, `.storage` and `.functions` are out of scope. Analytics is
  // fire-and-forget by design and is the one allowlisted file.
  { name:'CHECKED-WRITES', checkedWrites:true },
  // FRAGILE.TAB.1 (AUDIT.FRAGILE.1 E1): supabase-js re-announces SIGNED_IN on
  // every tab return with a freshly built user object, and useAuth stores it.
  // A hook whose dependency array names the whole `user` therefore re-runs on
  // every visit back to the tab: the editor re-read its page and blocks (2 -> 6
  // page reads after two returns), handed DesignEditor a new themeJson and wiped
  // the unsaved draft; onboarding re-ran checkExisting and could jump to step 4.
  // Depend on `user?.id` (a real account change still re-runs). Every
  // useEffect/useLayoutEffect/useCallback/useMemo/useImperativeHandle in src/ is
  // scanned; useAuth.tsx, which owns the object, is out of scope.
  { name:'USER-ID-DEPS', userIdDeps:true },
  // TP.F0 (THEME.PREMIUM.3 §B): the premium look has ONE reader.
  // theme_json.look holds a premium theme's choices, and src/lib/page-look.ts
  // is the only code that reads it: absent or unknown values resolve to
  // today's, and every Pro choice the owner's plan lacks resolves to its free
  // value. A second reader would skip both rules, so a downgraded owner's
  // visitors could be served a Pro look, or an existing page could change.
  // Caught in every .ts/.tsx under src/ but that file: `.look` property access
  // (`raw.look`, `theme_json?.look`, and an assignment `x.look = …`, which
  // counts too — build the next theme_json with a spread), `['look']`,
  // `'look' in …`, and destructuring `{ look } = …`. Comments are stripped and
  // string contents blanked first. Writing `{ ...raw, look: next }` and
  // spreading the raw theme_json (the Design editor's save) are not reads.
  { name:'LOOK-ONE-READER', lookOneReader:true },
  // IMG.FIT.1: the picture fitter has ONE module. block_items.style_json's
  // picture keys (the stored frame's aspect, fit, the fit background) are read
  // and written only by src/lib/picture-fit.ts: it resolves absent or junk
  // values to today's cover, re-shapes a stored window for the box it paints
  // into, and never leaves a crop and a fit on one row. A second reader would
  // skip all three. Every .ts/.tsx under src/ but that file must not contain
  // the key strings at all (comments included), and that file must still
  // contain both.
  { name:'PICTURE-FIT-ONE-MODULE', pictureFitOneModule:true },
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
  if (c.usedKeys) {
    const dict = readFileSync(F('hooks/useLanguage.tsx'), 'utf8');
    const en = dict.slice(dict.indexOf('  en: {'), dict.indexOf('  es: {'));
    const keys = new Set([...en.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
    const walkSrc = (dir) => readdirSync(dir).flatMap((n) => {
      const p = `${dir}/${n}`;
      return statSync(p).isDirectory() ? walkSrc(p) : /\.(tsx?|jsx?)$/.test(p) ? [p] : [];
    });
    // `t(` not preceded by an identifier char or a dot (so `i18n.t(` / `fmt(`
    // never match), then one literal and the end of the first argument.
    const CALL = /(?<![\w$.])t\(\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$]*)`)\s*[,)]/g;
    const bad = [];
    let calls = 0;
    for (const f of walkSrc('src')) {
      for (const m of readFileSync(f, 'utf8').matchAll(CALL)) {
        calls++;
        const key = m[1] ?? m[2] ?? m[3];
        if (!keys.has(key)) bad.push(`${f}  '${key}'`);
      }
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - t() is called with a key the dictionary does not have`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      add the key to BOTH the en and es maps in src/hooks/useLanguage.tsx,`);
      console.error(`      or fix the spelling at the call site.`);
    } else {
      console.log(`ok ${c.name} (${calls} literal t() keys, all in the dictionary)`);
    }
    continue;
  }
  if (c.pwOneDoor) {
    const DOORS = new Set(['tests/fixtures.ts', 'tests/auth.setup.ts']);
    const bad = [];
    const freeKey = [];
    for (const f of walkTests()) {
      if (DOORS.has(f)) continue;
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (line.includes('@playwright/test')) bad.push(`${f}:${i + 1}  ${line.trim()}`);
        // TL.HARNESS.FREE.1 — the free key, as a STRING LITERAL in live code.
        // Comments may name the file (this rule is explained in prose in the
        // fixture and in helpers/auth.ts); only a real path opens a session.
        const code = /^\s*(\/\*|\*)/.test(line) ? '' : line.replace(/\/\/.*$/, '');
        if (/['"`][^'"`]*\.auth[\\/]+free\.json/.test(code)) {
          freeKey.push(`${f}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    if (bad.length || freeKey.length) {
      failed++;
      if (bad.length) {
        console.error(`x ${c.name} - direct '@playwright/test' import outside the fixture door`);
        bad.forEach((b) => console.error(`      ${b}`));
        console.error(`      specs must import { test, expect } (and types) from tests/fixtures.ts -`);
        console.error(`      the TL.ISO.2 default-deny write guard only exists behind that door.`);
      }
      if (freeKey.length) {
        console.error(`x ${c.name} - tests/.auth/free.json named outside the fixture door`);
        freeKey.forEach((b) => console.error(`      ${b}`));
        console.error(`      a hand-rolled browser.newContext({ storageState: free.json }) carries NO`);
        console.error(`      write-guard routes, so every mutation lands on the free account for real.`);
        console.error(`      Open the free session with withFreeUser(browser, async (page) => { ... })`);
        console.error(`      from tests/fixtures.ts - it installs the same guard the battery runs behind.`);
      }
    } else {
      console.log(`ok ${c.name} (${walkTests().length} files, one door, two keys)`);
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
      console.error(`      both tables are publicly readable - blocks USING (is_enabled),`);
      console.error(`      block_items joined to its enabled block - so a select`);
      console.error(`      with no filter returns EVERY public page's rows, not this account's -`);
      console.error(`      the TL.ISO.4b defect. Add an .eq( scope to the chain, or, if the read`);
      console.error(`      genuinely cannot be scoped, waive it in writing on that line or the`);
      console.error(`      one above: // PW-SCOPED-READS ok: <why this is safe>`);
    } else {
      console.log(`ok ${c.name} (${reads} reads of blocks/block_items)`);
    }
    continue;
  }
  if (c.fontsSelfHosted) {
    const bad = [];
    const GOOGLE = /fonts\.(googleapis|gstatic)\.com/;
    // No Google Fonts anywhere the app ships from.
    const walkSrc = (dir) => readdirSync(dir).flatMap((name) => {
      const p = `${dir}/${name}`;
      return statSync(p).isDirectory() ? walkSrc(p) : /\.(tsx?|css|html)$/.test(p) ? [p] : [];
    });
    for (const p of ['index.html', ...walkSrc('src')]) {
      readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (GOOGLE.test(line)) bad.push(`${p}:${i + 1}  ${line.trim().slice(0, 110)}`);
      });
    }
    // fonts.css declares the brand families and is imported ahead of index.css.
    let faces = 0;
    try {
      const fonts = readFileSync(F('lib/fonts.css'), 'utf8');
      faces = (fonts.match(/@font-face\s*\{/g) ?? []).length;
      for (const family of ['Playfair Display', 'DM Sans']) {
        if (!fonts.includes(`font-family: '${family}';`)) bad.push(`src/lib/fonts.css declares no @font-face for '${family}'`);
      }
    } catch {
      bad.push('src/lib/fonts.css is missing');
    }
    const main = readFileSync(F('main.tsx'), 'utf8');
    const iFonts = main.search(/import\s+["']\.\/lib\/fonts\.css["']/);
    const iIndex = main.search(/import\s+["']\.\/index\.css["']/);
    if (iFonts < 0) bad.push('src/main.tsx does not import "./lib/fonts.css"');
    else if (iIndex >= 0 && iFonts > iIndex) bad.push('src/main.tsx imports "./lib/fonts.css" after "./index.css"');
    // Never an @import in index.css (the TL.FONT.1 defect).
    readFileSync(F('index.css'), 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (/^\s*@import\b/.test(line)) bad.push(`src/index.css:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - web fonts are self-hosted from src/lib/fonts.css (TL.SEO.FONTS.1)`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      declare families with @font-face in src/lib/fonts.css (imported by main.tsx`);
      console.error(`      before index.css); never a Google Fonts URL, never an @import in index.css.`);
    } else {
      console.log(`ok ${c.name} (${faces} @font-face blocks in src/lib/fonts.css, imported before index.css; no Google Fonts; zero @import in index.css)`);
    }
    continue;
  }
  if (c.checkedWrites) {
    const ALLOW = new Set(['src/hooks/useEventTracking.ts']);
    const walkSrc = (dir) => readdirSync(dir).flatMap((name) => {
      const p = `${dir}/${name}`;
      return statSync(p).isDirectory() ? walkSrc(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
    // The statement that starts at `from`: up to the `;` at bracket depth 0, or
    // (no semicolon) the first newline at depth 0 that is not followed by a
    // `.` chain continuation. String literals and // comments are skipped.
    const statementAt = (src, from) => {
      let depth = 0;
      for (let i = from; i < src.length; i++) {
        const ch = src[i];
        if (ch === '"' || ch === "'" || ch === '`') {
          for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++;
          continue;
        }
        if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; i--; continue; }
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) { if (--depth < 0) return src.slice(from, i); }
        else if (ch === ';' && depth === 0) return src.slice(from, i);
        else if (ch === '\n' && depth === 0 && !/^\s*\./.test(src.slice(i + 1, i + 200))) return src.slice(from, i);
      }
      return src.slice(from);
    };
    const bad = [];
    let kept = 0;
    for (const f of walkSrc('src')) {
      const src = readFileSync(f, 'utf8');
      kept += (src.match(/=\s*await\s+supabase\s*\.\s*(rpc|from)\s*\(/g) ?? []).length;
      if (ALLOW.has(f)) continue;
      // An expression statement: `await supabase` is the first thing on its
      // line, so nothing receives the result.
      const re = /^[ \t]*await\s+supabase\b/gm;
      let m;
      while ((m = re.exec(src))) {
        const start = m.index + m[0].indexOf('await');
        const stmt = statementAt(src, start).replace(/\s+/g, ' ');
        const head = stmt.match(/^await supabase\s*\.\s*(\w+)\s*\(/);
        if (!head) continue; // .auth / .storage / .functions are out of scope
        const isWrite = head[1] === 'rpc'
          || (head[1] === 'from' && /\.\s*(insert|update|upsert|delete)\s*\(/.test(stmt));
        if (!isWrite) continue;
        const line = src.slice(0, start).split('\n').length;
        bad.push(`${f}:${line}  ${stmt.slice(0, 110)}`);
      }
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - a supabase table write or rpc discards its result (FRAGILE.WRITES.1)`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      supabase-js never throws on a failed write or rpc; it RETURNS { error }, so a`);
      console.error(`      bare await inside try/catch can never reach the catch. Keep the result:`);
      console.error(`      const { error } = await supabase...; if (error) throw error; (or the function's`);
      console.error(`      own failure path) so no success side effect runs after a failed write.`);
    } else {
      console.log(`ok ${c.name} (0 discarded write/rpc results in src/; ${kept} awaited calls keep theirs; ${ALLOW.size} file allowlisted)`);
    }
    continue;
  }
  if (c.lookOneReader) {
    const OWNER = 'src/lib/page-look.ts';
    const walkSrc = (dir) => readdirSync(dir).flatMap((name) => {
      const p = `${dir}/${name}`;
      return statSync(p).isDirectory() ? walkSrc(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
    // `code`: comments removed (newlines kept, so line numbers hold). `bare`:
    // the same with every string literal's contents blanked. A ' or " string
    // ends at a newline too, so a JSX apostrophe can blank at most its line.
    const strip = (src) => {
      let code = '', bare = '';
      for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === '/' && src[i + 1] === '/') {
          while (i < src.length && src[i] !== '\n') i++;
          i--; continue;
        }
        if (ch === '/' && src[i + 1] === '*') {
          const end = src.indexOf('*/', i + 2);
          const stop = end < 0 ? src.length : end + 2;
          const keep = src.slice(i, stop).replace(/[^\n]/g, '');
          code += keep; bare += keep; i = stop - 1; continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          let j = i + 1;
          for (; j < src.length && src[j] !== ch; j++) {
            if (src[j] === '\\') j++;
            else if (src[j] === '\n' && ch !== '`') break;
          }
          const lit = src.slice(i, j + 1);
          code += lit;
          bare += ch + lit.slice(1, -1).replace(/[^\n]/g, ' ') + (lit.length > 1 ? lit[lit.length - 1] : '');
          i = j; continue;
        }
        code += ch; bare += ch;
      }
      return { code, bare };
    };
    const READS = [
      { on: 'bare', re: /\.\s*look\b/g, what: '.look' },
      { on: 'bare', re: /\{[^{}]*\blook\b[^{}]*\}\s*=(?![=>])/g, what: '{ look } = destructuring' },
      { on: 'code', re: /\[\s*(['"`])look\1\s*\]/g, what: "['look']" },
      { on: 'code', re: /(['"`])look\1\s+in\b/g, what: "'look' in" },
    ];
    const bad = [];
    let scanned = 0;
    for (const f of walkSrc('src')) {
      if (f === OWNER) continue;
      scanned++;
      const parts = strip(readFileSync(f, 'utf8'));
      for (const r of READS) {
        for (const m of parts[r.on].matchAll(r.re)) {
          const line = parts[r.on].slice(0, m.index).split('\n').length;
          bad.push(`${f}:${line}  ${r.what}  ${parts.code.split('\n')[line - 1].trim().slice(0, 90)}`);
        }
      }
    }
    let ownerReads = false;
    try { ownerReads = /\.look\b/.test(strip(readFileSync(OWNER, 'utf8')).bare); } catch { /* reported below */ }
    if (!ownerReads) bad.push(`${OWNER} no longer reads theme_json.look - the one reader is missing`);
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - theme_json.look is read outside ${OWNER} (TP.F0)`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      The premium look has one reader: it fills absent values with today's and`);
      console.error(`      serves a plan without premiumThemes the free value of every Pro choice.`);
      console.error(`      Call resolveLook / resolveLookOption from ${OWNER} instead.`);
    } else {
      console.log(`ok ${c.name} (${scanned} files in src/ scanned; theme_json.look is read only in ${OWNER})`);
    }
    continue;
  }
  if (c.pictureFitOneModule) {
    const OWNER = 'src/lib/picture-fit.ts';
    const KEYS = ['crop_aspect', 'fit_bg'];
    const walkSrc = (dir) => readdirSync(dir).flatMap((name) => {
      const p = `${dir}/${name}`;
      return statSync(p).isDirectory() ? walkSrc(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
    const bad = [];
    let scanned = 0;
    for (const f of walkSrc('src')) {
      if (f === OWNER) continue;
      scanned++;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        for (const k of KEYS) if (line.includes(k)) bad.push(`${f}:${i + 1}  ${k}  ${line.trim().slice(0, 90)}`);
      });
    }
    let owner = '';
    try { owner = readFileSync(OWNER, 'utf8'); } catch { /* reported below */ }
    for (const k of KEYS) if (!owner.includes(k)) bad.push(`${OWNER} no longer names ${k} - the one module is missing`);
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - a picture-fit key is named outside ${OWNER} (IMG.FIT.1)`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      The picture fitter has one module: read with resolvePictureFit / pictureFitSeed,`);
      console.error(`      write with writePictureFit, so junk resolves to cover and crop and fit never mix.`);
    } else {
      console.log(`ok ${c.name} (${scanned} files in src/ scanned; ${KEYS.join(' / ')} appear only in ${OWNER})`);
    }
    continue;
  }
  if (c.userIdDeps) {
    const SKIP = new Set(['src/hooks/useAuth.tsx']);
    const walkSrc = (dir) => readdirSync(dir).flatMap((name) => {
      const p = `${dir}/${name}`;
      return statSync(p).isDirectory() ? walkSrc(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
    // From the `(` at `open`, the top-level arguments of the call up to its
    // matching `)`. String literals, // and /* */ comments are skipped.
    const argsAt = (src, open) => {
      const args = [];
      let depth = 0, start = open + 1;
      for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === '"' || ch === "'" || ch === '`') {
          for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++;
          continue;
        }
        if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i++; continue; }
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) {
          if (--depth === 0) { args.push({ text: src.slice(start, i), at: start }); return args; }
        } else if (ch === ',' && depth === 1) { args.push({ text: src.slice(start, i), at: start }); start = i + 1; }
      }
      return args;
    };
    // `user` as a whole identifier, not `user?.id` / `user.id` / `userId`.
    const BARE = /(?<![\w$.])user(?![\w$])(?!\s*\??\.)/;
    const bad = [];
    let arrays = 0;
    for (const f of walkSrc('src')) {
      if (SKIP.has(f)) continue;
      const src = readFileSync(f, 'utf8');
      const re = /\b(?:React\.)?use(?:Effect|LayoutEffect|Callback|Memo|ImperativeHandle)\s*(?:<[^>()]*>)?\s*\(/g;
      let m;
      while ((m = re.exec(src))) {
        const args = argsAt(src, m.index + m[0].length - 1).filter((a) => a.text.trim());
        const deps = args[args.length - 1];
        if (args.length < 2 || !deps.text.trim().startsWith('[')) continue;
        arrays++;
        const body = deps.text.trim().replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
        if (!BARE.test(body)) continue;
        const line = src.slice(0, deps.at + deps.text.indexOf('[')).split('\n').length;
        bad.push(`${f}:${line}  ${body.replace(/\s+/g, ' ').slice(0, 100)}`);
      }
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - a hook dependency array names the whole \`user\` object (FRAGILE.TAB.1)`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      supabase-js re-announces the session on every tab return with a NEW user`);
      console.error(`      object, so this hook re-runs each time the creator comes back to the tab`);
      console.error(`      (editor reloads, unsaved drafts reset). Depend on user?.id instead.`);
    } else {
      console.log(`ok ${c.name} (${arrays} hook dependency arrays in src/, none names the bare user object)`);
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
  if (c.placeholderParity) {
    const COPIES = ['src/lib/placeholder-item.ts', 'supabase/functions/sitemap/rules.ts'];
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    // The function runs from its signature to the first column-0 `}` after it
    // (inner braces are indented), plus the one-line constants it reads.
    const PARTS = {
      'function isRealDestination': (src) => {
        const start = src.indexOf('function isRealDestination(');
        const end = start === -1 ? -1 : src.indexOf('\n}', start);
        return end === -1 ? null : src.slice(start, end + 2);
      },
      'const PLACEHOLDER_HOST': (src) => src.match(/^const PLACEHOLDER_HOST = .*$/m)?.[0] ?? null,
      'const WHATSAPP_HOSTS': (src) => src.match(/^const WHATSAPP_HOSTS = .*$/m)?.[0] ?? null,
    };
    const bad = [];
    const srcs = COPIES.map((f) => {
      try { return readFileSync(f, 'utf8'); }
      catch { bad.push(`cannot read ${f}`); return null; }
    });
    if (!bad.length) {
      for (const [part, extract] of Object.entries(PARTS)) {
        const [a, b] = srcs.map(extract);
        if (a === null || b === null) {
          COPIES.forEach((f, i) => { if ((i ? b : a) === null) bad.push(`${f}: '${part}' not found`); });
        } else if (norm(a) !== norm(b)) {
          bad.push(`'${part}' differs between ${COPIES[0]} and ${COPIES[1]}`);
        }
      }
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - the sample-item rule has drifted between the app and the sitemap`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      isRealDestination and its constants are a verbatim copy: make the same change`);
      console.error(`      in both files, or the sitemap and the public page disagree about samples.`);
    } else {
      console.log(`ok ${c.name} (isRealDestination + ${Object.keys(PARTS).length - 1} constants identical in app and sitemap)`);
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
    const FACE_CAP = 1400000;       // bytes raw, a lazy pre-minified library chunk
    const FACE_KEY = '@vladmandic/face-api';
    // The named lazy exceptions: single pre-minified modules that cannot be
    // split further, each behind a dynamic import so /:handle never loads them.
    //   @vladmandic/face-api — TensorFlow inside (TL.BUNDLE.1), loadFaceApi()
    //   heic2any             — libheif WASM inlined (MEDIA.PHOTO.2), imported
    //                          lazily by src/lib/prepare-image.ts for non-iOS
    //                          HEIC picks only
    const LAZY_LIBS = [FACE_KEY, 'heic2any'];
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
        // chunk file → the lazy library it belongs to
        const lazyFiles = new Map();
        for (const lib of LAZY_LIBS) {
          const files = Object.keys(manifest).filter((k) => k.includes(lib)).map((k) => manifest[k].file);
          if (!files.length) bad.push(`no chunk for ${lib} in the manifest - the library is no longer a separate lazy chunk`);
          for (const f of files) lazyFiles.set(f, lib);
        }
        if (js.length < 4) bad.push(`assets/ holds ${js.length} JS chunk(s); route-level splitting should produce at least 4`);
        for (const [f, lib] of lazyFiles) if (eager.has(f)) bad.push(`${f} (${lib}) is in the entry's static import closure - /:handle would download it`);
        for (const f of eager) {
          if (f.endsWith('.js') && MODEL_MARK.test(readFileSync(`${OUT}/${f}`, 'utf8'))) bad.push(`${f} is eager and carries face-api model strings`);
        }
        for (const n of js) {
          const lib = lazyFiles.get(`assets/${n}`);
          const cap = lib ? FACE_CAP : CAP;
          const b = size(n);
          if (b > cap) bad.push(`assets/${n} is ${b.toLocaleString('en-US')} B raw, over the ${cap.toLocaleString('en-US')} B ${lib ?? 'chunk'} cap`);
        }
        const entryBytes = entry ? statSync(`${OUT}/${entry.file}`).size : 0;
        summary = `${js.length} JS chunks, entry ${entry ? entry.file.replace('assets/', '') : '?'} ${entryBytes.toLocaleString('en-US')} B raw, ${eager.size} eager, ${LAZY_LIBS.length} lazy libs (face-api, heic2any)`;
      }
    }
    if (bad.length) {
      failed++;
      console.error(`x ${c.name} - the build must stay route-split with face-api out of the entry`);
      bad.forEach((b) => console.error(`      ${b}`));
      console.error(`      one chunk serving every route is the AUDIT_rev6 #13 defect: /:handle visitors`);
      console.error(`      download the editor, the dashboard and a face detector. Keep the routes in`);
      console.error(`      App.tsx lazy, face-api behind loadFaceApi() and heic2any behind prepareImage();`);
      console.error(`      never re-add a static import.`);
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

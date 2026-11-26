// TP.F0 — unit checks for src/lib/page-look.ts: the look record, its resolver
// and its gate. Runner: tsx (same as scripts/plan-gate.test.mjs); wired into
// `npm run guard`. Pure-function assertions — no DB, no React, no network.
//   npx tsx scripts/page-look.test.mjs
//
// The EXPECTED table below is written from the plan (THEME.PREMIUM.3 sections
// B and I), not read from the module, so a wrong free value, a wrong "today"
// or a Pro mark in the wrong place fails here.

import assert from 'node:assert/strict';
import {
  LOOK_OPTIONS,
  LOOK_THEMES,
  PAGE_LOOK_KEYS,
  isLookOptionLocked,
  isLookProValue,
  resolveLook,
  resolveLookOption,
  resolveLookWithDraft,
  writeLookOptions,
} from '../src/lib/page-look';
import { ENTITLEMENTS, PLAN_ORDER } from '../src/lib/entitlements';
import { FONT_OPTIONS } from '../src/lib/fonts';
import { DEFAULT_THEME } from '../src/lib/theme-defaults';

let passed = 0;
const ok = (m) => { passed++; console.log('ok - ' + m); };

const LINK_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const FONT_KEYS = FONT_OPTIONS.map((o) => o.value);
const all = (keys, to) => Object.fromEntries(keys.map((k) => [k, to]));
const LINK_CARD_PRO = ['grouped', 'index', 'wallet', 'credits', 'menu'];

// key → today's value, the free choices, and each Pro choice → its free value
// (section B "Free fallback for a downgraded owner").
const EXPECTED = {
  pageStyle:      { today: 'hero',     free: ['hero', 'full_bleed'], pro: { sheet: 'full_bleed', band: 'hero' } },
  photoTreatment: { today: 'fade',     free: ['fade', 'clean'],      pro: { shade: 'fade', twoTone: 'fade' } },
  namePlacement:  { today: 'page',     free: ['page', 'below'],      pro: { photo: 'page' } },
  nameAlign:      { today: 'center',   free: ['left', 'center'],     pro: {} },
  nameScale:      { today: 'normal',   free: ['normal'],             pro: all(['wordmark', 'large', 'poster'], 'normal') },
  lettering:      { today: 'normal',   free: ['normal'],             pro: all(['caps', 'wide'], 'normal') },
  roleLine:       { today: 'off',      free: ['off'],                pro: all(['above', 'beside'], 'off') },
  showHandle:     { today: 'on',       free: ['on', 'off'],          pro: {} },
  handlePosition: { today: 'under',    free: ['under', 'beside'],    pro: {} },
  taglineSize:    { today: 'normal',   free: ['small', 'normal', 'large', 'headline'], pro: {} },
  followButton:   { today: 'off',      free: ['off'],                pro: { on: 'off' } },
  statusPill:     { today: 'off',      free: ['off'],                pro: all(['text', 'openNow'], 'off') },
  nameFont:       { today: 'same',     free: ['same'],               pro: all(FONT_KEYS, 'same'), open: true },
  iconsStyle:     { today: 'plain',    free: ['plain'],              pro: all(['outlined', 'tiles'], 'plain') },
  iconsAlign:     { today: 'center',   free: ['left', 'center', 'right'], pro: {} },
  iconsPlacement: { today: 'under',    free: ['under'],              pro: all(['beside', 'band'], 'under') },
  dockedLink:     { today: 'off',      free: ['off'],                pro: { [LINK_ID]: 'off' }, open: true },
  emailField:     { today: 'boxed',    free: ['boxed'],              pro: { underline: 'boxed' } },
  mediaFrame:     { today: 'standard', free: ['standard'],           pro: { wide: 'standard' } },
  linkCard:       { today: 'buttons',  free: ['buttons'],            pro: all(LINK_CARD_PRO, 'buttons') },
  itemCard:       { today: 'same',     free: ['same'],               pro: all(['featured', 'buttons', ...LINK_CARD_PRO], 'same') },
  eventsDisplay:  { today: 'cards',    free: ['cards'],              pro: all(['ledger', 'stub'], 'cards') },
  textDisplay:    { today: 'text',     free: ['text', 'hours'],      pro: all(['ticker', 'billing'], 'text') },
  productLayout:  { today: 'grid',     free: ['full', 'filmstrip', 'grid'], pro: { mosaic: 'grid' } },
};
const KEYS = Object.keys(EXPECTED);
const PAGE_HOMES = new Set(['pageStyle', 'look', 'typography']);
const isPageKey = (k) => PAGE_HOMES.has(LOOK_OPTIONS[k].home.at);
const lookKeys = KEYS.filter((k) => LOOK_OPTIONS[k].home.at === 'look');

/** A theme_json that stores `value` for `key` where the key lives (page-level
 *  keys only). The page style is a page's own `pages.page1.style`. */
const storing = (key, value) => {
  const home = LOOK_OPTIONS[key].home;
  if (home.at === 'pageStyle') return { ...DEFAULT_THEME, pages: { page1: { style: value } } };
  if (home.at === 'typography') return { ...DEFAULT_THEME, typography: { ...DEFAULT_THEME.typography, [home.field]: value } };
  return { ...DEFAULT_THEME, look: { v: 1, theme: 'cartel', options: { [key]: value } } };
};
const deepFreeze = (o) => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const PLANS = [...PLAN_ORDER, null, 'enterprise'];

// ── 1. The table is the plan's table ────────────────────────────────────────
assert.deepEqual(Object.keys(LOOK_OPTIONS).sort(), [...KEYS].sort(), 'one table row per catalogue option');
for (const key of KEYS) {
  const def = LOOK_OPTIONS[key];
  const exp = EXPECTED[key];
  assert.equal(def.today, exp.today, `${key}: today`);
  assert.ok(exp.free.includes(def.today), `${key}: today is a free choice`);
  for (const v of exp.free) {
    assert.ok(def.choices.includes(v), `${key}: ${v} is a listed choice`);
    assert.equal(isLookProValue(key, v), false, `${key}: ${v} is free`);
  }
  for (const v of Object.keys(exp.pro)) {
    assert.equal(isLookProValue(key, v), true, `${key}: ${v} is Pro`);
    if (!exp.open) assert.ok(def.choices.includes(v), `${key}: ${v} is a listed choice`);
  }
  if (!exp.open) {
    assert.deepEqual([...def.choices].sort(), [...exp.free, ...Object.keys(exp.pro)].sort(), `${key}: choices`);
  }
  for (const to of Object.values(def.fallback ?? {})) {
    assert.ok(def.choices.includes(to) && !isLookProValue(key, to), `${key}: fallback ${to} is a free choice`);
  }
}
ok(`LOOK_OPTIONS matches the catalogue: ${KEYS.length} options, today / free / Pro per row`);

assert.deepEqual([...PAGE_LOOK_KEYS].sort(), KEYS.filter(isPageKey).sort(), 'PAGE_LOOK_KEYS = every theme_json-held option');
assert.equal(isLookProValue('notAnOption', 'poster'), false, 'unknown key is never Pro');
assert.equal(isLookOptionLocked('free', 'notAnOption', 'poster'), false, 'unknown key never locks');
ok('PAGE_LOOK_KEYS covers every page-level option; unknown keys are inert');

// ── 2. Absent = today, on every plan ────────────────────────────────────────
const todayLook = Object.fromEntries(PAGE_LOOK_KEYS.map((k) => [k, EXPECTED[k].today]));
const absentInputs = [
  undefined, null, 'not json', 42, [], {},
  { ...DEFAULT_THEME },
  { ...DEFAULT_THEME, look: null },
  { ...DEFAULT_THEME, look: 'cartel' },
  { ...DEFAULT_THEME, look: [] },
  { ...DEFAULT_THEME, look: { theme: 'cartel', options: { nameScale: 'poster' } } },        // no v
  { ...DEFAULT_THEME, look: { v: 2, theme: 'cartel', options: { nameScale: 'poster' } } },  // future v
  { ...DEFAULT_THEME, look: { v: '1', options: { nameScale: 'poster' } } },                 // v as a string
  { ...DEFAULT_THEME, look: { v: 1, options: null } },
  { ...DEFAULT_THEME, look: { v: 1, options: ['poster'] } },
];
for (const input of absentInputs) {
  for (const plan of [undefined, ...PLANS]) {
    const look = resolveLook(input, 'page1', plan);
    assert.deepEqual({ ...look, theme: undefined, palette: undefined }, { ...todayLook, theme: undefined, palette: undefined },
      `absent look (${JSON.stringify(input)?.slice(0, 60)}) / ${String(plan)} = today`);
  }
}
for (const key of KEYS) {
  for (const plan of [undefined, ...PLANS]) {
    assert.equal(resolveLookOption(key, undefined, plan), EXPECTED[key].today, `${key}: absent / ${String(plan)}`);
  }
}
ok('no look record (and every unreadable one) resolves to today for every option, on every plan');

// Wrongly typed and unknown values are absent too.
for (const key of KEYS) {
  for (const junk of [null, 0, 1, true, false, {}, [], 'bogus', '', ' POSTER ']) {
    if (EXPECTED[key].open && typeof junk === 'string' && junk.trim() && key === 'dockedLink') continue; // any id string is a link id
    assert.equal(resolveLookOption(key, junk), EXPECTED[key].today, `${key}: ${JSON.stringify(junk)} → today`);
  }
}
for (const key of lookKeys) {
  assert.equal(resolveLook(storing(key, 7), 'page1')[key], EXPECTED[key].today, `${key}: a number in look.options → today`);
  assert.equal(resolveLook(storing(key, 'bogus'), 'page1')[key], key === 'dockedLink' ? 'bogus' : EXPECTED[key].today, `${key}: unknown string`);
}
assert.equal(resolveLookOption('nameFont', 'custom:Brand Sans'), 'same', 'an uploaded font is not a catalog font');
assert.equal(resolveLookOption('dockedLink', 'x'.repeat(65)), 'off', 'an overlong id is not a link id');
ok('wrongly typed and unknown values resolve to today (an uploaded name font included)');

// ── 3. Without a plan: what is saved ────────────────────────────────────────
for (const key of KEYS) {
  for (const v of [...EXPECTED[key].free, ...Object.keys(EXPECTED[key].pro)]) {
    assert.equal(resolveLookOption(key, v), v, `${key}: ${v} saved = returned (owner canvas)`);
    if (isPageKey(key) && key !== 'pageStyle') {
      assert.equal(resolveLook(storing(key, v), 'page1')[key], v, `${key}: ${v} via resolveLook (owner canvas)`);
    }
  }
}
ok('without a plan every valid saved value comes back as saved, Pro ones included');

// ── 4. Free plan = free value; Pro and Business = saved ─────────────────────
for (const key of KEYS) {
  for (const [v, freeTo] of Object.entries(EXPECTED[key].pro)) {
    for (const plan of PLANS) {
      const want = ENTITLEMENTS[plan] && ENTITLEMENTS[plan].premiumThemes ? v : freeTo;
      assert.equal(resolveLookOption(key, v, plan), want, `${key}: ${v} on ${String(plan)}`);
      if (isPageKey(key) && key !== 'pageStyle') {
        assert.equal(resolveLook(storing(key, v), 'page1', plan)[key], want, `${key}: ${v} via resolveLook on ${String(plan)}`);
      }
    }
  }
  for (const v of EXPECTED[key].free) {
    for (const plan of PLANS) assert.equal(resolveLookOption(key, v, plan), v, `${key}: free ${v} on ${String(plan)}`);
  }
}
ok('a Pro value resolves to its free value on Free / null / unknown plans, and stays on Pro and Business');

// The whole record at once, as a downgraded Cartel owner's visitors see it.
const cartel = {
  ...DEFAULT_THEME,
  typography: { ...DEFAULT_THEME.typography, font: 'archivo', display_font: 'bebas' },
  look: {
    v: 1, theme: 'cartel', palette: 'amarillo',
    options: {
      photoTreatment: 'twoTone', namePlacement: 'photo', nameAlign: 'left', nameScale: 'poster',
      lettering: 'caps', roleLine: 'beside', iconsAlign: 'right', iconsPlacement: 'beside',
      dockedLink: LINK_ID, taglineSize: 'headline',
    },
  },
};
const proView = resolveLook(cartel, 'page1', 'pro');
const freeView = resolveLook(cartel, 'page1', 'free');
assert.equal(proView.nameScale, 'poster');
assert.equal(proView.nameFont, 'bebas');
assert.deepEqual(
  { ...freeView },
  {
    ...todayLook,
    theme: 'cartel', palette: 'amarillo',          // the name and the colours stay (colours are free)
    nameAlign: 'left', iconsAlign: 'right', taglineSize: 'headline', // free rearrangements stay
  },
  'downgraded Cartel = today\'s page with Cartel colours and its free choices',
);
ok('a downgraded Cartel page keeps its colours and free choices; every Pro choice falls back');

// ── 5. Page style: unbuilt styles fall back exactly as today ────────────────
// Today's rule, copied from resolveEffectivePageStyle before TP.F0.
const todayPageStyle = (json, id) => {
  const own = json?.pages?.[id]?.style;
  if (own === 'full_bleed' || own === 'hero') return own;
  return json?.pageStyle === 'full_bleed' ? 'full_bleed' : 'hero';
};
for (const profile of [undefined, 'hero', 'full_bleed', 'sheet', 'band', 'bogus']) {
  for (const own of [undefined, 'hero', 'full_bleed', 'sheet', 'band', 'bogus', 7]) {
    for (const id of ['page1', 'page2']) {
      const json = { ...DEFAULT_THEME, ...(profile ? { pageStyle: profile } : {}), pages: { [id]: own === undefined ? {} : { style: own } } };
      for (const plan of [undefined, ...PLANS]) {
        assert.equal(resolveLook(json, id, plan).pageStyle, todayPageStyle(json, id),
          `pageStyle profile=${profile} own=${own} ${id} plan=${String(plan)}`);
      }
    }
  }
}
assert.equal(resolveLook({ pages: { page1: { style: 'hero' }, page2: { style: 'full_bleed' } } }, 'page2').pageStyle, 'full_bleed', 'activePageId picks the page');
ok('page style = today\'s resolution on every plan; stored sheet / band fall back like any unknown value');

// ── 6. The saved record is never changed ────────────────────────────────────
const frozen = deepFreeze(structuredClone(cartel));
const before = JSON.stringify(frozen);
for (const plan of [undefined, ...PLANS]) {
  for (const id of ['page1', 'page2']) resolveLook(frozen, id, plan); // a write into a frozen object throws in strict mode
}
for (const key of KEYS) {
  const saved = deepFreeze({ v: Object.keys(EXPECTED[key].pro)[0] ?? EXPECTED[key].today });
  for (const plan of PLANS) resolveLookOption(key, saved.v, plan);
}
assert.equal(JSON.stringify(frozen), before, 'theme_json byte-identical after every resolve');
const fresh = structuredClone(cartel);
resolveLook(fresh, 'page1', 'free');
assert.deepEqual(fresh, cartel, 'an unfrozen record is not rewritten either');
assert.notEqual(resolveLook(cartel, 'page1'), resolveLook(cartel, 'page1'), 'each call returns a new object');
ok('resolveLook never mutates or rewrites what is saved (frozen and unfrozen input, every plan)');

// ── 7. Theme and palette ────────────────────────────────────────────────────
for (const theme of LOOK_THEMES) {
  for (const plan of [undefined, ...PLANS]) {
    assert.equal(resolveLook({ look: { v: 1, theme } }, 'page1', plan).theme, theme, `${theme} on ${String(plan)}`);
  }
}
for (const bad of ['Cartel', 'linktree', '', 3, null]) {
  assert.equal(resolveLook({ look: { v: 1, theme: bad } }, 'page1').theme, null, `theme ${JSON.stringify(bad)} → null`);
}
assert.equal(resolveLook({ look: { v: 1, palette: '   ' } }, 'page1').palette, null);
assert.equal(resolveLook({ look: { v: 1, palette: 4 } }, 'page1').palette, null);
assert.equal(resolveLook({ look: { v: 1, palette: 'amarillo' } }, 'page1', 'free').palette, 'amarillo', 'colours are free');
ok('theme names and palettes pass through on every plan; unknown ones resolve to null');

// ── 8. Owner lock == visitor gate, every tier (null = refused) ──────────────
for (const plan of PLANS) {
  for (const key of KEYS) {
    const values = [...EXPECTED[key].free, ...Object.keys(EXPECTED[key].pro), 'bogus', undefined, null, 3];
    for (const v of values) {
      const gatedAway = v !== undefined && v !== null && typeof v === 'string'
        && resolveLookOption(key, v) === v && resolveLookOption(key, v, plan) !== v;
      assert.equal(isLookOptionLocked(plan, key, v), gatedAway, `${String(plan)} ${key}=${String(v)}`);
    }
  }
}
assert.equal(isLookOptionLocked(null, 'nameScale', 'poster'), true, 'unreadable plan refuses');
assert.equal(isLookOptionLocked(undefined, 'nameScale', 'poster'), true, 'no plan refuses (usePlanLock waits for the load)');
assert.equal(isLookOptionLocked('pro', 'nameScale', 'poster'), false);
assert.equal(isLookOptionLocked('free', 'nameScale', 'normal'), false, 'a free value never locks');
ok('isLookOptionLocked locks exactly what a visitor is served the free value of, on every tier');

// ── 9. The writer (TP.F4): writeLookOptions ─────────────────────────────────
// Rules written from the TP.F4 brief, section 3.
{
  const LOOK_HOME_KEYS = KEYS.filter((k) => LOOK_OPTIONS[k].home.at === 'look');
  const base = deepFreeze({
    ...structuredClone(DEFAULT_THEME),
    headerConfig: { nameSize: 31 },
    pages: { page1: { style: 'hero' } },
    pageStyle: 'hero',
    typography: { ...DEFAULT_THEME.typography, font: 'playfair' },
  });
  const baseJson = JSON.stringify(base);

  // a. Returns a NEW theme_json and never mutates (frozen input: a write throws).
  const w1 = writeLookOptions(base, { nameAlign: 'left' });
  assert.notEqual(w1, base, 'a new object');
  assert.equal(JSON.stringify(base), baseJson, 'input untouched');
  assert.deepEqual(w1.look, { v: 1, options: { nameAlign: 'left' } }, 'record shape { v: 1, options }');
  // Every other key is carried over untouched.
  const { look: _l1, ...w1Rest } = w1;
  assert.deepEqual(w1Rest, base, 'every other theme_json key carried over');
  ok('writeLookOptions returns a new theme_json, never mutates, carries every other key over');

  // b. Only look-home keys, only allowed values; the rest of the patch is ignored.
  const junk = writeLookOptions(base, {
    pageStyle: 'full_bleed',            // home pageStyle
    nameFont: 'playfair',               // home typography
    linkCard: 'grouped',                // home block
    itemCard: 'featured',               // home item
    nameAlign: 'right',                 // not a choice
    showHandle: false,                  // wrong type
    iconsAlign: 7,                      // wrong type
    notAnOption: 'x',
    toString: 'left', constructor: 'left', __proto__: 'left',
    handlePosition: 'beside',           // the one valid entry
  });
  assert.deepEqual(junk.look, { v: 1, options: { handlePosition: 'beside' } }, 'only the valid look-home entry lands');
  assert.equal(junk.pageStyle, 'hero', 'a pageStyle in the patch does not touch the profile page style');
  assert.deepEqual(junk.pages, base.pages, 'nor pages.<id>.style');
  assert.equal(junk.typography.display_font, undefined, 'nor typography');
  for (const key of KEYS.filter((k) => LOOK_OPTIONS[k].home.at !== 'look')) {
    const v = [...EXPECTED[key].free, ...Object.keys(EXPECTED[key].pro)].find((x) => x !== EXPECTED[key].today) ?? 'x';
    assert.equal(writeLookOptions(base, { [key]: v }).look, undefined, `${key} (home ${LOOK_OPTIONS[key].home.at}) is never written to look`);
  }
  for (const key of LOOK_HOME_KEYS) {
    for (const v of [...EXPECTED[key].free, ...Object.keys(EXPECTED[key].pro)]) {
      const out = writeLookOptions(base, { [key]: v });
      if (v === EXPECTED[key].today) assert.equal(out.look, undefined, `${key}=${v} (today) stores nothing`);
      else assert.deepEqual(out.look, { v: 1, options: { [key]: v } }, `${key}=${v} stored`);
    }
    assert.equal(writeLookOptions(base, { [key]: 'bogus value!' }).look?.options?.[key],
      key === 'dockedLink' ? 'bogus value!' : undefined, `${key}: an unlisted value is ignored (a link id is the one open choice)`);
  }
  ok('only keys whose home is look, and only values the table allows, are written');

  // c. A value equal to today deletes the key; options empty + no theme/palette → no look key.
  const two = writeLookOptions(base, { nameAlign: 'left', iconsAlign: 'right' });
  const back = writeLookOptions(deepFreeze(structuredClone(two)), { nameAlign: 'center' });
  assert.deepEqual(back.look, { v: 1, options: { iconsAlign: 'right' } }, 'today deletes just that key');
  const none = writeLookOptions(back, { iconsAlign: 'center' });
  assert.equal('look' in none, false, 'empty options and no theme/palette: the look key is removed');
  assert.equal(JSON.stringify(none), baseJson, 'back to the bytes we started from');
  assert.equal('look' in writeLookOptions(base, { showHandle: 'on', handlePosition: 'under', namePlacement: 'page' }), false,
    'writing only today\'s values onto a page with no look stores nothing');
  assert.equal('look' in writeLookOptions(base, {}), false, 'an empty patch adds nothing');
  assert.equal('look' in writeLookOptions(base, null), false, 'a null patch adds nothing');
  ok('a value equal to today deletes its key; an emptied record with no theme or palette removes `look`');

  // d. An existing theme and palette are kept, with the record's other options.
  const withTheme = deepFreeze({ ...base, look: { v: 1, theme: 'cartel', palette: 'amarillo', options: { iconsAlign: 'left' } } });
  assert.deepEqual(writeLookOptions(withTheme, { nameAlign: 'left' }).look,
    { v: 1, theme: 'cartel', palette: 'amarillo', options: { iconsAlign: 'left', nameAlign: 'left' } }, 'theme, palette and other options kept');
  assert.deepEqual(writeLookOptions(withTheme, { iconsAlign: 'center' }).look,
    { v: 1, theme: 'cartel', palette: 'amarillo', options: {} }, 'emptied options keep a record that has a theme');
  assert.deepEqual(writeLookOptions({ look: { v: 1, palette: 'rosa' } }, { showHandle: 'off' }).look,
    { v: 1, palette: 'rosa', options: { showHandle: 'off' } }, 'palette alone is kept; a missing options object starts empty');
  ok('an existing theme and palette are kept');

  // e. A record with another v is replaced.
  for (const prior of [{ v: 2, theme: 'cartel', options: { nameAlign: 'left' } }, { theme: 'pase' }, { v: '1', options: { iconsAlign: 'left' } }, 'cartel', null, []]) {
    assert.deepEqual(writeLookOptions({ ...base, look: prior }, { showHandle: 'off' }).look, { v: 1, options: { showHandle: 'off' } },
      `prior ${JSON.stringify(prior)} replaced`);
    assert.equal('look' in writeLookOptions({ ...base, look: prior }, { showHandle: 'on' }), false, `prior ${JSON.stringify(prior)} replaced by nothing`);
  }
  ok('a record with another v (or none) is replaced');

  // f. resolveLook(writeLookOptions(x, p)) returns p's values; the input is not mutated.
  const patches = [
    { namePlacement: 'below', nameAlign: 'left', showHandle: 'off', handlePosition: 'beside', iconsAlign: 'right' },
    { namePlacement: 'page', nameAlign: 'center', showHandle: 'on', handlePosition: 'under', iconsAlign: 'center' },
    { nameAlign: 'left', iconsAlign: 'left' },
    { handlePosition: 'beside' },
  ];
  for (const x of [base, withTheme, deepFreeze({ look: { v: 1, options: { nameAlign: 'left', showHandle: 'off' } } }), undefined, null]) {
    const before = JSON.stringify(x);
    for (const p of patches) {
      const written = writeLookOptions(x, p);
      const look = resolveLook(written, 'page1');
      for (const [k, v] of Object.entries(p)) assert.equal(look[k], v, `${k}=${v} reads back`);
      for (const plan of [...PLANS]) {
        const gated = resolveLook(written, 'page1', plan);
        for (const [k, v] of Object.entries(p)) assert.equal(gated[k], v, `${k}=${v} reads back on ${String(plan)} (free choices)`);
      }
      assert.equal(JSON.stringify(x), before, 'input not mutated');
    }
  }
  ok('resolveLook(writeLookOptions(x, p)) returns p\'s values on every plan; the input is never mutated');

  // g. The draft path: resolveLookWithDraft = resolveLook over writeLookOptions.
  const saved = writeLookOptions(base, { nameAlign: 'left', iconsAlign: 'right' });
  assert.deepEqual(resolveLookWithDraft(saved, null, 'page1'), resolveLook(saved, 'page1'), 'no draft = what is saved');
  assert.deepEqual(resolveLookWithDraft(saved, { displayName: 'x' }, 'page1'), resolveLook(saved, 'page1'), 'a draft with no look = what is saved');
  assert.deepEqual(resolveLookWithDraft(saved, { look: { nameAlign: 'center', showHandle: 'off' } }, 'page1', 'free'),
    resolveLook(writeLookOptions(saved, { nameAlign: 'center', showHandle: 'off' }), 'page1', 'free'), 'a draft resolves over the written record');
  assert.equal(resolveLookWithDraft(saved, { look: { nameAlign: 'center' } }, 'page1').iconsAlign, 'right', 'saved options the draft does not name stay');
  ok('resolveLookWithDraft resolves a draft and a saved value through one path');
}

console.log('\nAll ' + passed + ' checks passed.');

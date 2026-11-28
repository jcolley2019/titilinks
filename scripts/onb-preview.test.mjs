// TL.ONB.STAGE.2 — unit test for src/lib/onboarding-preview.ts: the theme literal
// onboarding writes, and the in-memory page + blocks the desktop phone preview
// renders before step 3 has created anything.
//
// The theme expectations are the CONTRACT: they were derived from the original
// inline literal in OnboardingFlow.handleStep3Next, so if the extraction ever
// drifts, the bytes written to pages.theme_json change and this fails.
//
// The block expectations carry a drift guard of their own: every placeholder
// string the preview invents is asserted to appear verbatim in the source text
// of OnboardingFlow.tsx, so the preview cannot promise content that
// prefillBlockContent does not actually seed.
//
// Same convention as onb-original.test.mjs: standalone node script, no DOM, no
// network. Run:
//   npx tsx scripts/onb-preview.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildOnboardingTheme,
  buildPreviewPage,
  buildPreviewBlocks,
} from '../src/lib/onboarding-preview';
import { BLOCK_PRESETS } from '../src/lib/block-presets';
import { writePictureFit } from '../src/lib/picture-fit';
import { resolveHeroWindowFraming } from '../src/lib/hero-window';
import { canonicalHeroAspect } from '../src/lib/device-presets';
import { readHeroEnhance, writeHeroEnhance } from '../src/lib/hero-enhance';
import { sanitizeParams } from '../src/lib/auto-enhance';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── the theme literal ───────────────────────────────────────────────────────
const stateA = {
  pageStyle: 'full_bleed',
  backgroundType: 'gradient',
  gradientStart: '#667eea',
  gradientEnd: '#764ba2',
  backgroundColor: '#0e0c09',
  buttonShape: 'pill',
  buttonStyle: 'solid_rounded',
  fontChoice: 'modern',
  linkLayout: 'standard',
  linkCount: 3,
};

assert.deepEqual(buildOnboardingTheme(stateA), {
  background: {
    type: 'gradient',
    solid_color: '#667eea',
    gradient_css: 'linear-gradient(135deg, #667eea, #764ba2)',
    image_url: '',
    overlay_color: '#000000',
    overlay_opacity: 0.5,
    source: null,
  },
  buttons: {
    variant: 'glass',
    shape: 'pill',
    background_opacity: 0.35,
    fill_color: '#FFFFFF',
    text_color: '#FFFFFF',
    border_enabled: true,
    border_color: '#FFFFFF',
  },
  buttonStyle: 'solid_rounded',
  typography: { font: 'modern', text_color: '#ffffff' },
  pageStyle: 'full_bleed',
  linkLayout: 'standard',
  linkCount: 3,
});
ok('full_bleed + gradient → gradient background, glass buttons, white text');

const stateB = {
  pageStyle: 'hero',
  backgroundType: 'solid',
  backgroundColor: '#f5f5f0',
  gradientStart: '#667eea',
  gradientEnd: '#764ba2',
  buttonShape: 'pill',
  buttonStyle: 'solid_rounded',
  fontChoice: 'modern',
  linkLayout: null,
  linkCount: 3,
};

assert.deepEqual(buildOnboardingTheme(stateB), {
  background: {
    type: 'solid',
    solid_color: '#f5f5f0',
    gradient_css: '',
    image_url: '',
    overlay_color: '#000000',
    overlay_opacity: 0.5,
    source: null,
  },
  buttonStyle: 'solid_rounded',
  typography: { font: 'modern', text_color: '#0e0c09' },
  pageStyle: 'hero',
  linkLayout: null,
  linkCount: 3,
});
ok('hero + a LIGHT solid → no buttons key, and auto-contrast flips the text dark');

assert.equal('buttons' in buildOnboardingTheme(stateB), false);
ok('a hero page writes no theme.buttons at all (not buttons: null)');

// ── HERO.FIT.3: the cropped photo's window ──────────────────────────────────
// A photo cropped in onboarding carries its framed window into the theme, in
// the hero config the editor's Apply Crop writes. The windows are made the way
// the step makes them, through writePictureFit — never spelled out here.
const frame = canonicalHeroAspect();
const avatarWindow = writePictureFit(null, { mode: 'crop', crop: { x: 12.5, y: 20, w: 75, h: 60 }, aspect: frame });
const avatarWindowSource = writePictureFit(null, { mode: 'crop', crop: { x: 30, y: 25, w: 40, h: 33 }, aspect: frame });
assert.ok(avatarWindow && avatarWindowSource, 'control: both windows are storable');

for (const base of [stateA, stateB]) {
  const plain = buildOnboardingTheme(base);

  // No window: byte-identical to the theme with the fields absent, whatever
  // else the photo state holds.
  for (const none of [
    { avatarWindow: null, avatarWindowSource: null },
    { avatarWindow: null, avatarWindowSource: null, avatarOriginalUrl: 'https://fixture.titilinks.test/original.webp' },
    { avatarWindow: null, avatarWindowSource, avatarOriginalUrl: 'https://fixture.titilinks.test/original.webp' },
    { avatarWindow: undefined },
    { avatarWindow: {} },
    { avatarWindow: 'window' },
    { avatarWindow: writePictureFit(null, { mode: 'fit' }) },
    { avatarWindow: writePictureFit(null, { mode: 'cover' }) },
  ]) {
    const themed = buildOnboardingTheme({ ...base, ...none });
    assert.equal(JSON.stringify(themed), JSON.stringify(plain), `${base.pageStyle}: ${JSON.stringify(none)} leaves the theme byte-identical`);
    assert.equal('heroConfig' in themed, false, `${base.pageStyle}: no heroConfig key at all`);
  }

  // A window, the original uploaded: window and windowSource.
  const both = buildOnboardingTheme({
    ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl: 'https://fixture.titilinks.test/original.webp',
  });
  assert.deepEqual(both, {
    ...plain,
    heroConfig: { fit: 'fill', posX: 50, posY: 50, window: avatarWindow, windowSource: avatarWindowSource },
  });

  // A window, no original (it failed to upload, or has not landed yet): the
  // window alone — there is nothing for the cropper to reopen against.
  for (const avatarOriginalUrl of [null, undefined, '']) {
    const alone = buildOnboardingTheme({ ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl });
    assert.deepEqual(alone, { ...plain, heroConfig: { fit: 'fill', posX: 50, posY: 50, window: avatarWindow } });
    assert.equal('windowSource' in alone.heroConfig, false, 'no windowSource key without an uploaded original');
  }

  // An unusable source window is dropped; the painting window still rides.
  const junkSource = buildOnboardingTheme({
    ...base, avatarWindow, avatarWindowSource: { nope: true }, avatarOriginalUrl: 'https://fixture.titilinks.test/original.webp',
  });
  assert.deepEqual(junkSource.heroConfig, { fit: 'fill', posX: 50, posY: 50, window: avatarWindow });

  // What rides is what the hero paints: the stored window resolves for a hero box.
  assert.ok(resolveHeroWindowFraming(both.heroConfig.window, 0.75, frame), `${base.pageStyle}: the stored window paints`);
}
ok('no usable window → the theme is byte-identical to today\'s (8 shapes of "none", both page styles)');
ok('a window + an uploaded original → heroConfig { fill, 50, 50, window, windowSource }');
ok('a window with no uploaded original → heroConfig carries the window alone');

// ── PHOTO.POLISH.2: the Auto enhance baked into the display copy ─────────────
// A photo accepted with the switch on carries the value into the hero config,
// beside the window when it was cropped and alone when it was not. The value is
// written and read the one way it is anywhere (hero-enhance.ts) — the stored
// key is never spelled out here.
const avatarEnhance = { strength: 1, params: sanitizeParams({ gamma: 1.2, shadows: 0.1, vibrance: 0.05, sharpen: 0.2 }) };
assert.ok(readHeroEnhance(writeHeroEnhance(null, avatarEnhance)), 'control: the value is storable');
const ORIGINAL_URL = 'https://fixture.titilinks.test/original.webp';
/** A wizard state holding a cropped, enhanced photo whose original uploaded. */
const croppedEnhanced = (base) => ({ ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl: ORIGINAL_URL, avatarEnhance });

for (const base of [stateA, stateB]) {
  const plain = buildOnboardingTheme(base);
  const windowed = buildOnboardingTheme({ ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl: ORIGINAL_URL });
  const windowConfig = { fit: 'fill', posX: 50, posY: 50, window: avatarWindow, windowSource: avatarWindowSource };
  assert.deepEqual(windowed.heroConfig, windowConfig, 'control: the window-only hero config');

  // Null (or nothing usable): byte-identical to today's theme, with a window and without.
  for (const none of [null, undefined, {}, 'on', [], { strength: 1 }, { strength: 0, params: avatarEnhance.params }, { strength: NaN, params: avatarEnhance.params }]) {
    const themed = buildOnboardingTheme({ ...base, avatarEnhance: none });
    assert.equal(JSON.stringify(themed), JSON.stringify(plain), `${base.pageStyle}: avatarEnhance ${JSON.stringify(none)} leaves the theme byte-identical`);
    assert.equal('heroConfig' in themed, false, `${base.pageStyle}: no heroConfig key at all`);
    const themedWindow = buildOnboardingTheme({ ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl: ORIGINAL_URL, avatarEnhance: none });
    assert.equal(JSON.stringify(themedWindow), JSON.stringify(windowed), `${base.pageStyle}: with a window, avatarEnhance ${JSON.stringify(none)} leaves the theme byte-identical`);
  }

  // Enhanced, not cropped: a hero config holding that one key.
  const alone = buildOnboardingTheme({ ...base, avatarEnhance });
  assert.deepEqual(alone, { ...plain, heroConfig: writeHeroEnhance(null, avatarEnhance) });
  assert.equal(Object.keys(alone.heroConfig).length, 1, `${base.pageStyle}: enhance without a window is the only key`);
  assert.deepEqual(readHeroEnhance(alone.heroConfig), avatarEnhance, 'the value reads back');
  // A leftover source window with no painting window changes nothing about that.
  assert.deepEqual(
    buildOnboardingTheme({ ...base, avatarEnhance, avatarWindow: null, avatarWindowSource, avatarOriginalUrl: ORIGINAL_URL }),
    alone,
  );

  // Enhanced and cropped: the window's config, key for key, plus the value.
  const both = buildOnboardingTheme({ ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl: ORIGINAL_URL, avatarEnhance });
  assert.deepEqual(both, { ...plain, heroConfig: writeHeroEnhance(windowConfig, avatarEnhance) });
  assert.deepEqual(writeHeroEnhance(both.heroConfig, null), windowConfig, 'take the value away and the window config is what is left');
  assert.deepEqual(readHeroEnhance(both.heroConfig), avatarEnhance);
  assert.ok(resolveHeroWindowFraming(both.heroConfig.window, 0.75, frame), `${base.pageStyle}: the window still paints`);
  // …and without an uploaded original: window + value, no windowSource.
  const noOriginal = buildOnboardingTheme({ ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl: null, avatarEnhance });
  assert.deepEqual(noOriginal.heroConfig, writeHeroEnhance({ fit: 'fill', posX: 50, posY: 50, window: avatarWindow }, avatarEnhance));

  // What a path that clears the window clears with it (OnboardingFlow's no-upload update).
  assert.equal(
    JSON.stringify(buildOnboardingTheme({ ...croppedEnhanced(base), avatarWindow: null, avatarWindowSource: null, avatarEnhance: null })),
    JSON.stringify(plain),
  );

  // Plain JSON: the sessionStorage round trip changes nothing.
  const state = { ...base, avatarWindow, avatarWindowSource, avatarOriginalUrl: ORIGINAL_URL, avatarEnhance };
  assert.deepEqual(buildOnboardingTheme(JSON.parse(JSON.stringify(state))), both);
}
ok('avatarEnhance null or unusable → the theme is byte-identical to today\'s, with a window and without (8 shapes, both page styles)');
ok('enhanced, not cropped → heroConfig holds the enhancement alone');
ok('enhanced and cropped → the window config, key for key, plus the enhancement');
ok('avatarEnhance is plain JSON: a sessionStorage round trip changes nothing');

// The window survives the wizard's sessionStorage round trip (JSON) unchanged.
{
  const state = { ...stateB, avatarWindow, avatarWindowSource, avatarOriginalUrl: 'https://fixture.titilinks.test/original.webp' };
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(buildOnboardingTheme(restored), buildOnboardingTheme(state));
  assert.deepEqual(restored.avatarWindow, avatarWindow);
  ok('the window fields are plain JSON: a sessionStorage round trip changes nothing');
}

// ── the in-memory page ──────────────────────────────────────────────────────
const pageState = {
  ...stateA,
  username: '  PreviewPerson  ',
  displayName: 'Preview Person',
  avatarPreview: 'blob:preview',
  avatarOriginalUrl: null,
  selectedPreset: null,
  selectedSocialPlatforms: [],
  buttonSize: 'medium',
};

const previewPage = buildPreviewPage(pageState, 'user-1');
assert.deepEqual(previewPage.theme_json, buildOnboardingTheme(pageState));
ok('the preview page carries exactly the theme step 3 will write');

assert.equal(previewPage.handle, 'previewperson');
ok('the handle is trimmed and lower-cased, as pages.insert does');

assert.equal(previewPage.user_id, 'user-1');
assert.equal(previewPage.display_name, 'Preview Person');
assert.equal(previewPage.avatar_url, 'blob:preview');
ok('name, avatar and owner come straight off the wizard state');

// Placeholders: on step 1 nothing has been typed yet, and without them the
// phone renders a nameless hero and a bare "@".
const placeholders = { name: 'Your Name', handle: 'yourname' };
const emptyPage = buildPreviewPage(
  { ...pageState, displayName: '', username: '' },
  'user-1',
  placeholders,
);
assert.equal(emptyPage.display_name, 'Your Name');
assert.equal(emptyPage.handle, 'yourname');
ok('an empty name / handle falls through to the placeholders');

const typedPage = buildPreviewPage(pageState, 'user-1', placeholders);
assert.equal(typedPage.display_name, 'Preview Person');
assert.equal(typedPage.handle, 'previewperson');
ok('once the user types, the placeholders are ignored');

// ── the in-memory blocks ────────────────────────────────────────────────────
const blockState = { ...pageState, selectedSocialPlatforms: ['instagram'] };
const blocks = buildPreviewBlocks(blockState);

assert.deepEqual(blocks.map((b) => b.type), [
  'social_links',
  'primary_cta',
  'links',
  'product_cards',
  'gallery',
  'video_feed',
  'bio',
  'email_subscribe',
  'social_icon_row',
]);
ok('nine blocks, in the order step 3 inserts them');

assert.deepEqual(blocks.map((b) => b.order_index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
ok('order_index runs 0..8 — social_links first, the preset at i+1, the tail after');

assert.deepEqual(blocks.map((b) => b.items.length), [1, 1, 3, 3, 0, 0, 0, 1, 0]);
ok('item counts match prefillBlockContent exactly');

const social = blocks[0];
assert.deepEqual(
  social.items.map((i) => ({ label: i.label, url: i.url })),
  [{ label: 'instagram', url: '' }],
);
ok("the social row is the user's own picks, with the empty url step 4 writes");

const links = blocks.find((b) => b.type === 'links');
assert.deepEqual(links.items.map((i) => i.size), ['medium', 'medium', 'medium']);
ok('full_bleed carries the onboarding button size onto every link');

const heroLinks = buildPreviewBlocks({ ...blockState, pageStyle: 'hero' })
  .find((b) => b.type === 'links');
assert.deepEqual(heroLinks.items.map((i) => i.size), [null, null, null]);
ok('a hero page sets no size (prefill passes undefined)');

// ── the drift guard ─────────────────────────────────────────────────────────
// Every placeholder string the preview invents must exist in the source of the
// function that really seeds it. The social rows are excluded: they are the
// user's own picks, not seeded content.
const flowSrc = readFileSync(new URL('../src/pages/OnboardingFlow.tsx', import.meta.url), 'utf8');
let checked = 0;
const seen = (value, what) => {
  assert.ok(flowSrc.includes(value), `${what} not found verbatim in OnboardingFlow.tsx: ${value}`);
  checked++;
};

// Titles: the three the preview hard-codes must exist in OnboardingFlow.tsx;
// the preset's six come from BLOCK_PRESETS, which both sides read, so they are
// compared against that array rather than against the source text.
for (const title of ['Social Links', 'Email Subscribe', 'Social Icons']) {
  seen(title, 'hard-coded block title');
}
assert.deepEqual(
  blocks.slice(1, 7).map((b) => ({ type: b.type, title: b.title })),
  BLOCK_PRESETS[0].blocks.map((b) => ({ type: b.type, title: b.title })),
);
ok('the six preset blocks are BLOCK_PRESETS itself, type and title');

for (const block of blocks) {
  if (block.type === 'social_links') continue;
  for (const item of block.items) {
    seen(item.label, `${block.type} label`);
    seen(item.url, `${block.type} url`);
    if (item.subtitle) seen(item.subtitle, `${block.type} subtitle`);
    if (item.badge && block.type !== 'email_subscribe') seen(item.badge, `${block.type} badge`);
  }
}
ok(`every seeded title / label / url / subtitle / badge exists in OnboardingFlow.tsx (${checked} strings)`);

// PHOTO.POLISH.2: the one write site that drops the window (the update with no
// uploaded URL) drops the enhancement with it — both describe one display file.
assert.ok(
  flowSrc.includes('buildOnboardingTheme({ ...state, avatarWindow: null, avatarWindowSource: null, avatarEnhance: null })'),
  'OnboardingFlow clears avatarEnhance wherever it clears the window',
);
assert.equal((flowSrc.match(/avatarWindow: null/g) || []).length, 1, 'control: that is the only place OnboardingFlow clears the window');
ok('OnboardingFlow clears the enhancement with the window');

// The email badge is JSON.stringify'd at the write site, so the SERIALIZED form
// is not in the source — its keys and values are. Check those instead.
const badge = JSON.parse(blocks.find((b) => b.type === 'email_subscribe').items[0].badge);
assert.deepEqual(Object.keys(badge), [
  'title',
  'placeholder',
  'button_label',
  'success_message',
  'redirect_url',
  'collect_name',
  'name_placeholder',
]);
for (const [key, value] of Object.entries(badge)) {
  seen(`${key}:`, 'email badge key');
  if (typeof value === 'string' && value) seen(value, `email badge ${key}`);
}
assert.equal(badge.collect_name, false);
ok('the email_subscribe badge JSON matches the seeded config key for key');

console.log(`\nonb-preview.test.mjs: ${passed} passed`);

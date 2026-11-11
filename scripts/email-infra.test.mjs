// EMAIL.INFRA.1 — unit test for the pure email modules
// (supabase/functions/_shared/email/*).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see handle-rules.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/email-infra.test.mjs`.
//
// What it pins: the two streams never cross (only `news` carries an unsubscribe
// link and the List-Unsubscribe pair; `mail` carries neither), the one-click
// header is byte-exact and HTTPS-only, the GET unsubscribe page is a confirm
// button that claims nothing, nothing is ever sent FROM titilinks.com itself, every
// template_key the migrations seed has copy in both languages, and the Svix
// verifier accepts a real signature and rejects a tampered or stale one.
//
// EMAIL.DRIP.1 adds: every template renders in both languages with and without
// a name (never "null"/"undefined", never a leftover {{token}}); every news
// email carries the unsubscribe URL, the postal address and exactly one button,
// and cannot be built without a real postal address; pro_showcase claims only
// features ENTITLEMENTS gives Pro and not Free; the facts the copy quotes match
// entitlements.ts, pricing.ts and App.tsx; and the SQL destination rule's
// expected values match the sitemap's JS rule.
//
// EMAIL.DRIP.2 adds: the brand palette in layout.ts equals the src/index.css
// tokens it names; the HTML is email-safe (no <style>, no flex/grid, no
// background images, no http: URL, the only <link> is the Google Fonts sheet);
// every <img> carries width, alt and the block style; every template in both
// languages has exactly one content image — non-empty alt, an absolute
// https://www.titilinks.com/email/ src, linked to its button's URL — and the
// file it names is in public/email/ within the caps (PNG 1200 px wide and
// ≤ 250 KB; the editor_tour GIF ≤ 600 KB, looping, under 3 s).

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  FROM,
  LINKS,
  LIST_UNSUBSCRIBE_POST,
  REPLY_TO,
  TEMPLATES,
  buildMessage,
  greetingName,
  renderEmail,
  streamHeaders,
  templateStrings,
  toLang,
  unsubscribeUrl,
} from '../supabase/functions/_shared/email/render.ts';
import {
  BRAND,
  CONTENT_IMAGE_WIDTH,
  IMG_STYLE,
  LOGO_WIDTH,
  POSTAL_ADDRESS_PLACEHOLDER,
  resolvePostalAddress,
} from '../supabase/functions/_shared/email/layout.ts';
import * as FACTS from '../supabase/functions/_shared/email/facts.ts';
import { CONFIRM_FIELD, pickLang, unsubscribePage, UUID_RE } from '../supabase/functions/_shared/email/unsubscribe-page.ts';
import { signSvix, verifySvixSignature } from '../supabase/functions/_shared/email/svix.ts';
import { isContentItem } from '../supabase/functions/sitemap/rules.ts';
import { ENTITLEMENTS } from '../src/lib/entitlements.ts';
import { PRO_PRICE } from '../src/lib/pricing.ts';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const TOKEN = '3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c';
const URL_ = `https://www.titilinks.com/u/${TOKEN}`;
const POSTAL = 'TitiLinks, 123 Test Street, Test City';
const CREATOR = { displayName: 'María Luna', username: 'maria-luna', postalAddress: POSTAL };
const NEWS = { stream: 'news', unsubscribeToken: TOKEN, ...CREATOR };
const LANGS = ['en', 'es'];

const DRIP_SQL = readFileSync('supabase/migrations/20261111120000_email_drip1.sql', 'utf8');
const seededKeys = (sql) => {
  const seed = /insert into public\.email_sequence[^;]*values\s*([^;]*?)\s*on conflict/i.exec(sql)?.[1] ?? '';
  return [...seed.matchAll(/\(\s*'([^']+)'\s*,\s*\d+\s*,\s*'(mail|news)'/g)].map((m) => m[1]);
};

// ── welcome renders in both languages ────────────────────────────────────────
{
  const en = renderEmail({ templateKey: 'welcome', lang: 'en', ...NEWS });
  const es = renderEmail({ templateKey: 'welcome', lang: 'es', ...NEWS });
  assert.equal(en.subject, 'Your TitiLinks page is live');
  assert.equal(es.subject, 'Tu página de TitiLinks ya está lista');
  assert.match(en.html, /<html lang="en">/);
  assert.match(es.html, /<html lang="es">/);
  assert.notEqual(en.html, es.html);
  for (const r of [en, es]) {
    assert.ok(r.html.includes('max-width:600px'), '600px shell');
    assert.ok(r.html.includes(POSTAL), 'postal address in the html footer');
    assert.ok(r.text.includes(POSTAL), 'postal address in the text footer');
    assert.ok(!r.html.includes(POSTAL_ADDRESS_PLACEHOLDER) && !r.text.includes(POSTAL_ADDRESS_PLACEHOLDER), 'the placeholder never renders');
    assert.ok(!/<script|<style/i.test(r.html), 'no scripts, no <style> block');
    assert.ok(r.html.includes('href="https://www.titilinks.com/maria-luna"'), 'the page URL is linked');
    assert.ok(r.text.includes('https://www.titilinks.com/maria-luna'), 'the page URL is in the text part');
  }
  assert.ok(es.html.includes('Cancelar suscripción'));
  assert.ok(en.html.includes('Unsubscribe'));
  ok('welcome renders EN and ES in the 600px shell with the real postal address and the page URL');
}

// ── news carries the unsubscribe URL; mail does not ──────────────────────────
{
  for (const lang of LANGS) {
    const news = renderEmail({ templateKey: 'welcome', lang, ...NEWS });
    const mail = renderEmail({ templateKey: 'welcome', lang, stream: 'mail', unsubscribeToken: TOKEN, ...CREATOR });
    assert.ok(news.html.includes(`href="${URL_}"`), `news/${lang} html links the unsubscribe URL`);
    assert.ok(news.text.includes(URL_), `news/${lang} text carries the unsubscribe URL`);
    assert.ok(!mail.html.includes('/u/'), `mail/${lang} html has no unsubscribe URL`);
    assert.ok(!mail.text.includes('/u/'), `mail/${lang} text has no unsubscribe URL`);
    assert.ok(!/unsubscribe|suscripci/i.test(mail.html), `mail/${lang} has no unsubscribe line`);
    // Transactional mail is never held for the address; it just leaves it out.
    const bare = renderEmail({ templateKey: 'welcome', lang, stream: 'mail', ...CREATOR, postalAddress: null });
    assert.ok(!bare.html.includes('{{') && !bare.text.includes('{{'), `mail/${lang} with no address renders no placeholder`);
  }
  assert.throws(() => renderEmail({ templateKey: 'welcome', lang: 'en', ...NEWS, unsubscribeToken: null }), /unsubscribe token/);
  assert.throws(() => renderEmail({ templateKey: 'nope', lang: 'en', stream: 'mail' }), /unknown template/);
  ok('news layout carries the unsubscribe URL, mail layout does not');
}

// ── headers ──────────────────────────────────────────────────────────────────
{
  assert.equal(LIST_UNSUBSCRIBE_POST, 'List-Unsubscribe=One-Click');
  const news = buildMessage({ templateKey: 'welcome', lang: 'en', ...NEWS, to: 'a@example.com' });
  assert.equal(news.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  // HTTPS only — no mailbox processes inbound unsubscribe mail (EMAIL.INFRA.1a).
  assert.equal(news.headers['List-Unsubscribe'], `<${URL_}>`);
  assert.ok(!news.headers['List-Unsubscribe'].includes('mailto:'), 'no mailto: entry');
  assert.deepEqual(Object.keys(news.headers).sort(), ['List-Unsubscribe', 'List-Unsubscribe-Post']);
  assert.equal(news.from, 'TitiLinks <hola@news.titilinks.com>');
  assert.equal(news.reply_to, 'support@titilinks.com');
  assert.deepEqual(news.to, ['a@example.com']);

  const mail = buildMessage({ templateKey: 'welcome', lang: 'es', stream: 'mail', unsubscribeToken: TOKEN, ...CREATOR, to: 'a@example.com' });
  assert.equal(mail.from, 'TitiLinks <no-reply@mail.titilinks.com>');
  assert.equal(mail.reply_to, 'support@titilinks.com');
  assert.equal(mail.headers, undefined, 'transactional mail carries no List-Unsubscribe');
  assert.deepEqual(streamHeaders('mail', TOKEN), {});

  assert.equal(unsubscribeUrl(TOKEN), URL_);
  ok('List-Unsubscribe / List-Unsubscribe-Post are exact on news and absent on mail');
}

// ── titilinks.com itself never sends ─────────────────────────────────────────
{
  for (const [stream, from] of Object.entries(FROM)) {
    const domain = /<[^@]+@([^>]+)>/.exec(from)?.[1];
    assert.equal(domain, `${stream}.titilinks.com`, `${stream} sends from its own subdomain`);
  }
  assert.equal(REPLY_TO, 'support@titilinks.com');
  ok('each stream sends from its own subdomain; the apex is Reply-To only');
}

// ── every seeded template_key has copy in both languages ─────────────────────
{
  const infra = seededKeys(readFileSync('supabase/migrations/20261104120000_email_infra1.sql', 'utf8'));
  assert.deepEqual(infra, ['welcome'], 'EMAIL.INFRA.1 seeds exactly the welcome row');
  const drip = seededKeys(DRIP_SQL);
  assert.deepEqual(drip, ['welcome', 'editor_tour', 'know_what_works', 'pro_showcase', 'empty_page_nudge'], 'DRIP.1 seeds the five rows in send order');
  assert.deepEqual(Object.keys(TEMPLATES).sort(), [...drip].sort(), 'one registered template per seeded row, no extras');
  for (const key of new Set([...infra, ...drip])) {
    for (const lang of LANGS) {
      assert.ok(TEMPLATES[key]?.[lang]?.subject, `${key}/${lang} has a subject`);
      assert.ok(TEMPLATES[key][lang].button?.label, `${key}/${lang} has a button`);
    }
  }
  // DRIP.1 rows are all written OFF, and the upsert re-asserts OFF.
  const seedRows = [...DRIP_SQL.matchAll(/\(\s*'([a-z_]+)'\s*,\s*\d+\s*,\s*'news'\s*,\s*'([a-z_]+)'\s*,\s*(true|false)\s*\)/g)];
  assert.equal(seedRows.length, 5);
  assert.ok(seedRows.every((m) => m[3] === 'false'), 'every sequence row is inserted enabled = false');
  assert.match(DRIP_SQL, /on conflict \(template_key\) do update[\s\S]*?enabled\s*=\s*false;/, 'the upsert switches an existing row off too');
  assert.equal(toLang('es'), 'es');
  assert.equal(toLang(null), 'en');
  assert.equal(toLang('pt'), 'en');
  ok(`every seeded template_key (${drip.join(', ')}) has EN and ES copy; every row is seeded off`);
}

// ── DRIP.1: every template, both languages, name present and absent ──────────
{
  for (const [key, byLang] of Object.entries(TEMPLATES)) {
    for (const lang of LANGS) {
      const t = byLang[lang];
      // {{name}} lives in the greeting (the first line) and nowhere else.
      templateStrings(t).forEach((s, i) => {
        if (s.includes('{{name}}')) assert.equal(s, t.lines[0], `${key}/${lang}: {{name}} only in the greeting (string ${i})`);
      });
      for (const [label, who] of [
        ['named', CREATOR],
        ['handle only', { ...CREATOR, displayName: null }],
        ['nameless', { ...CREATOR, displayName: '   ', username: null }],
        ['literal null', { ...CREATOR, displayName: 'null', username: null }],
      ]) {
        // A nameless creator still needs a handle for a {{page_url}} email.
        const input = { templateKey: key, lang, stream: 'news', unsubscribeToken: TOKEN, ...who };
        const needsPage = templateStrings(t).some((s) => s.includes('{{page_url}}'));
        if (needsPage && !who.username) input.username = 'maria-luna';
        const r = renderEmail(input);
        for (const part of [r.subject, r.html, r.text]) {
          assert.ok(!/\bnull\b|\bundefined\b/.test(part), `${key}/${lang}/${label}: no "null"/"undefined"`);
          assert.ok(!part.includes('{{') && !part.includes('}}'), `${key}/${lang}/${label}: no leftover token`);
        }
        const expected = greetingName(who.displayName, input.username);
        if (expected) assert.ok(r.text.includes(expected), `${key}/${lang}/${label}: greets "${expected}"`);
        // The greeting with no name at all.
        if (!expected) {
          const greeting = r.text.split('\n')[0];
          assert.equal(greeting, lang === 'en' ? 'Hi,' : '¡Hola!', `${key}/${lang}: bare greeting`);
        }
      }
    }
  }
  assert.equal(greetingName('  María   Luna ', 'x'), 'María Luna');
  assert.equal(greetingName(null, 'maria-luna'), 'maria-luna');
  assert.equal(greetingName('', ''), null);
  assert.equal(greetingName('x'.repeat(90), null)?.length, 60);
  // A display name is creator-controlled: it is escaped, never markup.
  const hostile = renderEmail({ templateKey: 'editor_tour', lang: 'en', ...NEWS, displayName: '<b onclick="x">Eve</b>' });
  assert.ok(hostile.html.includes('&lt;b onclick=&quot;x&quot;&gt;Eve&lt;/b&gt;') && !hostile.html.includes('<b onclick'), 'name is escaped');
  ok('all five templates render EN and ES, named and nameless, with no null/undefined and no leftover token');
}

// ── DRIP.1: every news email: unsubscribe, postal address, one button ────────
{
  for (const key of Object.keys(TEMPLATES)) {
    for (const lang of LANGS) {
      const r = renderEmail({ templateKey: key, lang, ...NEWS });
      assert.ok(r.html.includes(`href="${URL_}"`) && r.text.includes(URL_), `${key}/${lang}: unsubscribe URL in both parts`);
      assert.ok(r.html.includes(POSTAL) && r.text.includes(POSTAL), `${key}/${lang}: postal address in both parts`);
      assert.equal((r.html.match(/data-role="button"/g) ?? []).length, 1, `${key}/${lang}: exactly one button`);
      assert.ok(!/<script|<style/i.test(r.html), `${key}/${lang}: no scripts, no <style> block`);
      const href = TEMPLATES[key][lang].button.href;
      const target = href === 'page_url' ? 'https://www.titilinks.com/maria-luna' : LINKS[href];
      assert.ok(r.html.includes(`data-role="button" href="${target}"`), `${key}/${lang}: the button opens ${target}`);
      assert.ok(r.text.includes(`: ${target}`), `${key}/${lang}: the text part spells the button URL out`);
      // No news email without a real address — blank, unset or placeholder.
      for (const bad of [null, '', '   ', POSTAL_ADDRESS_PLACEHOLDER]) {
        assert.throws(
          () => renderEmail({ templateKey: key, lang, ...NEWS, postalAddress: resolvePostalAddress(bad) }),
          /postal address/,
          `${key}/${lang}: refused with postal address ${JSON.stringify(bad)}`,
        );
      }
    }
    // EN and ES open the same place.
    assert.equal(TEMPLATES[key].en.button.href, TEMPLATES[key].es.button.href, `${key}: same button target in both languages`);
  }
  assert.equal(resolvePostalAddress('  TitiLinks,\n 123  Test St  '), 'TitiLinks, 123 Test St');
  assert.equal(resolvePostalAddress('{{POSTAL_ADDRESS}}'), null);
  assert.equal(resolvePostalAddress('Calle {{x}}'), null);
  assert.equal(resolvePostalAddress(undefined), null);
  // A {{page_url}} email cannot go out without a valid handle.
  assert.throws(() => renderEmail({ templateKey: 'welcome', lang: 'en', ...NEWS, username: null }), /page handle/);
  assert.throws(() => renderEmail({ templateKey: 'welcome', lang: 'en', ...NEWS, username: 'Bad Handle' }), /page handle/);
  // An unknown token throws instead of reaching an inbox.
  TEMPLATES.__probe = { en: { subject: 'x', lines: ['Hi {{name}},', '{{bogus}}'], button: { label: 'x', href: 'editor_url' } } };
  assert.throws(() => renderEmail({ templateKey: '__probe', lang: 'en', ...NEWS }), /unknown token/);
  delete TEMPLATES.__probe;
  ok('every news email carries the unsubscribe URL, the postal address and one button, and refuses a missing address');
}

// ── DRIP.2: the palette is the app's, from src/index.css ─────────────────────
{
  const css = readFileSync('src/index.css', 'utf8');
  const block = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `src/index.css has a ${selector} block`);
    return css.slice(start, css.indexOf('}', start));
  };
  const hex = (scope, token) => {
    const m = new RegExp(`--${token}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(scope);
    assert.ok(m, `--${token} is an HSL token`);
    const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
  };
  const root = block(':root');
  const dark = block('.dark');
  assert.equal(BRAND.gold, hex(root, 'primary'), 'gold = --primary');
  assert.equal(BRAND.nearBlack, hex(dark, 'background'), 'near-black = the dark --background');
  assert.equal(BRAND.canvas, hex(root, 'background'), 'canvas = the light --background');
  assert.equal(BRAND.text, hex(root, 'foreground'), 'body text = --foreground');
  assert.equal(BRAND.muted, hex(root, 'muted-foreground'), 'footer = --muted-foreground');
  assert.equal(BRAND.border, hex(root, 'border'), 'footer rule = --border');
  ok(`the email palette (${Object.values(BRAND).join(' ')}) is the src/index.css tokens`);
}

// ── DRIP.2: email-safe HTML, one content image per email, files within caps ──
{
  const EMAIL_DIR = 'public/email';
  const PNG_MAX = 250 * 1024;
  const GIF_MAX = 600 * 1024;
  const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  /** Width and byte size of a PNG (IHDR), asserting the signature. */
  const pngInfo = (path) => {
    const b = readFileSync(path);
    assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${path} is a PNG`);
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
  };

  /** Width, frame count, total delay (ms) and loop flag of a GIF, by walking its blocks. */
  const gifInfo = (path) => {
    const b = readFileSync(path);
    assert.equal(b.subarray(0, 6).toString('latin1'), 'GIF89a', `${path} is a GIF89a`);
    const width = b.readUInt16LE(6);
    let i = 13 + (b[10] & 0x80 ? 3 * 2 ** ((b[10] & 7) + 1) : 0);
    let frames = 0;
    let delayMs = 0;
    let loops = false;
    const skipSubBlocks = () => { while (b[i] !== 0) i += b[i] + 1; i++; };
    while (i < b.length && b[i] !== 0x3b) {
      if (b[i] === 0x21) {
        const label = b[i + 1];
        if (label === 0xf9) delayMs += b.readUInt16LE(i + 4) * 10;
        if (label === 0xff && b.subarray(i + 3, i + 14).toString('latin1') === 'NETSCAPE2.0') loops = true;
        i += 2;
        skipSubBlocks();
      } else if (b[i] === 0x2c) {
        frames++;
        const packed = b[i + 9];
        i += 10 + (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0) + 1;
        skipSubBlocks();
      } else {
        assert.fail(`${path}: unexpected block 0x${b[i].toString(16)} at ${i}`);
      }
    }
    return { width, frames, delayMs, loops, bytes: b.length };
  };

  const checked = new Map();
  const checkFile = (file) => {
    if (checked.has(file)) return checked.get(file);
    const path = `${EMAIL_DIR}/${file}`;
    assert.ok(existsSync(path), `${path} exists (run node scripts/email-shots.mjs)`);
    let info;
    if (file.endsWith('.png')) {
      info = pngInfo(path);
      assert.ok(info.bytes <= PNG_MAX, `${path} is ${info.bytes} bytes, over ${PNG_MAX}`);
      if (file !== 'logo.png') assert.equal(info.width, CONTENT_IMAGE_WIDTH * 2, `${path} is ${CONTENT_IMAGE_WIDTH * 2} px wide`);
    } else if (file.endsWith('.gif')) {
      info = gifInfo(path);
      assert.ok(info.bytes <= GIF_MAX, `${path} is ${info.bytes} bytes, over ${GIF_MAX}`);
      assert.ok(info.delayMs > 0 && info.delayMs < 3000, `${path} runs ${info.delayMs} ms (under 3 s)`);
      assert.ok(info.frames >= 2 && info.loops, `${path} is a looping animation`);
      assert.ok(info.width >= CONTENT_IMAGE_WIDTH && info.width <= CONTENT_IMAGE_WIDTH * 2, `${path} fills the ${CONTENT_IMAGE_WIDTH} px slot`);
    } else {
      assert.fail(`${file}: only .png and .gif`);
    }
    checked.set(file, info);
    return info;
  };

  const logo = checkFile('logo.png');
  assert.equal(logo.width, LOGO_WIDTH * 2, 'logo.png is rendered at 2x its display width');

  for (const [key, byLang] of Object.entries(TEMPLATES)) {
    const alts = [];
    for (const lang of LANGS) {
      const t = byLang[lang];
      const r = renderEmail({ templateKey: key, lang, ...NEWS });
      const html = r.html;
      const where = `${key}/${lang}`;

      // Email-safe: inline styles only, no layout that needs a stylesheet, https only.
      assert.ok(!/<style\b/i.test(html), `${where}: no <style> block`);
      assert.ok(!/display:\s*(flex|grid)|background-image|url\(/i.test(html), `${where}: no flex, grid or background images`);
      assert.ok(!/\bhttp:/i.test(html), `${where}: no http: URL`);
      const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
      assert.equal(links.length, 1, `${where}: one <link>`);
      assert.match(links[0].href, /^https:\/\/fonts\.googleapis\.com\/css2\?family=DM\+Sans[^"]*family=Playfair\+Display/, `${where}: the <link> is the Google Fonts sheet`);
      assert.ok(html.includes('<meta name="color-scheme" content="light">'), `${where}: color-scheme light`);
      assert.ok(html.includes("font-family:'Playfair Display', Georgia, serif"), `${where}: Playfair headline, Georgia fallback`);
      assert.ok(html.includes("font-family:'DM Sans', Arial, Helvetica, sans-serif"), `${where}: DM Sans body, Arial fallback`);
      assert.ok(html.includes(`background:${BRAND.nearBlack}`) && html.includes(`background:${BRAND.gold}`), `${where}: near-black band, gold button`);

      // Every image: width, alt, the block style.
      const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => ({ tag: m[0], ...attrs(m[0]) }));
      for (const img of imgs) {
        assert.match(img.width ?? '', /^\d+$/, `${where}: <img> has a width`);
        assert.ok(unescape(img.alt ?? '').trim(), `${where}: <img> has alt text`);
        assert.ok((img.style ?? '').startsWith(IMG_STYLE), `${where}: <img> style starts with ${IMG_STYLE}`);
        assert.ok(img.src.startsWith('https://www.titilinks.com/email/'), `${where}: <img> is served from www.titilinks.com/email/`);
      }
      const logos = imgs.filter((img) => img['data-role'] === 'logo');
      assert.equal(logos.length, 1, `${where}: one logo`);
      assert.equal(logos[0].src, 'https://www.titilinks.com/email/logo.png');
      assert.equal(logos[0].width, String(LOGO_WIDTH));

      // Exactly one content image, the template's own file, linked like the button.
      const content = imgs.filter((img) => img['data-role'] === 'content-image');
      assert.equal(content.length, 1, `${where}: exactly one content image`);
      assert.equal(imgs.length, 2, `${where}: no other images`);
      const [img] = content;
      assert.match(t.image.file, new RegExp(`^${key}\\.${lang}\\.(png|gif)$`), `${where}: names its own file`);
      assert.equal(t.image.file.endsWith('.gif'), key === 'editor_tour', `${where}: only editor_tour is animated`);
      assert.equal(img.src, `https://www.titilinks.com/email/${t.image.file}`, `${where}: absolute https src`);
      assert.equal(img.width, String(CONTENT_IMAGE_WIDTH), `${where}: fills the ${CONTENT_IMAGE_WIDTH} px slot`);
      assert.equal(unescape(img.alt), t.image.alt, `${where}: alt is the template's`);
      assert.ok(t.image.alt.trim().length >= 20, `${where}: the alt describes the screen`);
      alts.push(t.image.alt);
      const target = t.button.href === 'page_url' ? 'https://www.titilinks.com/maria-luna' : LINKS[t.button.href];
      assert.ok(html.includes(`<a href="${target}" style="display:block;text-decoration:none;">${img.tag}</a>`), `${where}: the image links to ${target}, like the button`);
      checkFile(t.image.file);
      // The still of every screen ships too (editor_tour's GIF has a PNG beside it).
      checkFile(`${key}.${lang}.png`);
      // Alt text is content, not decoration: escaped, and absent from the text part.
      assert.ok(!r.text.includes(t.image.alt), `${where}: the text part does not repeat the alt`);
    }
    assert.notEqual(alts[0], alts[1], `${key}: EN and ES alt text differ (each in its language)`);
  }
  const sizes = [...checked].map(([f, i]) => `${f} ${(i.bytes / 1024).toFixed(0)} KB`).join(', ');
  ok(`all ${Object.keys(TEMPLATES).length * LANGS.length} emails are email-safe with one linked content image; files within caps (${sizes})`);
}

// ── DRIP.1: pro_showcase claims only what Pro has and Free lacks ─────────────
{
  const proOnly = (key) => {
    assert.ok(key in ENTITLEMENTS.pro, `${key} is a PlanEntitlements key`);
    const free = ENTITLEMENTS.free[key];
    const pro = ENTITLEMENTS.pro[key];
    if (typeof pro === 'boolean') return pro === true && free === false;
    if (typeof pro === 'number') return pro > free;
    return false;
  };
  const en = TEMPLATES.pro_showcase.en;
  const es = TEMPLATES.pro_showcase.es;
  for (const [lang, t] of [['en', en], ['es', es]]) {
    assert.equal(t.bullets, undefined, `pro_showcase/${lang}: its list is features only, no free-form bullets`);
    assert.ok(t.features.length >= 3, `pro_showcase/${lang}: lists the features`);
    for (const f of t.features) {
      assert.ok(proOnly(f.entitlement), `pro_showcase/${lang}: "${f.text}" is backed by ${f.entitlement}, which Pro has and Free lacks`);
    }
    const r = renderEmail({ templateKey: 'pro_showcase', lang, ...NEWS });
    assert.equal((r.html.match(/<li\b/g) ?? []).length, t.features.length, `pro_showcase/${lang}: one list item per feature, nothing else`);
  }
  assert.deepEqual(en.features.map((f) => f.entitlement), es.features.map((f) => f.entitlement), 'EN and ES pitch the same features');
  for (const [key, byLang] of Object.entries(TEMPLATES)) {
    if (key === 'pro_showcase') continue;
    for (const lang of LANGS) assert.equal(byLang[lang].features, undefined, `${key}/${lang}: only pro_showcase pitches features`);
  }
  ok(`pro_showcase lists ${en.features.length} features, each one Pro has and Free lacks in ENTITLEMENTS`);
}

// ── DRIP.1: the facts the copy quotes match the app ──────────────────────────
{
  assert.equal(FACTS.FREE_SHORT_LINKS, ENTITLEMENTS.free.maxShortLinks, 'free short-link limit');
  assert.equal(FACTS.PRO_PRICE_MONTH, PRO_PRICE.month, 'monthly price');
  assert.equal(FACTS.PRO_PRICE_YEAR_MONTHLY, PRO_PRICE.year, 'annual price, per month');
  assert.equal(FACTS.PRO_PRICE_YEAR_TOTAL, `$${12 * Number(PRO_PRICE.year.replace(/^\$/, ''))}`, 'annual total = 12 × the monthly figure');
  const app = readFileSync('src/App.tsx', 'utf8');
  for (const route of [FACTS.EDITOR_PATH, FACTS.ANALYTICS_PATH, FACTS.UPGRADE_PATH]) {
    assert.ok(app.includes(`path="${route}"`), `${route} is a route in src/App.tsx`);
  }
  for (const lang of LANGS) {
    const kww = renderEmail({ templateKey: 'know_what_works', lang, ...NEWS }).text;
    assert.ok(kww.includes(String(ENTITLEMENTS.free.maxShortLinks)), `know_what_works/${lang} quotes the free short-link limit`);
    const pro = renderEmail({ templateKey: 'pro_showcase', lang, ...NEWS }).text;
    for (const price of [PRO_PRICE.month, PRO_PRICE.year, FACTS.PRO_PRICE_YEAR_TOTAL]) {
      assert.ok(pro.includes(price), `pro_showcase/${lang} quotes ${price}`);
    }
  }
  ok('short-link limit, Pro prices and button routes match entitlements.ts, pricing.ts and App.tsx');
}

// ── DRIP.1: the SQL destination rule's expected values = the sitemap's JS ────
{
  const verify = DRIP_SQL.slice(DRIP_SQL.indexOf('email_is_real_destination(c.url) as got'));
  const cases = [...verify.matchAll(/^--\s+\('([^']*)',\s*(true|false)\),?\s*$/gm)].map((m) => [m[1], m[2] === 'true']);
  assert.ok(cases.length >= 20, `the verify block lists the destination cases (${cases.length})`);
  for (const [url, expected] of cases) {
    assert.equal(isContentItem({ url, image_url: null }, 'links'), expected, `JS rule agrees: ${JSON.stringify(url)} → ${expected}`);
  }
  // The gate excludes the same block types the sitemap does.
  assert.match(DRIP_SQL, /not in \('social_links', 'social_icon_row', 'email_subscribe'\)/);
  assert.equal(isContentItem({ url: 'https://instagram.com/x', image_url: null }, 'social_links'), false);
  ok(`the ${cases.length} destination cases in the migration's verify block match supabase/functions/sitemap/rules.ts`);
}

// ── unsubscribe confirmation page ────────────────────────────────────────────
{
  assert.equal(pickLang('es-MX,es;q=0.9,en;q=0.8'), 'es');
  assert.equal(pickLang('es'), 'es');
  assert.equal(pickLang('en-US,es;q=0.9'), 'en');
  assert.equal(pickLang('est'), 'en');
  assert.equal(pickLang(null), 'en');
  // 'confirm' (GET) claims nothing and carries exactly one button that POSTs
  // the confirm field back to the same URL (no action attribute).
  for (const [lang, button, done] of [['en', 'Unsubscribe', "You're unsubscribed"], ['es', 'Cancelar suscripción', 'Suscripción cancelada']]) {
    const confirm = unsubscribePage(lang, 'confirm');
    assert.match(confirm, new RegExp(`<html lang="${lang}">`));
    assert.ok(!confirm.includes(done), `confirm/${lang} does not claim the opt-out happened`);
    assert.equal((confirm.match(/<button\b/g) ?? []).length, 1, `confirm/${lang} has one button`);
    assert.match(confirm, new RegExp(`<button type="submit">${button}</button>`));
    assert.equal((confirm.match(/<form\b/g) ?? []).length, 1, `confirm/${lang} has one form`);
    assert.match(confirm, /<form method="post">/, 'the form POSTs to the current URL');
    assert.match(confirm, new RegExp(`name="${CONFIRM_FIELD}"`));
    assert.match(unsubscribePage(lang, 'done'), new RegExp(`<html lang="${lang}">[\\s\\S]*${done}`));
    assert.ok(!/<form|<button/.test(unsubscribePage(lang, 'done')), `done/${lang} has no form`);
  }
  assert.ok(!unsubscribePage('en', 'done', false).includes("You're unsubscribed"), 'a failed write never claims success');
  assert.ok(!new URLSearchParams(LIST_UNSUBSCRIBE_POST).has(CONFIRM_FIELD), 'the RFC 8058 body is never mistaken for the button');
  assert.ok(UUID_RE.test(TOKEN));
  assert.ok(!UUID_RE.test('not-a-token'));
  ok('unsubscribe GET is a confirm page with one POST button; the done page follows Accept-Language and never claims a failed write');
}

// ── Svix signature ───────────────────────────────────────────────────────────
{
  const secret = `whsec_${Buffer.from('email-infra-1-unit-test-key').toString('base64')}`;
  const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc' } });
  const now = 1_800_000_000;
  const sig = await signSvix(secret, 'msg_1', String(now), body);
  const headers = { id: 'msg_1', timestamp: String(now), signature: `v1,${sig}` };

  assert.deepEqual(await verifySvixSignature(body, headers, secret, now), { ok: true });
  assert.deepEqual(
    await verifySvixSignature(body, { ...headers, signature: `v1,AAAA v1,${sig}` }, secret, now),
    { ok: true },
    'any v1 in a rotation list wins',
  );
  assert.equal((await verifySvixSignature(body + ' ', headers, secret, now)).ok, false, 'tampered body');
  assert.equal((await verifySvixSignature(body, { ...headers, id: 'msg_2' }, secret, now)).ok, false, 'wrong id');
  assert.equal((await verifySvixSignature(body, headers, secret, now + 301)).ok, false, 'stale timestamp');
  assert.equal((await verifySvixSignature(body, headers, '', now)).ok, false, 'unset secret fails closed');
  assert.equal((await verifySvixSignature(body, { ...headers, signature: null }, secret, now)).ok, false, 'no header');
  ok('Svix verifier accepts a real signature, rejects tampered / stale / unsigned');
}

console.log(`\nemail-infra: ${passed} checks passed`);

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
// template_key the migration seeds has copy in both languages, and the Svix
// verifier accepts a real signature and rejects a tampered or stale one.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FROM,
  LIST_UNSUBSCRIBE_POST,
  REPLY_TO,
  TEMPLATES,
  buildMessage,
  renderEmail,
  streamHeaders,
  toLang,
  unsubscribeUrl,
} from '../supabase/functions/_shared/email/render.ts';
import { POSTAL_ADDRESS_PLACEHOLDER } from '../supabase/functions/_shared/email/layout.ts';
import { CONFIRM_FIELD, pickLang, unsubscribePage, UUID_RE } from '../supabase/functions/_shared/email/unsubscribe-page.ts';
import { signSvix, verifySvixSignature } from '../supabase/functions/_shared/email/svix.ts';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const TOKEN = '3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c';
const URL_ = `https://www.titilinks.com/u/${TOKEN}`;

// ── welcome renders in both languages ────────────────────────────────────────
{
  const en = renderEmail({ templateKey: 'welcome', lang: 'en', stream: 'news', unsubscribeToken: TOKEN });
  const es = renderEmail({ templateKey: 'welcome', lang: 'es', stream: 'news', unsubscribeToken: TOKEN });
  assert.equal(en.subject, 'Welcome to TitiLinks');
  assert.equal(es.subject, 'Te damos la bienvenida a TitiLinks');
  assert.match(en.html, /<html lang="en">/);
  assert.match(es.html, /<html lang="es">/);
  assert.notEqual(en.html, es.html);
  for (const r of [en, es]) {
    assert.ok(r.html.includes('max-width:600px'), '600px shell');
    assert.ok(r.html.includes(POSTAL_ADDRESS_PLACEHOLDER), 'postal placeholder in the html footer');
    assert.ok(r.text.includes(POSTAL_ADDRESS_PLACEHOLDER), 'postal placeholder in the text footer');
    assert.ok(!/<img|<script|<link/i.test(r.html), 'plain HTML: no images, scripts or stylesheets');
  }
  assert.ok(es.html.includes('Cancelar suscripción'));
  assert.ok(en.html.includes('Unsubscribe'));
  ok('welcome renders EN and ES in the 600px shell with the postal placeholder');
}

// ── news carries the unsubscribe URL; mail does not ──────────────────────────
{
  for (const lang of ['en', 'es']) {
    const news = renderEmail({ templateKey: 'welcome', lang, stream: 'news', unsubscribeToken: TOKEN });
    const mail = renderEmail({ templateKey: 'welcome', lang, stream: 'mail', unsubscribeToken: TOKEN });
    assert.ok(news.html.includes(`href="${URL_}"`), `news/${lang} html links the unsubscribe URL`);
    assert.ok(news.text.includes(URL_), `news/${lang} text carries the unsubscribe URL`);
    assert.ok(!mail.html.includes('/u/'), `mail/${lang} html has no unsubscribe URL`);
    assert.ok(!mail.text.includes('/u/'), `mail/${lang} text has no unsubscribe URL`);
    assert.ok(!/unsubscribe|suscripci/i.test(mail.html), `mail/${lang} has no unsubscribe line`);
  }
  assert.throws(() => renderEmail({ templateKey: 'welcome', lang: 'en', stream: 'news' }), /unsubscribe token/);
  assert.throws(() => renderEmail({ templateKey: 'nope', lang: 'en', stream: 'mail' }), /unknown template/);
  ok('news layout carries the unsubscribe URL, mail layout does not');
}

// ── headers ──────────────────────────────────────────────────────────────────
{
  assert.equal(LIST_UNSUBSCRIBE_POST, 'List-Unsubscribe=One-Click');
  const news = buildMessage({ templateKey: 'welcome', lang: 'en', stream: 'news', unsubscribeToken: TOKEN, to: 'a@example.com' });
  assert.equal(news.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  // HTTPS only — no mailbox processes inbound unsubscribe mail (EMAIL.INFRA.1a).
  assert.equal(news.headers['List-Unsubscribe'], `<${URL_}>`);
  assert.ok(!news.headers['List-Unsubscribe'].includes('mailto:'), 'no mailto: entry');
  assert.deepEqual(Object.keys(news.headers).sort(), ['List-Unsubscribe', 'List-Unsubscribe-Post']);
  assert.equal(news.from, 'TitiLinks <hola@news.titilinks.com>');
  assert.equal(news.reply_to, 'support@titilinks.com');
  assert.deepEqual(news.to, ['a@example.com']);

  const mail = buildMessage({ templateKey: 'welcome', lang: 'es', stream: 'mail', unsubscribeToken: TOKEN, to: 'a@example.com' });
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
  const sql = readFileSync('supabase/migrations/20261104120000_email_infra1.sql', 'utf8');
  const seed = /insert into public\.email_sequence[^;]*values\s*([^;]*?)\s*on conflict/i.exec(sql)?.[1] ?? '';
  const keys = [...seed.matchAll(/\(\s*'([^']+)'\s*,\s*\d+\s*,\s*'(mail|news)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['welcome'], 'the migration seeds exactly the welcome row');
  for (const key of keys) {
    for (const lang of ['en', 'es']) {
      assert.ok(TEMPLATES[key]?.[lang]?.subject, `${key}/${lang} has a subject`);
      assert.equal(TEMPLATES[key][lang].lines.length, 3, `${key}/${lang} is three lines`);
    }
  }
  assert.equal(toLang('es'), 'es');
  assert.equal(toLang(null), 'en');
  assert.equal(toLang('pt'), 'en');
  ok(`every seeded template_key (${keys.join(', ')}) has EN and ES copy`);
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

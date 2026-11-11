// EMAIL.DRIP.1 — renders all ten onboarding emails (five templates × EN/ES)
// into ONE review file: Claude outputs/EMAIL.DRIP.1-preview.html. English and
// Spanish sit side by side per email, each with its subject line above it and
// its plain-text version folded underneath.
//
// Sample data only. No network, no Supabase, nothing is sent: it calls the same
// pure renderer send-email uses (supabase/functions/_shared/email/render.ts).
// Day and gate per email are read from the DRIP.1 migration, so the preview
// shows the schedule that will actually run.
//
// Run: npx tsx scripts/email-preview.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { renderEmail, TEMPLATES } from '../supabase/functions/_shared/email/render.ts';
import { escapeHtml } from '../supabase/functions/_shared/email/layout.ts';

const OUT_DIR = 'Claude outputs';
const OUT = `${OUT_DIR}/EMAIL.DRIP.1-preview.html`;
const MIGRATION = 'supabase/migrations/20261111120000_email_drip1.sql';

const SAMPLE = {
  displayName: 'María',
  username: 'maria-luna',
  unsubscribeToken: '00000000-0000-4000-8000-000000000000',
  postalAddress: '[postal address — EMAIL_POSTAL_ADDRESS, not set yet]',
};

// ('welcome', 0, 'news', 'always', false), …
const sql = readFileSync(MIGRATION, 'utf8');
const seed = /insert into public\.email_sequence[^;]*?values\s*([\s\S]*?)\s*on conflict/i.exec(sql)?.[1] ?? '';
const rows = [...seed.matchAll(/\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*'(mail|news)'\s*,\s*'([^']+)'/g)].map((m) => ({
  key: m[1],
  day: Number(m[2]),
  stream: m[3],
  gate: m[4],
}));
if (!rows.length) throw new Error(`no email_sequence rows found in ${MIGRATION}`);

const GATE_NOTE = {
  always: 'everyone',
  still_free: 'only if still on the Free plan',
  no_links_yet: 'only if the page still has no real link',
};

const column = (row, lang) => {
  const r = renderEmail({ templateKey: row.key, lang, stream: row.stream, ...SAMPLE });
  return `<div class="col">
  <p class="lang">${lang === 'en' ? 'English' : 'Español'}</p>
  <p class="subject"><span>Subject</span> ${escapeHtml(r.subject)}</p>
  <iframe title="${escapeHtml(`${row.key} ${lang}`)}" srcdoc="${escapeHtml(r.html)}" loading="lazy"
    onload="try{this.style.height='0px';this.style.height=(this.contentDocument.documentElement.scrollHeight+4)+'px'}catch(e){this.style.height=''}"></iframe>
  <details><summary>Plain-text version</summary><pre>${escapeHtml(r.text)}</pre></details>
</div>`;
};

const sections = rows
  .map((row, i) => {
    if (!TEMPLATES[row.key]) throw new Error(`no template for ${row.key}`);
    return `<section>
<h2>${i + 1}. <code>${escapeHtml(row.key)}</code></h2>
<p class="meta">Day ${row.day} · gate <code>${escapeHtml(row.gate)}</code> (${escapeHtml(GATE_NOTE[row.gate] ?? row.gate)}) · from hola@news.titilinks.com, replies to support@titilinks.com</p>
<div class="pair">
${column(row, 'en')}
${column(row, 'es')}
</div>
</section>`;
  })
  .join('\n');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Onboarding email preview</title>
<style>
:root{--bg:#eef0f3;--card:#fff;--ink:#111827;--muted:#4b5563;--line:#d1d5db;}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 64px;background:var(--bg);color:var(--ink);font:15px/1.5 Arial,Helvetica,sans-serif;}
main{max-width:1320px;margin:0 auto;}
h1{font-size:24px;margin:0 0 8px}
.intro{color:var(--muted);margin:0 0 4px;max-width:760px}
section{margin:36px 0 0}
h2{font-size:19px;margin:0 0 4px}
.meta{color:var(--muted);margin:0 0 14px;font-size:14px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:900px){.pair{grid-template-columns:1fr}}
.col{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0}
.lang{margin:0 0 6px;font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.subject{margin:0 0 12px;font-weight:bold;font-size:16px}
.subject span{display:inline-block;margin-right:6px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
iframe{display:block;width:100%;height:900px;border:0;border-radius:6px;background:#f4f4f5}
details{margin-top:10px}
summary{cursor:pointer;color:var(--muted);font-size:13px}
pre{white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Consolas,monospace;background:#f9fafb;border:1px solid var(--line);border-radius:6px;padding:10px;margin:8px 0 0}
code{font:13px ui-monospace,Consolas,monospace}
</style>
</head>
<body>
<main>
<h1>TitiLinks onboarding emails (EMAIL.DRIP.1)</h1>
<p class="intro">Five emails, each in English and Spanish, as a new creator would get them. The sample creator is "${escapeHtml(SAMPLE.displayName)}" at titilinks.com/${escapeHtml(SAMPLE.username)}. With no name on the account the greeting is just "Hi," / "¡Hola!".</p>
<p class="intro">Every email is switched off. Nothing is sent until the sequence is turned on, and nothing goes out without a real postal address in the footer.</p>
${sections}
</main>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, page);
console.log(`email-preview: ${rows.length} emails × 2 languages → ${OUT}`);

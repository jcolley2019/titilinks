// EMAIL.DRIP.2 — real-app screenshots for the five onboarding emails.
//
// One picture per email, in both UI languages, taken from the RUNNING app with
// the battery account's session (tests/.auth/user.json), and wrapped in a
// plain drawn phone frame:
//
//   welcome           the finished public page
//   editor_tour       the editor, "Edit Profile" ringed + a tap dot
//                     (+ a short looping GIF: tap → the Add Content panel)
//   know_what_works   the Analytics screen
//   pro_showcase      the upgrade screen, /dashboard/upgrade
//   empty_page_nudge  the link editor's new-link form
//
// Out: public/email/<template_key>.<lang>.png (1200 px wide, a 600 px slot),
//      public/email/editor_tour.<lang>.gif, public/email/logo.png (the email
//      header's wordmark, 2x).
//
// READ-ONLY. Navigation and clicks that open panels; nothing is typed, nothing
// is saved. Every mutating request to any host other than the dev server is
// aborted (the same default-deny tests/fixtures.ts installs), track_event is
// answered locally, and set_my_language is refused so the language switch
// writes nothing. The script refuses any session that is not the battery
// account — never the FREE account, the onb account or a +zero address.
//
// The battery page is test data (its handle, sample links, blank product
// thumbnails). The shots replace it on the wire with one of the landing page's
// example creators, "Valentina Cruz" (EXAMPLES key 'actriz' in
// src/components/PhoneMockup.tsx: her photo, name, links, link icons, social
// row and gold-framed glass buttons, on a full-bleed page), and the Free plan,
// which is what a new creator sees. The same creator is in every shot, and the
// email preview greets her by name. Response interception only: the account's
// rows are never touched.
//
// EMAIL.DRIP.2a: replaces the earlier invented "María Luna" and her drawn hero.
//
// Needs: the dev server on 8085 (reused, never started here), a fresh battery
// session, and ffmpeg on PATH (quantising the PNGs, encoding the GIF).
//   npx playwright test --project=setup     # mints tests/.auth/user.json
//   node scripts/email-shots.mjs

import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:8085';
const AUTH_FILE = 'tests/.auth/user.json';
const OUT_DIR = 'public/email';
const LANGS = ['en', 'es'];

// The battery account (tests/helpers/auth.ts: PINNED_TEST_USER_ID, TEST_HANDLE).
const BATTERY_ID = 'd3f1cfce-d15a-4f4a-ba5c-908e3e959e58';
const BATTERY_HANDLE = 'joey2019pwtestbattery';

// Brand tokens, src/index.css (HSL → hex): --primary 43 65% 55%, the dark
// --background 30 15% 6%.
const GOLD = '#d7ad42';
const NEAR_BLACK = '#120f0d';

// Size caps the unit test enforces (scripts/email-infra.test.mjs).
const PNG_WIDTH = 1200;
const PNG_MAX_BYTES = 250 * 1024;
const GIF_MAX_BYTES = 600 * 1024;
const GIF_MAX_MS = 3000;

// The phone the shots are taken on, and the frame they are drawn in.
const VIEWPORT = { width: 390, height: 844 };
const DSF = 2;
const CANVAS = { width: 600, height: 520 }; // CSS px; rendered at 2x → 1200 × 1040
const SCREEN_W = 290; // the screen's width inside the frame, CSS px
const BEZEL = 8;
const PHONE_TOP = 28;
const FADE_H = 56; // the white fade the phone runs off into, CSS px
/** The lowest viewport y (CSS px) that still reads clearly above the frame's fade. */
const CLEAR_BOTTOM_Y = Math.floor(((CANVAS.height - FADE_H - PHONE_TOP - BEZEL - 10) * VIEWPORT.width) / SCREEN_W);

const t0 = Date.now();
const log = (msg) => console.log(`[email-shots ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`);
const fail = (msg) => {
  console.error(`[email-shots] ${msg}`);
  process.exit(1);
};

// ── preflight ────────────────────────────────────────────────────────────────

async function preflight() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    fail(`no dev server answering on ${BASE} (${e.message}). Start one with \`npm run dev\` — or reuse the one already running — then re-run.`);
  }
  log(`dev server on ${BASE} answers — reusing it`);

  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    fail('ffmpeg is not on PATH; it quantises the PNGs and encodes the GIF.');
  }

  let state;
  try {
    state = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    fail(`${AUTH_FILE} is missing. Mint it with \`npx playwright test --project=setup\`.`);
  }
  let session = null;
  for (const origin of state.origins ?? []) {
    for (const { name, value } of origin.localStorage ?? []) {
      if (/^sb-.*-auth-token$/.test(name)) session = JSON.parse(value);
    }
  }
  const id = session?.user?.id ?? '';
  const email = String(session?.user?.email ?? '');
  if (id !== BATTERY_ID || email.includes('+zero')) {
    fail(`${AUTH_FILE} is not the battery account (got ${id || 'no session'}). The shots only ever run as the battery.`);
  }
  // Two contexts share this session; a refresh in one would rotate the token
  // under the other. Refuse a session that could expire mid-run.
  const minutesLeft = ((session.expires_at ?? 0) * 1000 - Date.now()) / 60000;
  if (minutesLeft < 15) {
    fail(`the battery session expires in ${Math.max(0, Math.floor(minutesLeft))} min. Re-mint it with \`npx playwright test --project=setup\`.`);
  }
  log(`session: battery account (${id.slice(0, 8)}…), ${Math.floor(minutesLeft)} min left`);
}

// ── the example creator ──────────────────────────────────────────────────────
//
// Valentina Cruz, the landing page's 'actriz' example (src/components/
// PhoneMockup.tsx, EXAMPLES): a full-bleed page, her photo edge to edge, four
// links with leading icons, the example social row, gold-framed glass buttons.
// Her example handle is "@valentina.cruz"; a TitiLinks handle cannot hold a
// dot (HANDLE_PATTERN, src/lib/handle-rules.ts), so the page lives at
// /valentina-cruz. The example has no bio, so the page shows none.

const FIXTURE_HOST = 'https://fixture.titilinks.test';
const HERO_FILE = 'src/assets/demo-actress.webp';
const HERO_URL = `${FIXTURE_HOST}/email/valentina-cruz.webp`;
const iconUrl = (name) => `${FIXTURE_HOST}/email/icon-${name}.png`;

const CREATOR = { handle: 'valentina-cruz', displayName: 'Valentina Cruz' };

// The example's four links, its own EN/ES labels, each with its own icon.
// `button` is the app's centred single-line link (the example has no subtitles).
const FIXTURE_LINKS = {
  en: [
    { label: 'Latest film', icon: 'film', url: `${FIXTURE_HOST}/latest-film` },
    { label: 'Fragrance line', icon: 'sparkles', url: `${FIXTURE_HOST}/fragrance` },
    { label: 'Press & events', icon: 'calendar', url: `${FIXTURE_HOST}/press` },
    { label: 'Premiere tickets', icon: 'ticket', url: `${FIXTURE_HOST}/premiere` },
  ],
  es: [
    { label: 'Última película', icon: 'film', url: `${FIXTURE_HOST}/latest-film` },
    { label: 'Línea de fragancias', icon: 'sparkles', url: `${FIXTURE_HOST}/fragrance` },
    { label: 'Prensa y eventos', icon: 'calendar', url: `${FIXTURE_HOST}/press` },
    { label: 'Entradas del estreno', icon: 'ticket', url: `${FIXTURE_HOST}/premiere` },
  ],
};

/** The example's lucide icons (Film, Sparkles, Calendar, Ticket), drawn in her gold. */
const LINK_ICONS = { film: 'Film', sparkles: 'Sparkles', calendar: 'Calendar', ticket: 'Ticket' };
const EXAMPLE_GOLD = '#C9A55C';

// The example's social row: Instagram, YouTube, a music service, a website.
// PlatformIcon reads the label; the URLs point nowhere real.
const FIXTURE_SOCIALS = [
  { label: 'Instagram', url: `${FIXTURE_HOST}/instagram` },
  { label: 'YouTube', url: `${FIXTURE_HOST}/youtube` },
  { label: 'Spotify', url: `${FIXTURE_HOST}/spotify` },
  { label: 'Website', url: `${FIXTURE_HOST}/website` },
];

// The example's theme, through the app's own full-bleed settings: the 'actriz'
// preset's near-black base and serif type (src/lib/tpl-presets.ts), and the
// example's buttons, a white glass pill with a gold hairline and white titles.
// Glass, not 'filled': index.css paints link titles light, so a gold-FILLED
// button would read light-on-gold. Every one of these is a Free-plan setting.
const FIXTURE_THEME = {
  background: {
    type: 'solid',
    solid_color: '#0a0a0a',
    gradient_css: '',
    image_url: '',
    overlay_color: '#000000',
    overlay_opacity: 0,
    source: null,
  },
  buttons: {
    shape: 'pill',
    fill_color: '#ffffff',
    text_color: '#ffffff',
    border_enabled: true,
    border_color: EXAMPLE_GOLD,
    shadow_enabled: false,
    density: 'normal',
    variant: 'glass',
  },
  typography: { font: 'serif', text_color: '#ffffff' },
  pageStyle: 'full_bleed',
  heroConfig: { fit: 'fill', posX: 50, posY: 25 },
};

/** Blocks the public shot keeps; the rest are test placeholders (blank product and photo tiles, the bio). */
const PUBLIC_BLOCKS = new Set(['social_links', 'social_icon_row', 'links']);

/** A stable, obviously-synthetic id for a fixture row the battery has no row for. */
const fixtureId = (n) => `00000000-0000-4000-8000-0000000e${String(n).padStart(4, '0')}`;

/** A seeded PRNG so every run draws the same fictional numbers. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 30 days of fictional page views and link clicks for the Analytics shot. */
function fixtureEvents(pageId, linkItems) {
  const rand = seeded(20261111);
  const now = Date.now();
  const day = 86_400_000;
  const referrers = ['www.instagram.com', 'www.instagram.com', 'www.tiktok.com', 'www.tiktok.com', 'm.youtube.com', ''];
  const rows = [];
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  for (let d = 0; d < 30; d++) {
    const views = 14 + Math.floor(rand() * 16) + (d < 7 ? 8 : 0);
    for (let i = 0; i < views; i++) {
      const at = new Date(now - (d + 0.1 + rand() * 0.8) * day).toISOString();
      rows.push({
        id: uuid(),
        page_id: pageId,
        mode: 'page1',
        event_type: 'page_view',
        metadata_json: { referrer_domain: referrers[Math.floor(rand() * referrers.length)] },
        created_at: at,
      });
      if (rand() < 0.36 && linkItems.length) {
        const item = linkItems[Math.floor(rand() * linkItems.length)];
        rows.push({
          id: uuid(),
          page_id: pageId,
          mode: 'page1',
          event_type: 'outbound_click',
          metadata_json: {
            item_id: item.id,
            block_id: item.block_id,
            full_url: item.url,
            block_type: 'links',
            destination_domain: new URL(item.url).hostname,
          },
          created_at: at,
        });
      }
    }
  }
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// ── the write guard + the fixture, on the wire ───────────────────────────────

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SUPABASE = /^https:\/\/[^/]+\.supabase\.co\//;
// The app's read RPCs are POSTs (tests/fixtures.ts, TL.ISO.2).
const READ_RPC = /^rest\/v1\/rpc\/(get_public_[a-z0-9_]+|resolve_short_link_by_slug)$/;

async function installRoutes(context, lang, assets, denied) {
  const blockTypes = new Map(); // block id → type, learned from the blocks reads
  const linkItems = []; // the fixture's link rows, for the click events
  let pageId = null;

  // Default-deny for every host but the dev server: no request may change anything.
  await context.route(
    (url) => !url.href.startsWith(BASE),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.href.startsWith(FIXTURE_HOST)) {
        const asset = assets.get(url.pathname);
        if (asset) return route.fulfill({ status: 200, contentType: asset.type, body: asset.body });
        return route.fulfill({ status: 404, body: '' });
      }
      const path = url.pathname.replace(/^\/+/, '');
      if (MUTATING.has(req.method())) {
        if (path === 'rest/v1/rpc/track_event') return route.fulfill({ status: 204, body: '' });
        const allowed =
          SUPABASE.test(req.url()) &&
          req.method() === 'POST' &&
          (path.startsWith('auth/v1/token') || READ_RPC.test(path));
        if (!allowed) {
          // set_my_language is expected (the UI-language switch); anything else is reported.
          if (path !== 'rest/v1/rpc/set_my_language') denied.push(`${req.method()} ${url.origin}/${path}`);
          return route.abort('accessdenied');
        }
      }
      if (!SUPABASE.test(req.url()) || !path.startsWith('rest/v1/')) return route.fallback();

      // A read. Swap the battery's test content for the fictional creator.
      const response = await route.fetch();
      const type = response.headers()['content-type'] ?? '';
      if (req.method() !== 'GET' && req.method() !== 'POST') return route.fulfill({ response });
      const text = response.ok() && type.includes('json') ? await response.text() : '';
      if (!text) return route.fulfill({ response });
      let data = JSON.parse(text);
      const table = path.slice('rest/v1/'.length);
      const query = url.searchParams;
      const rows = () => (Array.isArray(data) ? data : [data]);

      if (table === 'pages' || table === 'pages_public') {
        for (const row of rows()) {
          if (!row || row.user_id !== undefined && row.user_id !== BATTERY_ID) continue;
          pageId = row.id ?? pageId;
          if ('handle' in row) row.handle = CREATOR.handle;
          if ('display_name' in row) row.display_name = CREATOR.displayName;
          if ('bio' in row) row.bio = null;
          if ('avatar_url' in row) row.avatar_url = HERO_URL;
          if ('avatar_original_url' in row) row.avatar_original_url = HERO_URL;
          if (row.theme_json && typeof row.theme_json === 'object') {
            const pages = row.theme_json.pages ?? {};
            row.theme_json = {
              ...row.theme_json,
              ...FIXTURE_THEME,
              // Page 1's own style wins over the profile default (PAGES.STYLE.1).
              pages: { ...pages, page1: { ...(pages.page1 ?? {}), style: 'full_bleed' } },
            };
          }
        }
      } else if (table === 'blocks') {
        for (const row of rows()) {
          if (row?.id && row.type) blockTypes.set(row.id, row.type);
          // Drop any style a spec left in the links block's JSON-in-title, so the
          // page theme above is the only button style.
          if (row?.type === 'links' && 'title' in row) row.title = 'Links';
        }
        if (query.get('is_enabled') === 'eq.true' && Array.isArray(data)) {
          data = data.filter((row) => PUBLIC_BLOCKS.has(row.type));
        }
      } else if (table === 'block_items' && Array.isArray(data)) {
        const out = [];
        const byBlock = new Map();
        for (const row of data) {
          const list = byBlock.get(row.block_id) ?? [];
          list.push(row);
          byBlock.set(row.block_id, list);
        }
        // The example has more links and socials than the battery seeds rows
        // for; extra rows copy the last real one under a synthetic id.
        let extra = 0;
        const fill = (items, fixtures, toRow) =>
          fixtures.map((f, i) => {
            const base = items[i] ?? { ...items.at(-1), id: fixtureId(++extra), block_id: items[0].block_id };
            return { ...base, ...toRow(f), order_index: i };
          });
        for (const [blockId, items] of byBlock) {
          const kind = blockTypes.get(blockId);
          items.sort((a, b) => a.order_index - b.order_index);
          if (kind === 'links') {
            const links = fill(items, FIXTURE_LINKS[lang], (f) => ({
              label: f.label,
              url: f.url,
              subtitle: null,
              image_url: null,
              badge: null,
              size: 'button',
              bg_color: null,
              title_color: null,
              is_adult: false,
              style_json: { icon_image: iconUrl(f.icon) },
            }));
            linkItems.push(...links);
            out.push(...links);
          } else if (kind === 'social_links') {
            out.push(...fill(items, FIXTURE_SOCIALS, (f) => ({ label: f.label, url: f.url })));
          } else if (kind === 'social_icon_row') {
            // The example has one social row; social_links carries all of it.
          } else if (kind === 'bio') {
            // The example has no bio; blank the battery's test sentence.
            out.push({ ...items[0], label: '', subtitle: null });
          } else {
            out.push(...items);
          }
        }
        data = out;
      } else if (table === 'events' && Array.isArray(data)) {
        data = fixtureEvents(pageId ?? query.get('page_id')?.replace(/^eq\./, ''), linkItems);
      } else if (table === 'profiles') {
        for (const row of rows()) if (row && 'plan' in row) row.plan = 'free';
      } else if (table === 'rpc/get_public_page_plan') {
        data = 'free';
      }
      return route.fulfill({ response, json: data });
    },
  );
}

// ── drawing: the link icons, the wordmark, the phone frame ───────────────────

/** One of the example's lucide link icons as SVG markup, in her gold (the icon the landing mockup draws). */
async function linkIconSvg(name) {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const icons = await import('lucide-react');
  return renderToStaticMarkup(createElement(icons[LINK_ICONS[name]], { size: 96, color: EXAMPLE_GOLD, strokeWidth: 2 }));
}

/** The app's wordmark (src/components/landing/Navbar.tsx, the dark-surface version): "Titi" DM Sans bold, "Links" Playfair Display italic, gold. */
function wordmarkHtml() {
  const font = (pkg, file) => readFileSync(`node_modules/@fontsource-variable/${pkg}/files/${file}`).toString('base64');
  return `<!doctype html><html><head><style>
@font-face{font-family:'DM Sans';src:url(data:font/woff2;base64,${font('dm-sans', 'dm-sans-latin-wght-normal.woff2')}) format('woff2');font-weight:100 1000;}
@font-face{font-family:'Playfair Display';font-style:italic;src:url(data:font/woff2;base64,${font('playfair-display', 'playfair-display-latin-wght-italic.woff2')}) format('woff2');font-weight:400 900;}
html,body{margin:0;background:${NEAR_BLACK};}
#mark{display:inline-block;padding:2px 3px 4px 1px;font-size:26px;line-height:32px;font-weight:700;white-space:nowrap;background:${NEAR_BLACK};}
#mark .titi{font-family:'DM Sans',sans-serif;color:#ffffff;}
#mark .links{font-family:'Playfair Display',serif;font-style:italic;color:${GOLD};}
</style></head><body><span id="mark"><span class="titi">Titi</span><span class="links">Links</span></span></body></html>`;
}

/** One screen in the plain phone frame, on white; the phone runs off the bottom and fades into the page. */
function frameHtml(screenPngBase64) {
  const screenH = Math.round((SCREEN_W * VIEWPORT.height) / VIEWPORT.width);
  return `<!doctype html><html><head><style>
html,body{margin:0;background:#ffffff;}
#canvas{position:relative;width:${CANVAS.width}px;height:${CANVAS.height}px;overflow:hidden;background:#ffffff;}
#phone{position:absolute;left:50%;top:${PHONE_TOP}px;transform:translateX(-50%);padding:${BEZEL}px;border-radius:${38 + BEZEL}px;background:${NEAR_BLACK};
  box-shadow:0 22px 44px rgba(18,15,13,.16),0 3px 10px rgba(18,15,13,.10);}
#phone img{display:block;width:${SCREEN_W}px;height:${screenH}px;border-radius:38px;}
#fade{position:absolute;left:0;right:0;bottom:0;height:${FADE_H}px;background:linear-gradient(rgba(255,255,255,0),#ffffff 90%);}
</style></head><body><div id="canvas"><div id="phone"><img src="data:image/png;base64,${screenPngBase64}" alt=""></div><div id="fade"></div></div></body></html>`;
}

// ── image post-processing (ffmpeg) ───────────────────────────────────────────

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
}

/** Quantise a PNG to a 256-colour palette; fewer colours if it is still over the cap. */
function quantisePng(srcPath, outPath) {
  for (const colors of [256, 192, 128, 96]) {
    ffmpeg([
      '-i', srcPath,
      '-vf', `split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a`,
      '-frames:v', '1', outPath,
    ]);
    const bytes = statSync(outPath).size;
    if (bytes <= PNG_MAX_BYTES) return { bytes, colors };
  }
  throw new Error(`${outPath} is still over ${PNG_MAX_BYTES} bytes at 96 colours`);
}

/** Encode framed GIF frames (each with its own hold time) into one looping GIF under the cap. */
function encodeGif(frames, outPath, workDir) {
  const list = frames.map((f) => `file '${f.path.replace(/\\/g, '/')}'\nduration ${(f.ms / 1000).toFixed(3)}`).join('\n');
  // The concat demuxer needs the last file repeated for its duration to count.
  const listPath = join(workDir, 'frames.txt');
  writeFileSync(listPath, `${list}\nfile '${frames.at(-1).path.replace(/\\/g, '/')}'\n`);
  for (const width of [PNG_WIDTH, 900, 600]) {
    ffmpeg([
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop', '0', outPath,
    ]);
    const bytes = statSync(outPath).size;
    if (bytes <= GIF_MAX_BYTES) return { bytes, width };
    log(`  ${outPath} is ${(bytes / 1024).toFixed(0)} KB at ${width} px — trying narrower`);
  }
  throw new Error(`${outPath} is still over ${GIF_MAX_BYTES} bytes at 600 px`);
}

// ── in-page helpers ──────────────────────────────────────────────────────────

/** Wait for the network to settle, fonts to load and images to decode. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // On-screen images only (a lazy image below the fold never loads), capped.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const onScreen = [...document.images].filter((img) => {
      const r = img.getBoundingClientRect();
      return !img.complete && r.bottom > 0 && r.top < innerHeight && r.width > 0;
    });
    const loaded = Promise.all(onScreen.map((img) => new Promise((r) => { img.onload = img.onerror = r; })));
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 5000))]);
  });
  await page.waitForTimeout(600);
}

/** The gold ring and tap dot over a button, drawn in-page (editor_tour). */
async function drawHighlight(locator, pressed) {
  await locator.evaluate(
    (el, { gold, pressed }) => {
      document.getElementById('email-shot-highlight')?.remove();
      const r = el.getBoundingClientRect();
      const wrap = document.createElement('div');
      wrap.id = 'email-shot-highlight';
      wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      const ring = document.createElement('div');
      const pad = 5;
      ring.style.cssText = `position:absolute;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:3px solid ${gold};border-radius:999px;box-sizing:border-box;box-shadow:0 0 0 4px rgba(215,173,66,.22);`;
      const size = pressed ? 20 : 26;
      const dot = document.createElement('div');
      dot.style.cssText = `position:absolute;left:${r.right - 14 - size / 2}px;top:${r.bottom + 2 - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:rgba(255,255,255,${pressed ? 0.75 : 0.55});border:2px solid rgba(18,15,13,.55);box-shadow:0 2px 8px rgba(18,15,13,.35);box-sizing:border-box;`;
      wrap.append(ring, dot);
      document.body.append(wrap);
    },
    { gold: GOLD, pressed },
  );
}

const clearHighlight = (page) => page.evaluate(() => document.getElementById('email-shot-highlight')?.remove());

// ── main ─────────────────────────────────────────────────────────────────────

await preflight();
mkdirSync(OUT_DIR, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'email-shots-'));
const browser = await chromium.launch();
const written = [];
const deniedAll = [];

try {
  // A drawing context: no session, no network.
  const draw = await browser.newContext({ viewport: { width: CANVAS.width, height: CANVAS.height }, deviceScaleFactor: DSF });
  await draw.route(() => true, (route) => route.abort());
  const drawPage = await draw.newPage();

  // The example creator's photo and link icons, served on the fixture host.
  const assets = new Map([[new URL(HERO_URL).pathname, { type: 'image/webp', body: readFileSync(HERO_FILE) }]]);
  log(`example creator: ${CREATOR.displayName} (/${CREATOR.handle}), photo ${HERO_FILE}`);
  log('drawing her link icons (Film, Sparkles, Calendar, Ticket)');
  await drawPage.setViewportSize({ width: 200, height: 200 });
  for (const name of Object.keys(LINK_ICONS)) {
    await drawPage.setContent(`<html><body style="margin:0;background:transparent">${await linkIconSvg(name)}</body></html>`);
    const png = await drawPage.locator('svg').screenshot({ omitBackground: true });
    assets.set(new URL(iconUrl(name)).pathname, { type: 'image/png', body: png });
  }

  log('rendering the wordmark → public/email/logo.png');
  await drawPage.setContent(wordmarkHtml());
  await drawPage.evaluate(() => document.fonts.ready);
  const logoRaw = join(work, 'logo.raw.png');
  await drawPage.locator('#mark').screenshot({ path: logoRaw });
  const logoOut = join(OUT_DIR, 'logo.png');
  const logo = quantisePng(logoRaw, logoOut);
  written.push({ path: logoOut, bytes: logo.bytes });

  const frameShot = async (screenPng, outPath) => {
    await drawPage.setViewportSize(CANVAS);
    await drawPage.setContent(frameHtml(screenPng.toString('base64')));
    await drawPage.locator('#phone img').evaluate((img) => img.decode());
    await drawPage.locator('#canvas').screenshot({ path: outPath });
  };

  const finishPng = async (screenPng, name) => {
    const raw = join(work, `${name}.raw.png`);
    await frameShot(screenPng, raw);
    const out = join(OUT_DIR, `${name}.png`);
    const { bytes, colors } = quantisePng(raw, out);
    written.push({ path: out, bytes });
    log(`  wrote ${out} (${(bytes / 1024).toFixed(0)} KB, ${colors} colours)`);
  };

  for (const lang of LANGS) {
    log(`── ${lang.toUpperCase()} ──`);
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DSF,
      isMobile: true,
      hasTouch: true,
      locale: lang === 'es' ? 'es-MX' : 'en-US',
      storageState: AUTH_FILE,
    });
    await context.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);
    const denied = [];
    await installRoutes(context, lang, assets, denied);
    const page = await context.newPage();
    const editProfile = page.getByRole('button', { name: lang === 'es' ? 'Editar perfil' : 'Edit Profile', exact: true });
    // The editor's own header button (DashboardLayout), not the stage chrome copy.
    const headerEditProfile = page.locator('header').first().locator('button', { has: page.getByText(lang === 'es' ? 'Editar perfil' : 'Edit Profile', { exact: true }) });

    // welcome — the finished public page.
    log('welcome: the public page');
    await page.goto(`${BASE}/${BATTERY_HANDLE}`);
    await page.getByText(CREATOR.displayName).filter({ visible: true }).first().waitFor();
    await settle(page);
    // All four of her links, as on the landing mockup: scroll just far enough
    // that the last one clears the frame's fade. The full-bleed photo is fixed,
    // so it stays where it is.
    const scrolled = await page
      .getByText(FIXTURE_LINKS[lang].at(-1).label, { exact: true })
      .filter({ visible: true })
      .first()
      .evaluate((el, limit) => {
        const bottom = (el.closest('a') ?? el).getBoundingClientRect().bottom;
        if (bottom > limit) window.scrollBy(0, Math.ceil(bottom - limit));
        return Math.round(window.scrollY);
      }, CLEAR_BOTTOM_Y);
    log(`  scrolled ${scrolled} px so all ${FIXTURE_LINKS[lang].length} links show`);
    await settle(page);
    await finishPng(await page.screenshot(), `welcome.${lang}`);

    // know_what_works — Analytics.
    log('know_what_works: Analytics');
    await page.goto(`${BASE}/dashboard/analytics`);
    await page.getByTestId('analytics-content').waitFor();
    await settle(page);
    await finishPng(await page.screenshot(), `know_what_works.${lang}`);

    // pro_showcase — the upgrade screen.
    log('pro_showcase: /dashboard/upgrade');
    await page.goto(`${BASE}/dashboard/upgrade`);
    await page.getByRole('heading').first().waitFor();
    await settle(page);
    await finishPng(await page.screenshot(), `pro_showcase.${lang}`);

    // editor_tour — the editor with Edit Profile ringed, then the GIF.
    log('editor_tour: the editor');
    await page.clock.install();
    await page.goto(`${BASE}/dashboard/editor`);
    const button = (await headerEditProfile.count()) ? headerEditProfile.first() : editProfile.first();
    await button.waitFor();
    await page.getByText(FIXTURE_LINKS[lang][0].label, { exact: true }).filter({ visible: true }).first().waitFor();
    await settle(page);
    await drawHighlight(button, false);
    const still = await page.screenshot();
    await finishPng(still, `editor_tour.${lang}`);

    log('editor_tour: GIF frames (tap → Add Content panel)');
    const gifFrames = [];
    const addFrame = async (png, ms) => {
      const p = join(work, `gif-${lang}-${String(gifFrames.length).padStart(2, '0')}.png`);
      await frameShot(png, p);
      gifFrames.push({ path: p, ms });
    };
    await addFrame(still, 1000);
    await drawHighlight(button, true);
    await addFrame(await page.screenshot(), 160);
    // Freeze the page clock, tap, then step the panel's slide-in frame by frame.
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 20);
    await clearHighlight(page);
    await button.evaluate((el) => el.click());
    for (let i = 0; i < 6; i++) {
      await page.clock.runFor(50);
      await addFrame(await page.screenshot(), 50);
    }
    await page.clock.runFor(800);
    await page.clock.resume();
    await settle(page);
    await addFrame(await page.screenshot(), 1300);
    const gifMs = gifFrames.reduce((sum, f) => sum + f.ms, 0);
    if (gifMs > GIF_MAX_MS) throw new Error(`the GIF runs ${gifMs} ms, over ${GIF_MAX_MS}`);
    const gifOut = join(OUT_DIR, `editor_tour.${lang}.gif`);
    const gif = encodeGif(gifFrames, gifOut, work);
    written.push({ path: gifOut, bytes: gif.bytes });
    log(`  wrote ${gifOut} (${(gif.bytes / 1024).toFixed(0)} KB, ${gif.width} px, ${gifFrames.length} frames, ${gifMs} ms)`);

    // empty_page_nudge — from the open panel, My Links → Featured Links "Add
    // link" opens the new-link form. Nothing is typed; Add is never pressed.
    log('empty_page_nudge: the new-link form');
    await page
      .getByText(lang === 'es' ? 'Agregar enlace' : 'Add link', { exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page.getByPlaceholder('https://...').filter({ visible: true }).first().waitFor();
    await settle(page);
    await finishPng(await page.screenshot(), `empty_page_nudge.${lang}`);

    await context.close();
    if (denied.length) deniedAll.push(...denied.map((d) => `${lang}: ${d}`));
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

console.log('');
for (const f of written) console.log(`  ${f.path}  ${(f.bytes / 1024).toFixed(1)} KB`);
if (deniedAll.length) {
  console.log(`\n[email-shots] ${deniedAll.length} write(s) were refused (nothing was written):`);
  for (const d of deniedAll) console.log(`  ${d}`);
}
log(`done — ${written.length} files in ${OUT_DIR}/`);

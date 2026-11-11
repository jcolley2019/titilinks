// EMAIL.INFRA.1 — template registry, renderer, and the Resend message builder.
//
// PURE (see layout.ts): the guard chain renders every template and pins the
// headers below under tsx, so nothing here may touch Deno, the network or the
// clock.
//
// Streams — titilinks.com itself NEVER sends (its MX/SPF belong to the
// support@ mailbox, which is only ever our Reply-To):
//   mail → no-reply@mail.titilinks.com   transactional; no List-Unsubscribe
//   news → hola@news.titilinks.com       onboarding / marketing; one-click
//                                        unsubscribe (RFC 8058) on every send
// creators.titilinks.com is verified but has no sender yet.
//
// EMAIL.DRIP.1 — templates are plain-text copy with {{tokens}}, one primary
// button each, rendered into the one layout.ts shell. Tokens:
//   {{name}}              the creator's display name, else their handle, else
//                         nothing — the token and the comma or space before it
//                         are dropped, so "Hi {{name}}," becomes "Hi," and
//                         "¡Hola, {{name}}!" becomes "¡Hola!". Greetings only.
//   {{page_url}}          https://www.titilinks.com/<handle>, linked in HTML.
//   {{free_short_links}}  {{pro_month}}  {{pro_year_monthly}}  {{pro_year_total}}
//                         the product facts in facts.ts.
// A token the renderer does not know throws, so a typo can never reach an inbox.
//
// EMAIL.DRIP.2 — each template also names one image (template.image): a real
// screen of the app from public/email/, shown under the headline, linked to the
// same URL as the button, with alt text in the template's language.

import {
  BRAND,
  buttonHtml,
  emailAssetUrl,
  escapeHtml,
  layoutHtml,
  layoutText,
  SITE,
  type Lang,
  type Stream,
} from "./layout.ts";
import {
  ANALYTICS_PATH,
  EDITOR_PATH,
  FREE_SHORT_LINKS,
  PRO_PRICE_MONTH,
  PRO_PRICE_YEAR_MONTHLY,
  PRO_PRICE_YEAR_TOTAL,
  UPGRADE_PATH,
} from "./facts.ts";
import { welcomeEn } from "./templates/welcome.en.ts";
import { welcomeEs } from "./templates/welcome.es.ts";
import { editorTourEn } from "./templates/editor_tour.en.ts";
import { editorTourEs } from "./templates/editor_tour.es.ts";
import { knowWhatWorksEn } from "./templates/know_what_works.en.ts";
import { knowWhatWorksEs } from "./templates/know_what_works.es.ts";
import { proShowcaseEn } from "./templates/pro_showcase.en.ts";
import { proShowcaseEs } from "./templates/pro_showcase.es.ts";
import { emptyPageNudgeEn } from "./templates/empty_page_nudge.en.ts";
import { emptyPageNudgeEs } from "./templates/empty_page_nudge.es.ts";

export type { Lang, Stream };

/** Where a button goes. Each is a real route (facts.ts, pinned by the unit test). */
export type EmailLink = "page_url" | "editor_url" | "analytics_url" | "upgrade_url";

/**
 * One line of the Pro pitch, tied to the entitlement that backs it.
 * `entitlement` is a key of PlanEntitlements (src/lib/entitlements.ts) that Pro
 * grants and Free does not; scripts/email-infra.test.mjs asserts exactly that
 * against the ENTITLEMENTS object, so a line cannot claim a feature Pro lacks.
 */
export interface ProFeatureLine {
  entitlement: string;
  text: string;
}

/** A template: its subject and its copy, as plain text with {{tokens}}. */
export interface EmailTemplate {
  subject: string;
  /** Paragraphs, top of the body. The first is the greeting. */
  lines: string[];
  /** A bulleted list after `lines`. */
  bullets?: string[];
  /**
   * pro_showcase only — its bulleted list, each line backed by an entitlement.
   * A template carries `bullets` or `features`, never both.
   */
  features?: ProFeatureLine[];
  /** Paragraphs between the list and the button. */
  afterList?: string[];
  /** The one primary button. */
  button: { label: string; href: EmailLink };
  /** Paragraphs after the button. */
  closing?: string[];
  /**
   * EMAIL.DRIP.2 — a picture of the screen the email talks about, shown under
   * the headline and linked to the button's URL. `file` is in public/email/
   * (made by scripts/email-shots.mjs, served from www.titilinks.com/email/);
   * `alt` describes the screen, in the template's language.
   */
  image: { file: string; alt: string };
}

/** template_key → language → copy. Every key carries both languages. */
export const TEMPLATES: Record<string, Record<Lang, EmailTemplate>> = {
  welcome: { en: welcomeEn, es: welcomeEs },
  editor_tour: { en: editorTourEn, es: editorTourEs },
  know_what_works: { en: knowWhatWorksEn, es: knowWhatWorksEs },
  pro_showcase: { en: proShowcaseEn, es: proShowcaseEs },
  empty_page_nudge: { en: emptyPageNudgeEn, es: emptyPageNudgeEs },
};

export const FROM: Record<Stream, string> = {
  mail: "TitiLinks <no-reply@mail.titilinks.com>",
  news: "TitiLinks <hola@news.titilinks.com>",
};

export const REPLY_TO = "support@titilinks.com";

/** The exact value RFC 8058 requires. */
export const LIST_UNSUBSCRIBE_POST = "List-Unsubscribe=One-Click";

export const unsubscribeUrl = (token: string): string => `${SITE}/u/${token}`;

export const toLang = (value: string | null | undefined): Lang => (value === "es" ? "es" : "en");

/** A page handle as TL.HANDLE.1 allows it: 3–30 lowercase letters, digits, inner hyphens. */
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

export const pageUrl = (handle: string): string => `${SITE}/${handle}`;

export const LINKS: Record<Exclude<EmailLink, "page_url">, string> = {
  editor_url: `${SITE}${EDITOR_PATH}`,
  analytics_url: `${SITE}${ANALYTICS_PATH}`,
  upgrade_url: `${SITE}${UPGRADE_PATH}`,
};

/**
 * The name a greeting uses: the display name, else the handle, else null.
 * Whitespace is collapsed, it is capped at 60 characters, and a value that is
 * only the text "null" / "undefined" counts as no name.
 */
export function greetingName(displayName?: string | null, username?: string | null): string | null {
  for (const candidate of [displayName, username]) {
    const value = (candidate ?? "").replace(/\s+/g, " ").trim().slice(0, 60).trim();
    if (value && !/^(null|undefined)$/i.test(value)) return value;
  }
  return null;
}

export interface RenderInput {
  templateKey: string;
  lang: Lang;
  stream: Stream;
  /** Required when stream is 'news'. */
  unsubscribeToken?: string | null;
  /** The page's (else the profile's) display name. */
  displayName?: string | null;
  /** The page handle: {{page_url}} is https://www.titilinks.com/<username>. */
  username?: string | null;
  /** resolvePostalAddress(EMAIL_POSTAL_ADDRESS). Required when stream is 'news'. */
  postalAddress?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Vars {
  name: string | null;
  pageUrl: string | null;
  facts: Record<string, string>;
}

const TOKEN_RE = /\{\{([a-z_]+)\}\}/g;

/** Every token a template string uses. */
function tokensOf(s: string): string[] {
  return [...s.matchAll(TOKEN_RE)].map((m) => m[1]);
}

/** Drop {{name}} (and the comma/space before it) when there is no name. */
function withName(s: string, name: string | null): string {
  return name === null ? s.replace(/,?[ \t]*\{\{name\}\}/g, "") : s;
}

function tokenValue(token: string, vars: Vars): string {
  if (token === "name") return vars.name ?? "";
  if (token === "page_url") {
    if (!vars.pageUrl) throw new Error("{{page_url}} needs the creator's page handle");
    return vars.pageUrl;
  }
  const fact = vars.facts[token];
  if (fact === undefined) throw new Error(`unknown token: {{${token}}}`);
  return fact;
}

function renderTextLine(s: string, vars: Vars): string {
  return withName(s, vars.name).replace(TOKEN_RE, (_m, token: string) => tokenValue(token, vars));
}

/** Escaped HTML for one line; {{page_url}} becomes a link that shows the URL without its scheme. */
function renderHtmlLine(s: string, vars: Vars): string {
  const source = withName(s, vars.name);
  let out = "";
  let last = 0;
  for (const m of source.matchAll(TOKEN_RE)) {
    out += escapeHtml(source.slice(last, m.index));
    const token = m[1];
    const value = tokenValue(token, vars);
    out +=
      token === "page_url"
        ? `<a href="${escapeHtml(value)}" style="color:${BRAND.nearBlack};text-decoration:underline;">${escapeHtml(value.replace(/^https:\/\//, ""))}</a>`
        : escapeHtml(value);
    last = (m.index ?? 0) + m[0].length;
  }
  return out + escapeHtml(source.slice(last));
}

/** All the plain-text strings a template carries, in render order. */
export function templateStrings(template: EmailTemplate): string[] {
  return [
    template.subject,
    ...template.lines,
    ...(template.bullets ?? []),
    ...(template.features ?? []).map((f) => f.text),
    ...(template.afterList ?? []),
    template.button.label,
    ...(template.closing ?? []),
  ];
}

/**
 * Throws on an unknown template; a news email with no unsubscribe token or no
 * postal address; a {{page_url}} with no valid handle; an unknown token.
 */
export function renderEmail(input: RenderInput): RenderedEmail {
  const template = TEMPLATES[input.templateKey]?.[input.lang];
  if (!template) throw new Error(`unknown template: ${input.templateKey}/${input.lang}`);
  if (template.bullets && template.features) {
    throw new Error(`${input.templateKey}/${input.lang}: bullets and features are exclusive`);
  }
  if (input.stream === "news" && !input.unsubscribeToken) {
    throw new Error("a news email needs an unsubscribe token");
  }
  if (input.stream === "news" && !input.postalAddress) {
    throw new Error("a news email needs a postal address");
  }
  const url = input.stream === "news" ? unsubscribeUrl(input.unsubscribeToken!) : undefined;

  const handle = (input.username ?? "").trim();
  const vars: Vars = {
    name: greetingName(input.displayName, input.username),
    pageUrl: HANDLE_RE.test(handle) ? pageUrl(handle) : null,
    facts: {
      free_short_links: String(FREE_SHORT_LINKS),
      pro_month: PRO_PRICE_MONTH,
      pro_year_monthly: PRO_PRICE_YEAR_MONTHLY,
      pro_year_total: PRO_PRICE_YEAR_TOTAL,
    },
  };

  if (tokensOf(template.subject).length) throw new Error("subjects carry no tokens");
  const list = template.bullets ?? (template.features ?? []).map((f) => f.text);
  const href = template.button.href === "page_url" ? tokenValue("page_url", vars) : LINKS[template.button.href];

  const paragraph = (s: string) => `<p style="margin:0 0 16px 0;">${renderHtmlLine(s, vars)}</p>`;
  const htmlParts = [
    ...template.lines.map(paragraph),
    ...(list.length
      ? [
          `<ul style="margin:0 0 16px 0;padding:0 0 0 20px;">\n${list
            .map((item) => `<li style="margin:0 0 8px 0;">${renderHtmlLine(item, vars)}</li>`)
            .join("\n")}\n</ul>`,
        ]
      : []),
    ...(template.afterList ?? []).map(paragraph),
    buttonHtml(renderTextLine(template.button.label, vars), href),
    ...(template.closing ?? []).map(paragraph),
  ];

  const textParts = [
    ...template.lines.map((s) => renderTextLine(s, vars)),
    ...(list.length ? [list.map((item) => `- ${renderTextLine(item, vars)}`).join("\n")] : []),
    ...(template.afterList ?? []).map((s) => renderTextLine(s, vars)),
    `${renderTextLine(template.button.label, vars)}: ${href}`,
    ...(template.closing ?? []).map((s) => renderTextLine(s, vars)),
  ];

  return {
    subject: template.subject,
    html: layoutHtml({
      lang: input.lang,
      stream: input.stream,
      subject: template.subject,
      bodyHtml: htmlParts.join("\n"),
      image: template.image
        ? { src: emailAssetUrl(template.image.file), alt: template.image.alt, href }
        : undefined,
      unsubscribeUrl: url,
      postalAddress: input.postalAddress,
    }),
    text: layoutText({
      lang: input.lang,
      stream: input.stream,
      bodyText: textParts.join("\n\n"),
      unsubscribeUrl: url,
      postalAddress: input.postalAddress,
    }),
  };
}

/**
 * The List-Unsubscribe pair for a news email; nothing for transactional.
 * HTTPS only: no mailbox processes inbound unsubscribe mail, so a mailto:
 * entry would be a promise nothing keeps.
 */
export function streamHeaders(stream: Stream, unsubscribeToken?: string | null): Record<string, string> {
  if (stream !== "news") return {};
  if (!unsubscribeToken) throw new Error("a news email needs an unsubscribe token");
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(unsubscribeToken)}>`,
    "List-Unsubscribe-Post": LIST_UNSUBSCRIBE_POST,
  };
}

/** The body of `POST https://api.resend.com/emails`. */
export interface ResendMessage {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export function buildMessage(input: RenderInput & { to: string }): ResendMessage {
  const rendered = renderEmail(input);
  const headers = streamHeaders(input.stream, input.unsubscribeToken);
  return {
    from: FROM[input.stream],
    to: [input.to],
    reply_to: REPLY_TO,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

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

import { escapeHtml, layoutHtml, layoutText, SITE, type Lang, type Stream } from "./layout.ts";
import { welcomeEn } from "./templates/welcome.en.ts";
import { welcomeEs } from "./templates/welcome.es.ts";

export type { Lang, Stream };

/** A template is a subject and its paragraphs, as plain text. */
export interface EmailTemplate {
  subject: string;
  lines: string[];
}

/** template_key → language → copy. Every key carries both languages. */
export const TEMPLATES: Record<string, Record<Lang, EmailTemplate>> = {
  welcome: { en: welcomeEn, es: welcomeEs },
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

export interface RenderInput {
  templateKey: string;
  lang: Lang;
  stream: Stream;
  /** Required when stream is 'news'. */
  unsubscribeToken?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Throws on an unknown template, or a news email with no unsubscribe token. */
export function renderEmail(input: RenderInput): RenderedEmail {
  const template = TEMPLATES[input.templateKey]?.[input.lang];
  if (!template) throw new Error(`unknown template: ${input.templateKey}/${input.lang}`);
  if (input.stream === "news" && !input.unsubscribeToken) {
    throw new Error("a news email needs an unsubscribe token");
  }
  const url = input.stream === "news" ? unsubscribeUrl(input.unsubscribeToken!) : undefined;

  const bodyHtml = template.lines
    .map((line) => `<p style="margin:0 0 16px 0;">${escapeHtml(line)}</p>`)
    .join("\n");

  return {
    subject: template.subject,
    html: layoutHtml({
      lang: input.lang,
      stream: input.stream,
      subject: template.subject,
      bodyHtml,
      unsubscribeUrl: url,
    }),
    text: layoutText({
      lang: input.lang,
      stream: input.stream,
      bodyText: template.lines.join("\n\n"),
      unsubscribeUrl: url,
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

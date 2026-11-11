// EMAIL.INFRA.1 — the one bilingual shell every TitiLinks email is wrapped in.
//
// PURE: strings in, strings out. No Deno, DOM or Node APIs — it runs in the
// send-email edge function and, for the guard chain, under tsx
// (scripts/email-infra.test.mjs).
//
// Email-safe HTML: one 600px table, inline styles only (no <style> block, no
// flex/grid, no background images). The footer carries the physical postal
// address and, on the `news` stream ONLY, the unsubscribe line. Transactional
// (`mail`) email has no unsubscribe link: it is not marketing and must not be
// opt-out-able.
//
// EMAIL.DRIP.2 — the TitiLinks look: a near-black header band carrying the
// wordmark (public/email/logo.png, rendered from the app's wordmark by
// scripts/email-shots.mjs), a Playfair Display headline, a DM Sans body on
// white, and a gold pill button. Every colour is a token from src/index.css
// (BRAND below; scripts/email-infra.test.mjs re-derives each one from the CSS).
// Both fonts load from Google Fonts; Gmail and Outlook ignore that and fall
// back to Georgia and Arial, which the stacks name. An email may carry ONE
// content image — a picture of the screen it talks about, full width under the
// headline, linked to the button's URL.
//
// EMAIL.DRIP.1: the address is EMAIL_POSTAL_ADDRESS from the function
// environment, passed in by the caller (this module never reads the
// environment). A news email cannot be built without a real one — see
// resolvePostalAddress() and renderEmail(). A mail email with none simply
// leaves it out of the footer.

export type Lang = "en" | "es";
export type Stream = "mail" | "news";

/**
 * The literal the footer carried before DRIP.1. It must never reach an inbox:
 * resolvePostalAddress() rejects it (and anything else still holding a
 * {{…}} marker).
 */
export const POSTAL_ADDRESS_PLACEHOLDER = "{{POSTAL_ADDRESS}}";

export const SITE = "https://www.titilinks.com";

/** Where the email images live: public/email/ in the app, served from the site. */
export const EMAIL_ASSET_PATH = "/email";
export const emailAssetUrl = (file: string): string => `${SITE}${EMAIL_ASSET_PATH}/${file}`;

/**
 * The palette, each a token from src/index.css converted HSL → hex.
 * The email-infra unit test converts the CSS and compares, so they cannot drift.
 */
export const BRAND = {
  /** --primary, 43 65% 55%: the button, the wordmark's "Links". */
  gold: "#d7ad42",
  /** .dark --background, 30 15% 6%: the header band, the button label, the headline. */
  nearBlack: "#120f0d",
  /** :root --background, 30 10% 96%: the canvas around the card. */
  canvas: "#f6f5f4",
  /** :root --foreground, 30 5% 15%: body text. */
  text: "#282624",
  /** :root --muted-foreground, 30 5% 45%: the footer. */
  muted: "#78736d",
  /** :root --border, 30 10% 85%: the footer rule. */
  border: "#ddd9d5",
} as const;

const FONT_HEADLINE = "'Playfair Display', Georgia, serif";
const FONT_BODY = "'DM Sans', Arial, Helvetica, sans-serif";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&family=Playfair+Display:wght@700&display=swap";

/** Every <img> starts its style with this (scripts/email-infra.test.mjs). */
export const IMG_STYLE = "display:block;max-width:100%;height:auto;border:0";

/** public/email/logo.png is rendered at 2x; this is its display width. */
export const LOGO_WIDTH = 111;
/** The content image's display width: the full 600px card (files are 1200px wide). */
export const CONTENT_IMAGE_WIDTH = 600;

/**
 * The configured postal address, or null when there is none to use: unset,
 * blank, or still a template placeholder.
 */
export function resolvePostalAddress(raw: string | null | undefined): string | null {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (value.includes("{{") || value.includes("}}")) return null;
  return value;
}

const FOOTER: Record<Lang, { sentBy: string; unsubscribe: string; unsubscribeLink: string }> = {
  en: {
    sentBy: "Sent by TitiLinks",
    unsubscribe: "Don't want these emails?",
    unsubscribeLink: "Unsubscribe",
  },
  es: {
    sentBy: "Enviado por TitiLinks",
    unsubscribe: "¿No quieres recibir estos correos?",
    unsubscribeLink: "Cancelar suscripción",
  },
};

/** Escape & < > " ' for text and double-quoted attribute values. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The one primary button. A table cell carries the colour so clients that drop
 * padding on links (Outlook) still show a button. `data-role="button"` lets the
 * unit test count buttons; mail clients ignore it.
 */
export function buttonHtml(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
<tr><td style="border-radius:999px;background:${BRAND.gold};">
<a data-role="button" href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT_BODY};font-size:16px;font-weight:bold;line-height:20px;color:${BRAND.nearBlack};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td></tr>
</table>`;
}

/** The one picture of the screen the email talks about, linked like its button. */
export interface ContentImage {
  /** Absolute https URL (emailAssetUrl). */
  src: string;
  /** In the email's language, describing the screen. Plain text. */
  alt: string;
  /** The button's URL. */
  href: string;
}

export interface LayoutInput {
  lang: Lang;
  stream: Stream;
  /** Used as <title>, as the hidden preheader and as the headline. Plain text. */
  subject: string;
  /** Already-escaped body markup. */
  bodyHtml: string;
  /** Shown full width between the headline and the body. */
  image?: ContentImage;
  /** Required for `news`; ignored for `mail`. */
  unsubscribeUrl?: string;
  /** From resolvePostalAddress(). Required for `news` (renderEmail enforces it). */
  postalAddress?: string | null;
}

export function layoutHtml(input: LayoutInput): string {
  const f = FOOTER[input.lang];
  const address = input.postalAddress ? ` · ${escapeHtml(input.postalAddress)}` : "";
  const unsubscribe =
    input.stream === "news" && input.unsubscribeUrl
      ? `<br>${escapeHtml(f.unsubscribe)} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline;">${escapeHtml(f.unsubscribeLink)}</a>`
      : "";
  // Blocked images show their alt text; give the wordmark's the gold serif look.
  const logo = `<img data-role="logo" src="${escapeHtml(emailAssetUrl("logo.png"))}" width="${LOGO_WIDTH}" alt="TitiLinks" style="${IMG_STYLE};color:${BRAND.gold};font-family:${FONT_HEADLINE};font-size:22px;line-height:28px;font-weight:bold;">`;
  const image = input.image
    ? `<tr><td style="padding:0 0 8px 0;">
<a href="${escapeHtml(input.image.href)}" style="display:block;text-decoration:none;"><img data-role="content-image" src="${escapeHtml(input.image.src)}" width="${CONTENT_IMAGE_WIDTH}" alt="${escapeHtml(input.image.alt)}" style="${IMG_STYLE};color:${BRAND.muted};font-family:${FONT_BODY};font-size:14px;line-height:20px;"></a>
</td></tr>`
    : "";

  return `<!doctype html>
<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.subject)}</title>
<link href="${FONTS_HREF}" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(input.subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.canvas};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:22px 32px;background:${BRAND.nearBlack};border-radius:12px 12px 0 0;">${logo}</td></tr>
<tr><td style="padding:32px 32px 20px 32px;"><h1 style="margin:0;font-family:${FONT_HEADLINE};font-size:28px;line-height:36px;font-weight:700;color:${BRAND.nearBlack};">${escapeHtml(input.subject)}</h1></td></tr>
${image}
<tr><td style="padding:12px 32px 28px 32px;font-family:${FONT_BODY};font-size:16px;line-height:26px;color:${BRAND.text};">
${input.bodyHtml}
</td></tr>
<tr><td style="padding:18px 32px 24px 32px;border-top:1px solid ${BRAND.border};font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${BRAND.muted};">
${escapeHtml(f.sentBy)}${address}${unsubscribe}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The text/plain alternative of the same shell. */
export function layoutText(input: Omit<LayoutInput, "bodyHtml" | "subject"> & { bodyText: string }): string {
  const f = FOOTER[input.lang];
  const address = input.postalAddress ? ` · ${input.postalAddress}` : "";
  const lines = [input.bodyText, "", "--", `${f.sentBy}${address}`];
  if (input.stream === "news" && input.unsubscribeUrl) {
    lines.push(`${f.unsubscribeLink}: ${input.unsubscribeUrl}`);
  }
  return lines.join("\n");
}

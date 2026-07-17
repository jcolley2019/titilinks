// Maps a link URL's hostname to a PlatformIcon catalog label (FL-ICON).
// Returns null for unrecognized hosts — callers render a generic link glyph.
const HOST_MAP: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)music\.youtube\.com$/, 'YouTube Music'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'X (Twitter)'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'],
  [/(^|\.)threads\.(com|net)$/, 'Threads'],
  [/(^|\.)pinterest\.(com|ca|co\.uk)$/, 'Pinterest'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)(t\.me|telegram\.(me|org))$/, 'Telegram'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'WhatsApp'],
  [/(^|\.)calendly\.com$/, 'Calendly'],
  [/(^|\.)(discord\.gg|discord\.com)$/, 'Discord'],
  [/(^|\.)spotify\.com$/, 'Spotify'],
  [/(^|\.)music\.apple\.com$/, 'Apple Music'],
  [/(^|\.)soundcloud\.com$/, 'SoundCloud'],
  [/(^|\.)(paypal\.com|paypal\.me)$/, 'PayPal'],
  [/(^|\.)venmo\.com$/, 'Venmo'],
  [/(^|\.)cash\.app$/, 'Cash App'],
  [/(^|\.)twitch\.tv$/, 'Twitch'],
  [/(^|\.)kick\.com$/, 'Kick'],
  [/(^|\.)netflix\.com$/, 'Netflix'],
  [/(^|\.)(steampowered\.com|steamcommunity\.com)$/, 'Steam'],
  [/(^|\.)etsy\.com$/, 'Etsy'],
  [/(^|\.)depop\.com$/, 'Depop'],
  [/(^|\.)yelp\.com$/, 'Yelp'],
  [/(^|\.)airbnb\.(com|ca|co\.uk)$/, 'Airbnb'],
  [/(^|\.)onlyfans\.com$/, 'OnlyFans'],
  [/(^|\.)fansly\.com$/, 'Fansly'],
  [/(^|\.)privacy\.com\.br$/, 'Privacy'],
  [/(^|\.)fatalfans\.com$/, 'FatalFans'],
  [/(^|\.)vrbo\.com$/, 'Vrbo'],
  [/(^|\.)substack\.com$/, 'Substack'],
];

export function platformFromUrl(url: string | null | undefined): string | null {
  const raw = (url || '').trim();
  if (!raw || /^mailto:/i.test(raw) || /^tel:/i.test(raw)) return null;
  // A bare email ("user@host.tld" — no scheme, no slashes) isn't a platform URL,
  // but a social URL with an @handle in the PATH (tiktok.com/@user) IS — so bail
  // only on the former, not on every '@'.
  if (!/^https?:\/\//i.test(raw) && /^[^\s/]+@[^\s/]+$/.test(raw)) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      .hostname.toLowerCase().replace(/^www\./, '');
    for (const [re, label] of HOST_MAP) {
      if (re.test(host)) return label;
    }
  } catch { /* unparseable — treat as generic */ }
  return null;
}

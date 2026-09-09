// Single source of truth for the platform picker catalog; consumed by
// SocialLinksEditor and StepAddYourLinks. Rendering goes through PlatformIcon,
// which keys off `label` — entries carry no icon of their own.
// scripts/audit-platforms.mjs cross-references this file.
export interface CatalogPlatform {
  label: string;
  placeholder: string;
  /** TL.PLAT.HIDE.1 — kept in the catalog (icons, builders, 18+ gate, saved-row presets) but left out of PICKER_CATALOG. */
  hidden?: true;
}
export interface CatalogCategory {
  label: string;
  platforms: CatalogPlatform[];
}
export const PLATFORM_CATALOG: CatalogCategory[] = [
  {
    label: 'SOCIAL',
    platforms: [
      { label: 'TikTok', placeholder: 'TikTok username' },
      { label: 'Instagram', placeholder: 'Instagram username' },
      { label: 'YouTube', placeholder: 'YouTube channel URL' },
      { label: 'Facebook', placeholder: 'Facebook profile URL' },
      { label: 'X (Twitter)', placeholder: 'X username' },
      { label: 'Snapchat', placeholder: 'Snapchat username' },
      { label: 'Threads', placeholder: 'Threads username' },
      { label: 'Pinterest', placeholder: 'Pinterest username' },
      { label: 'Bluesky', placeholder: 'Bluesky handle' },
      { label: 'Reddit', placeholder: 'Reddit username' },
      { label: 'Lemon8', placeholder: 'Lemon8 username' },
      { label: 'RedNote', placeholder: 'RedNote profile URL' },
      { label: 'BeReal', placeholder: 'BeReal username' },
      { label: 'Kwai', placeholder: 'Kwai profile link' },
    ],
  },
  {
    label: 'BUSINESS',
    platforms: [
      { label: 'LinkedIn', placeholder: 'LinkedIn profile URL' },
      { label: 'GitHub', placeholder: 'GitHub username' },
      { label: 'Telegram', placeholder: 'Telegram username' },
      { label: 'WhatsApp', placeholder: 'WhatsApp number' },
      { label: 'Messenger', placeholder: 'Messenger username' },
      { label: 'Calendly', placeholder: 'Calendly username' },
      { label: 'Discord', placeholder: 'Discord invite URL' },
    ],
  },
  {
    label: 'MUSIC',
    platforms: [
      { label: 'Spotify', placeholder: 'Spotify profile URL' },
      { label: 'Apple Music', placeholder: 'Apple Music URL' },
      { label: 'SoundCloud', placeholder: 'SoundCloud username' },
      { label: 'YouTube Music', placeholder: 'YouTube Music URL' },
      { label: 'Amazon Music', placeholder: 'Amazon Music URL' },
    ],
  },
  {
    label: 'PAYMENT',
    platforms: [
      { label: 'PayPal', placeholder: 'PayPal.me link' },
      { label: 'Venmo', placeholder: 'Venmo username' },
      { label: 'Cash App', placeholder: 'Cash App $cashtag' },
      { label: 'Patreon', placeholder: 'Patreon username' },
      { label: 'Ko-fi', placeholder: 'Ko-fi username' },
      { label: 'Buy Me a Coffee', placeholder: 'Buy Me a Coffee username' },
      { label: 'Whop', placeholder: 'Whop store slug' },
    ],
  },
  {
    label: 'ENTERTAINMENT',
    platforms: [
      { label: 'Twitch', placeholder: 'Twitch username' },
      { label: 'Kick', placeholder: 'Kick username' },
      // TL.PLAT.HIDE.1 — hidden from the pickers by Titi's decision (Sep 2026); icons/builders/gate stay so existing links keep working. Remove the flag to bring one back.
      { label: 'Bigo Live', placeholder: 'Bigo Live username', hidden: true },
      { label: 'Netflix', placeholder: 'Netflix link' },
      { label: 'Steam', placeholder: 'Steam profile URL' },
      { label: 'Roblox', placeholder: 'Roblox profile URL' },
      { label: 'Substack', placeholder: 'Substack handle' },
      { label: 'Apple Podcasts', placeholder: 'Apple Podcasts show URL' },
    ],
  },
  {
    label: 'LIFESTYLE',
    platforms: [
      { label: 'Depop', placeholder: 'Depop username' },
      { label: 'Vinted', placeholder: 'Vinted profile URL' },
      { label: 'Etsy', placeholder: 'Etsy shop URL' },
      { label: 'Amazon', placeholder: 'Amazon wishlist or store URL' },
      { label: 'Yelp', placeholder: 'Yelp business URL' },
      { label: 'Airbnb', placeholder: 'Airbnb profile URL' },
      { label: 'Vrbo', placeholder: 'Vrbo property URL' },
    ],
  },
  {
    label: 'ADULT (18+)',
    platforms: [
      { label: 'OnlyFans', placeholder: 'OnlyFans username', hidden: true },
      { label: 'Fansly', placeholder: 'Fansly username', hidden: true },
      { label: 'Privacy', placeholder: 'Privacy username', hidden: true },
      { label: 'FatalFans', placeholder: 'FatalFans username', hidden: true },
    ],
  },
];

// TL.PLAT.HIDE.1 — what the pickers (SocialLinksEditor, StepAddYourLinks)
// iterate. Derived from PLATFORM_CATALOG, never a second list: hidden
// platforms are filtered out and a category left empty is dropped. Preset
// lookups for EXISTING rows and the 18+ gate keep reading PLATFORM_CATALOG.
export const PICKER_CATALOG: CatalogCategory[] = PLATFORM_CATALOG.map((c) => ({
  label: c.label,
  platforms: c.platforms.filter((p) => !p.hidden),
})).filter((c) => c.platforms.length > 0);

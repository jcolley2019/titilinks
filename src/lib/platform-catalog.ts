// Single source of truth for the platform picker catalog; consumed by
// SocialLinksEditor and StepAddYourLinks. The `icon` field is dead (MENU.1c).
// scripts/audit-platforms.mjs cross-references this file.
export const PLATFORM_CATALOG = [
  {
    label: 'SOCIAL',
    platforms: [
      { label: 'TikTok', icon: '🎵', placeholder: 'TikTok username' },
      { label: 'Instagram', icon: '📸', placeholder: 'Instagram username' },
      { label: 'YouTube', icon: '▶️', placeholder: 'YouTube channel URL' },
      { label: 'Facebook', icon: '👤', placeholder: 'Facebook profile URL' },
      { label: 'X (Twitter)', icon: '𝕏', placeholder: 'X username' },
      { label: 'Snapchat', icon: '👻', placeholder: 'Snapchat username' },
      { label: 'Threads', icon: '🧵', placeholder: 'Threads username' },
      { label: 'Pinterest', icon: '📌', placeholder: 'Pinterest username' },
      { label: 'Bluesky', icon: '', placeholder: 'Bluesky handle' },
      { label: 'Reddit', icon: '', placeholder: 'Reddit username' },
      { label: 'Lemon8', icon: '', placeholder: 'Lemon8 username' },
      { label: 'RedNote', icon: '', placeholder: 'RedNote profile URL' },
      { label: 'BeReal', icon: '', placeholder: 'BeReal username' },
      { label: 'Kwai', icon: '', placeholder: 'Kwai profile link' },
    ],
  },
  {
    label: 'BUSINESS',
    platforms: [
      { label: 'LinkedIn', icon: '💼', placeholder: 'LinkedIn profile URL' },
      { label: 'GitHub', icon: '🐙', placeholder: 'GitHub username' },
      { label: 'Telegram', icon: '✈️', placeholder: 'Telegram username' },
      { label: 'WhatsApp', icon: '💬', placeholder: 'WhatsApp number' },
      { label: 'Messenger', icon: '', placeholder: 'Messenger username' },
      { label: 'Calendly', icon: '📅', placeholder: 'Calendly username' },
      { label: 'Discord', icon: '🎮', placeholder: 'Discord invite URL' },
    ],
  },
  {
    label: 'MUSIC',
    platforms: [
      { label: 'Spotify', icon: '🎧', placeholder: 'Spotify profile URL' },
      { label: 'Apple Music', icon: '🍎', placeholder: 'Apple Music URL' },
      { label: 'SoundCloud', icon: '☁️', placeholder: 'SoundCloud username' },
      { label: 'YouTube Music', icon: '🎵', placeholder: 'YouTube Music URL' },
      { label: 'Amazon Music', icon: '', placeholder: 'Amazon Music URL' },
    ],
  },
  {
    label: 'PAYMENT',
    platforms: [
      { label: 'PayPal', icon: '🅿️', placeholder: 'PayPal.me link' },
      { label: 'Venmo', icon: '💸', placeholder: 'Venmo username' },
      { label: 'Cash App', icon: '💵', placeholder: 'Cash App $cashtag' },
      { label: 'Patreon', icon: '', placeholder: 'Patreon username' },
      { label: 'Ko-fi', icon: '', placeholder: 'Ko-fi username' },
      { label: 'Buy Me a Coffee', icon: '', placeholder: 'Buy Me a Coffee username' },
      { label: 'Whop', icon: '', placeholder: 'Whop store slug' },
    ],
  },
  {
    label: 'ENTERTAINMENT',
    platforms: [
      { label: 'Twitch', icon: '🎮', placeholder: 'Twitch username' },
      { label: 'Kick', icon: '🎯', placeholder: 'Kick username' },
      { label: 'Netflix', icon: '🎬', placeholder: 'Netflix link' },
      { label: 'Steam', icon: '🕹️', placeholder: 'Steam profile URL' },
      { label: 'Roblox', icon: '', placeholder: 'Roblox profile URL' },
      { label: 'Substack', icon: '📰', placeholder: 'Substack handle' },
      { label: 'Apple Podcasts', icon: '', placeholder: 'Apple Podcasts show URL' },
    ],
  },
  {
    label: 'LIFESTYLE',
    platforms: [
      { label: 'Depop', icon: '👗', placeholder: 'Depop username' },
      { label: 'Vinted', icon: '', placeholder: 'Vinted profile URL' },
      { label: 'Etsy', icon: '🛍️', placeholder: 'Etsy shop URL' },
      { label: 'Amazon', icon: '', placeholder: 'Amazon wishlist or store URL' },
      { label: 'Yelp', icon: '⭐', placeholder: 'Yelp business URL' },
      { label: 'Airbnb', icon: '🏠', placeholder: 'Airbnb profile URL' },
      { label: 'Vrbo', icon: '', placeholder: 'Vrbo property URL' },
    ],
  },
  {
    label: 'ADULT (18+)',
    platforms: [
      { label: 'OnlyFans', icon: '', placeholder: 'OnlyFans username' },
      { label: 'Fansly', icon: '', placeholder: 'Fansly username' },
      { label: 'Privacy', icon: '', placeholder: 'Privacy username' },
      { label: 'FatalFans', icon: '', placeholder: 'FatalFans username' },
    ],
  },
];

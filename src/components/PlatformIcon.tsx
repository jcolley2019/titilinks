import type { IconType } from 'react-icons';
import {
  SiTiktok, SiInstagram, SiYoutube, SiFacebook, SiX, SiSnapchat, SiThreads,
  SiPinterest, SiGithub, SiTelegram, SiWhatsapp, SiCalendly, SiDiscord,
  SiSpotify, SiApplemusic, SiSoundcloud, SiYoutubemusic, SiPaypal, SiVenmo,
  SiCashapp, SiZelle, SiTwitch, SiKick, SiNetflix, SiSteam, SiEtsy, SiYelp,
  SiAirbnb,
} from 'react-icons/si';
import { FaLinkedin } from 'react-icons/fa';
import { Link as LinkIcon, Globe } from 'lucide-react';

interface PlatformMeta {
  Icon: IconType;
  color: string;
}

// Keyed by the exact catalog label. Near-black brands use #FFFFFF so they
// stay visible on dark surfaces. LinkedIn comes from Font Awesome because
// Simple Icons removed its mark.
const PLATFORMS: Record<string, PlatformMeta> = {
  'TikTok': { Icon: SiTiktok, color: '#FFFFFF' },
  'Instagram': { Icon: SiInstagram, color: '#E4405F' },
  'YouTube': { Icon: SiYoutube, color: '#FF0000' },
  'Facebook': { Icon: SiFacebook, color: '#1877F2' },
  'X (Twitter)': { Icon: SiX, color: '#FFFFFF' },
  'Snapchat': { Icon: SiSnapchat, color: '#FFFC00' },
  'Threads': { Icon: SiThreads, color: '#FFFFFF' },
  'Pinterest': { Icon: SiPinterest, color: '#E60023' },
  'LinkedIn': { Icon: FaLinkedin, color: '#0A66C2' },
  'GitHub': { Icon: SiGithub, color: '#FFFFFF' },
  'Telegram': { Icon: SiTelegram, color: '#26A5E4' },
  'WhatsApp': { Icon: SiWhatsapp, color: '#25D366' },
  'Calendly': { Icon: SiCalendly, color: '#006BFF' },
  'Discord': { Icon: SiDiscord, color: '#5865F2' },
  'Spotify': { Icon: SiSpotify, color: '#1DB954' },
  'Apple Music': { Icon: SiApplemusic, color: '#FA243C' },
  'SoundCloud': { Icon: SiSoundcloud, color: '#FF5500' },
  'YouTube Music': { Icon: SiYoutubemusic, color: '#FF0000' },
  'PayPal': { Icon: SiPaypal, color: '#0070BA' },
  'Venmo': { Icon: SiVenmo, color: '#3D95CE' },
  'Cash App': { Icon: SiCashapp, color: '#00D632' },
  'Zelle': { Icon: SiZelle, color: '#8C52FF' },
  'Twitch': { Icon: SiTwitch, color: '#9146FF' },
  'Kick': { Icon: SiKick, color: '#53FC18' },
  'Netflix': { Icon: SiNetflix, color: '#E50914' },
  'Steam': { Icon: SiSteam, color: '#FFFFFF' },
  'Etsy': { Icon: SiEtsy, color: '#F16521' },
  'Yelp': { Icon: SiYelp, color: '#FF1A1A' },
  'Airbnb': { Icon: SiAirbnb, color: '#FF5A5F' },
};

// Lowercase + strip any parenthetical suffix so variant labels resolve:
// "X (Twitter)" and "X" both normalize to "x".
const normalize = (label: string) =>
  label.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').trim();

const NORMALIZED: Record<string, PlatformMeta> = Object.fromEntries(
  Object.entries(PLATFORMS).map(([label, meta]) => [normalize(label), meta])
);

function resolve(label: string): PlatformMeta | undefined {
  return PLATFORMS[label] ?? NORMALIZED[normalize(label)];
}

export function hasPlatformIcon(label: string): boolean {
  return resolve(label) !== undefined || normalize(label) === 'website';
}

interface PlatformIconProps {
  label: string;
  size?: number;
  className?: string;
  /**
   * Override the brand color. Pass this in icon-row / public contexts to
   * render the logo monochrome (e.g. color="currentColor" or "#ffffff").
   * Omit it in pickers to keep full brand colors.
   */
  color?: string;
}

export function PlatformIcon({ label, size = 20, className, color }: PlatformIconProps) {
  // "Website" is generic, not a brand — use a globe.
  if (normalize(label) === 'website') {
    return <Globe size={size} className={className} style={{ color: color ?? '#C9A55C' }} />;
  }
  const meta = resolve(label);
  if (!meta) {
    // Unknown / custom label → neutral link glyph in brand gold.
    return <LinkIcon size={size} className={className} style={{ color: color ?? '#C9A55C' }} />;
  }
  return <meta.Icon size={size} className={className} color={color ?? meta.color} />;
}

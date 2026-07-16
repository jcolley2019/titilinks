import type { IconType } from 'react-icons';
import {
  SiTiktok, SiInstagram, SiYoutube, SiFacebook, SiX, SiSnapchat, SiThreads,
  SiPinterest, SiGithub, SiTelegram, SiWhatsapp, SiCalendly, SiDiscord,
  SiSpotify, SiApplemusic, SiSoundcloud, SiYoutubemusic, SiPaypal, SiVenmo,
  SiCashapp, SiZelle, SiTwitch, SiKick, SiNetflix, SiSteam, SiEtsy, SiYelp,
  SiAirbnb, SiOnlyfans, SiPandora, SiApplepodcasts, SiSubstack,
} from 'react-icons/si';
import { FaLinkedin, FaSkype, FaTwitter, FaAmazon } from 'react-icons/fa';
import { Link as LinkIcon, Globe } from 'lucide-react';

interface PlatformMeta {
  Icon: IconType;
  color: string;
}

// ---- Custom brand marks (traced in-house; not in react-icons) ----
// Single-path, 24x24 viewBox, monochrome — same convention as Simple
// Icons, so they tint correctly via the color prop app-wide.
const makeBrandIcon = (d: string): IconType =>
  function BrandIcon({ size = 24, color = 'currentColor', ...rest }) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color} {...rest}>
        <path d={d} />
      </svg>
    );
  };

const TruthSocialIcon = makeBrandIcon('M0 1.85H6V7.21H0ZM8.81 1.85L23.87 1.85L23.87 7.21L15.19 7.21L15.19 22.15L8.81 22.15ZM17.74 16.79H24V22.15H17.74Z');
const FanslyIcon = makeBrandIcon('M11.98 21.87L2.62 12.51C0.83 10.72 0.28 9.98 0.09 9.09C-0.14 8.03 0.19 6.72 0.91 5.83C1.24 5.42 4.11 2.98 4.65 2.65C5.44 2.17 6.65 2.01 7.61 2.26C8.48 2.49 8.99 2.85 10.24 4.09L11.39 5.23L12.55 4.08C13.82 2.83 14.33 2.48 15.24 2.25C16.19 2.02 17.36 2.19 18.16 2.67C18.71 3.00 21.56 5.43 21.89 5.85C22.60 6.73 22.92 8.03 22.70 9.08C22.51 9.97 21.95 10.72 20.16 12.51L10.80 21.87L11.98 21.87ZM13.35 16.85C14.31 16.52 15.09 15.74 15.42 14.78C15.57 14.34 15.60 13.53 15.48 13.05C15.17 11.83 14.14 10.86 12.91 10.63C11.30 10.33 9.68 11.36 9.26 12.94C9.13 13.44 9.16 14.26 9.32 14.73C9.66 15.72 10.42 16.49 11.37 16.82C11.94 17.02 12.79 17.03 13.35 16.85ZM12.13 14.15C11.90 14.03 11.72 13.75 11.72 13.51C11.72 13.28 11.91 12.98 12.12 12.87C12.66 12.59 13.29 13.07 13.16 13.66C13.06 14.13 12.55 14.37 12.13 14.15Z');
const FatalFansIcon = makeBrandIcon('M12 10.6L4.9 4.4C4.1 3.7 3 4.3 3 5.3v13.4c0 1 1.1 1.6 1.9.9L12 13.4l7.1 6.2c.8.7 1.9.1 1.9-.9V5.3c0-1-1.1-1.6-1.9-.9L12 10.6Z');
const PrivacyIcon = makeBrandIcon('M9.83 0.23L8.69 0.46L7.54 0.91L6.63 1.60L5.49 2.29L4.57 3.20L3.66 3.89L2.97 5.03L2.51 5.94L2.06 6.86L1.83 7.54L1.60 8.46L1.37 9.60L1.14 10.74L1.14 12.34L1.14 14.17L1.14 16.46L1.14 22.40L2.06 23.09L2.29 23.31L2.51 23.54L2.51 23.54L2.74 23.77L2.97 23.77L3.20 23.77L3.43 23.77L3.66 24.00L4.11 23.77L4.57 23.77L4.80 23.77L5.26 23.54L5.49 23.31L5.71 22.86L6.17 22.40L6.63 21.71L6.63 21.49L6.86 21.26L7.09 21.03L7.09 21.03L7.31 20.80L7.31 20.57L7.31 20.57L7.31 20.57L7.31 20.57L7.54 20.57L7.54 20.57L7.77 20.80L8.00 20.80L8.23 20.80L8.69 21.03L8.91 21.03L10.06 21.26L11.20 21.49L12.34 21.49L13.49 21.26L14.63 21.03L15.77 20.80L16.91 20.34L18.06 19.66L19.20 18.74L20.11 17.60L21.03 16.46L21.71 15.31L22.17 13.94L22.63 12.34L22.63 10.97L22.63 9.37L22.17 7.31L21.26 5.26L19.89 3.43L18.29 2.06L16.46 0.91L14.40 0.23L12.11 0.00L9.83 0.23ZM13.94 5.26L14.40 5.71L15.09 6.17L15.54 6.86L15.77 7.31L16.00 8.00L16.23 8.69L16.23 9.37L16.00 10.06L16.00 10.29L15.77 10.51L15.77 10.74L15.54 10.97L15.54 11.20L15.31 11.43L15.09 11.66L15.09 11.89L14.40 12.57L15.54 14.86L16.91 17.14L14.40 17.37L13.94 17.37L13.49 17.37L12.80 17.37L12.11 17.37L11.43 17.37L10.74 17.37L10.29 17.37L9.83 17.37L7.31 17.14L8.69 14.86L9.83 12.57L9.14 11.89L8.46 10.74L8.00 9.60L8.00 8.46L8.46 7.54L8.91 6.40L9.83 5.71L10.74 5.26L12.11 5.03L12.34 5.03L12.57 5.03L12.80 5.03L13.03 5.03L13.26 5.26L13.49 5.26L13.71 5.26L13.94 5.26Z');

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
  'OnlyFans': { Icon: SiOnlyfans, color: '#00AFF0' },
  'Twitter': { Icon: FaTwitter, color: '#1DA1F2' },
  'Skype': { Icon: FaSkype, color: '#00AFF0' },
  'Amazon Music': { Icon: FaAmazon, color: '#FF9900' },
  'Pandora': { Icon: SiPandora, color: '#3668FF' },
  'Apple Podcasts': { Icon: SiApplepodcasts, color: '#9933CC' },
  'Truth Social': { Icon: TruthSocialIcon, color: '#5548EF' },
  'Fansly': { Icon: FanslyIcon, color: '#2699F6' },
  'Privacy': { Icon: PrivacyIcon, color: '#FF7346' },
  'FatalFans': { Icon: FatalFansIcon, color: '#F0605A' },
  'Substack': { Icon: SiSubstack, color: '#FF6719' },
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

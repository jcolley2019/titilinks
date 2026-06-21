// Shared leading-icon logic for Featured Links.
//
// The "leading icon" is the small glyph on the LEFT of a button-style link.
// By default it's auto-detected from the URL (platform brand / email / phone /
// generic link). A creator can override it per-link to use their own profile
// photo, or hide it entirely. The choice is stored on block_items.style_json
// (`icon_source`) so no DB column is needed, and it applies to BUTTONS only —
// image cards keep their auto platform-icon overlay.
//
// Both the live render (LinksBlock) and the editor preview (LinksEditor) call
// leadingIconFor() so the two surfaces can never disagree.

import { createContext, useContext, type ReactNode } from 'react';
import { Mail, Phone, Link as LinkChainIcon } from 'lucide-react';
import { platformFromUrl } from '@/lib/platform-from-url';
import { PlatformIcon } from '@/components/PlatformIcon';

/** Per-link leading-icon source, stored on block_items.style_json.icon_source.
 *  Undefined / 'platform' = the default auto-detected icon. */
export type IconSource = 'platform' | 'avatar' | 'none';

/** Live profile avatar URL for the page being rendered. Provided once by
 *  EditableProfileView (the single render path for both live + edit) and read
 *  by LinksBlock so an `avatar` link shows the creator's *current* photo. */
export const ProfileAvatarContext = createContext<string | undefined>(undefined);
export const useProfileAvatar = () => useContext(ProfileAvatarContext);

/**
 * Resolve a link's leading icon node.
 * - `hasImage` true → the item renders as an image card, not a button, so the
 *   override doesn't apply: always return the auto-detected icon.
 * - `iconSource === 'none'` → no icon.
 * - `iconSource === 'avatar'` (+ an avatar exists) → the creator's photo.
 * - otherwise → auto platform / email / phone / generic-link icon.
 */
export function leadingIconFor({
  url,
  iconSource,
  hasImage,
  avatarUrl,
  iconColor,
  iconImage,
}: {
  url: string | null | undefined;
  iconSource?: string | null;
  hasImage: boolean;
  avatarUrl?: string;
  /** 'brand' (or unset) keeps each platform's own color; 'white'/'black' force
   *  the glyph monochrome — same choice as the Manage Platforms icon color. */
  iconColor?: string | null;
  /** A custom uploaded icon (URL) for this link — wins over platform/avatar. */
  iconImage?: string | null;
}): ReactNode {
  if (!hasImage) {
    if (iconSource === 'none') return null;
    if (iconImage) {
      return (
        <img
          src={iconImage}
          alt=""
          aria-hidden="true"
          className="h-full w-full rounded-full object-cover"
        />
      );
    }
    if (iconSource === 'avatar' && avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          className="h-full w-full rounded-full object-cover"
        />
      );
    }
  }
  const glyph = iconColor === 'white' ? '#ffffff' : iconColor === 'black' ? '#000000' : undefined;
  const u = (url || '').trim();
  // Email only for a real address (mailto:, or bare "user@host.tld") — NOT a
  // social URL whose path has an @handle (e.g. tiktok.com/@user).
  const isEmail = /^mailto:/i.test(u) || (!/^https?:\/\//i.test(u) && /^[^\s/]+@[^\s/]+\.[^\s/]+$/.test(u));
  if (isEmail) return <Mail size={14} color={glyph} />;
  if (/^tel:/i.test(u) || /^[\d+\-\s()]+$/.test(u)) return <Phone size={14} color={glyph} />;
  const platform = platformFromUrl(u);
  return platform ? <PlatformIcon label={platform} size={14} color={glyph} /> : <LinkChainIcon size={14} color={glyph} />;
}

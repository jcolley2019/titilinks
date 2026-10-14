import { z } from 'zod';

// ==================== Handle Validation ====================
// Unique, lowercase, alphanumeric + hyphen only (no underscores)
export const handleSchema = z.string()
  .min(3, 'Handle must be at least 3 characters')
  .max(30, 'Handle must be less than 30 characters')
  .regex(/^[a-z0-9-]+$/, 'Handle can only contain lowercase letters, numbers, and hyphens')
  .regex(/^[a-z]/, 'Handle must start with a letter')
  .regex(/[a-z0-9]$/, 'Handle must end with a letter or number')
  .refine((val) => !val.includes('--'), 'Handle cannot contain consecutive hyphens');

// ==================== URL Validation ====================
export const urlSchema = z.string()
  .min(1, 'URL is required')
  .refine(
    (val) => val.startsWith('http://') || val.startsWith('https://'),
    'URL must include protocol (http:// or https://)'
  )
  .refine(
    (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    },
    'Please enter a valid URL'
  );

export const optionalUrlSchema = z.string()
  .optional()
  .refine(
    (val) => !val || val.startsWith('http://') || val.startsWith('https://'),
    'URL must include protocol (http:// or https://)'
  )
  .refine(
    (val) => {
      if (!val) return true;
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    },
    'Please enter a valid URL'
  );

// ==================== Item Caps ====================
export const ITEM_CAPS = {
  featured_media: 3,
  product_cards: 6,
  links: 50,
  social_links: 20,
  primary_cta: 1,
  hero_card: 1,
  social_icon_row: 20,
  email_subscribe: 1,
  content_section: 10,
  product_catalog: 24,
  gallery: 20,
  video_feed: 12,
  // TL.EVNT — matches the gallery cap. An events list is read top-to-bottom on
  // a phone, and past events auto-hide on the public page, so the live count is
  // always well under this; the cap exists to bound the block, not to ration it.
  events: 20,
  text: 1,
} as const;

export type BlockType = keyof typeof ITEM_CAPS;

export function getItemCap(blockType: string): number {
  return ITEM_CAPS[blockType as BlockType] ?? 50;
}

// ==================== Image Validation ====================
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const;

// MEDIA.PHOTO.2 — HEIC/HEIF are admitted ONLY through validateImageFile's
// `allowHeic` (prepare-image.ts turns it on off-iOS, where it decodes them).
// Android often reports an empty MIME for HEIC, so the extension is the real tell.
const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'] as const;
const HEIC_EXTENSIONS = ['heic', 'heif'] as const;

// MEDIA.PHOTO.2 — every re-encoded image is bounded in PIXELS by
// prepare-image.ts (INPUT_MAX_BYTES gates the pick). The one byte cap left is
// the GIF's, because a GIF is uploaded as picked to keep its animation.
export const IMAGE_SIZE_LIMITS = {
  gif: 5 * 1024 * 1024, // 5MB
} as const;

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export interface ImageValidationOptions {
  /** Admit .heic/.heif (by MIME or extension). Off by default; never on iOS. */
  allowHeic?: boolean;
}

export function validateImageFile(
  file: File,
  maxSize: number,
  opts: ImageValidationOptions = {},
): ImageValidationResult {
  // Check file size
  if (file.size > maxSize) {
    const sizeMB = Math.round(maxSize / (1024 * 1024));
    return { valid: false, error: `Image must be less than ${sizeMB}MB` };
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  const heicByType = HEIC_TYPES.includes(file.type as typeof HEIC_TYPES[number]);
  const heicByExt = !!ext && HEIC_EXTENSIONS.includes(ext as typeof HEIC_EXTENSIONS[number]);
  if (opts.allowHeic && (heicByType || heicByExt)) {
    return { valid: true };
  }

  const allowedTypesMsg = opts.allowHeic
    ? 'Only JPEG, PNG, GIF, WebP, and HEIC images are allowed'
    : 'Only JPEG, PNG, GIF, and WebP images are allowed';

  // Check file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
    return { valid: false, error: allowedTypesMsg };
  }

  // Check file extension as backup
  if (!ext || !ALLOWED_IMAGE_EXTENSIONS.includes(ext as typeof ALLOWED_IMAGE_EXTENSIONS[number])) {
    return {
      valid: false,
      error: opts.allowHeic
        ? 'Invalid file extension. Use .jpg, .png, .gif, .webp, or .heic'
        : 'Invalid file extension. Use .jpg, .png, .gif, or .webp',
    };
  }

  return { valid: true };
}

// ==================== Text Validation ====================
export const displayNameSchema = z.string()
  .min(1, 'Display name is required')
  .max(50, 'Display name must be less than 50 characters')
  .transform((val) => val.trim());

export const bioSchema = z.string()
  .max(200, 'Bio must be less than 200 characters')
  .optional()
  .transform((val) => val?.trim());

export const labelSchema = z.string()
  .min(1, 'Label is required')
  .max(100, 'Label must be less than 100 characters')
  .transform((val) => val.trim());

export const subtitleSchema = z.string()
  .max(150, 'Subtitle must be less than 150 characters')
  .optional()
  .transform((val) => val?.trim());

export const badgeSchema = z.string()
  .max(20, 'Badge must be less than 20 characters')
  .optional()
  .transform((val) => val?.trim().toUpperCase());

// ==================== Helper Functions ====================
export function sanitizeHandle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isValidUrl(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateUrl(url: string): string | null {
  if (!url.trim()) {
    return 'URL is required';
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'URL must include protocol (http:// or https://)';
  }
  try {
    new URL(url);
    return null;
  } catch {
    return 'Please enter a valid URL';
  }
}

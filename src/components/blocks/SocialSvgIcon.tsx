import { PlatformIcon } from '@/components/PlatformIcon';

/**
 * Thin wrapper delegating to PlatformIcon (react-icons based) so every public
 * social block shares one icon source with full platform coverage. Preserves
 * the original { label, size, color } interface, so existing callers — and the
 * currentColor default — behave exactly as before.
 */
export function SocialSvgIcon({
  label,
  size = 20,
  color = 'currentColor',
}: {
  label: string;
  size?: number;
  color?: string;
}) {
  return <PlatformIcon label={label} size={size} color={color} />;
}

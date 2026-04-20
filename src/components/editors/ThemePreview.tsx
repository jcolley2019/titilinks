import { useState, type CSSProperties } from 'react';
import { type ThemeJson, applyAutoContrast } from '@/lib/theme-defaults';
import { PageBackground } from '@/components/PageBackground';
import { SmoothImage } from '@/components/SmoothImage';
import { DeviceFrame, DeviceSelector, type DeviceType } from '@/components/DeviceFrame';

interface ThemePreviewProps {
  theme: ThemeJson;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

function getPreviewTileStyle(theme: ThemeJson): CSSProperties {
  const b = theme.buttons;
  const radius = b.shape === 'pill' ? '9999px' : b.shape === 'square' ? '6px' : '16px';
  const border = b.border_enabled ? `2px solid ${b.border_color}` : 'none';
  return {
    backgroundColor: b.fill_color,
    color: b.text_color,
    borderRadius: radius,
    border,
    boxShadow: b.shadow_enabled ? '0 4px 14px rgba(0,0,0,0.15)' : undefined,
    padding: '12px 16px',
    textAlign: 'center',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  };
}

export function ThemePreview({ theme: rawTheme, displayName, bio, avatarUrl }: ThemePreviewProps) {
  const [deviceType, setDeviceType] = useState<DeviceType>('iphone');

  // Apply auto-contrast adjustments if enabled
  const theme = applyAutoContrast(rawTheme);

  // Font family mapping
  const fontFamily =
    theme.typography.font === 'inter'
      ? "'Inter', sans-serif"
      : theme.typography.font === 'system'
      ? 'system-ui, sans-serif'
      : theme.typography.font === 'serif'
      ? 'Georgia, serif'
      : 'monospace';

  return (
    <div className="flex flex-col h-full">
      {/* Device Frame Toggle */}
      <div className="flex items-center justify-center p-3 bg-muted/30 rounded-t-lg border border-b-0 border-border">
        <DeviceSelector value={deviceType} onChange={setDeviceType} />
      </div>

      {/* Preview Container */}
      <div className="relative flex-1 min-h-[500px] rounded-b-lg overflow-hidden border border-border bg-gradient-to-b from-muted/50 to-muted/20 flex items-start justify-center p-6">
        {/* Device Frame */}
        <DeviceFrame device={deviceType}>
          <PageBackground theme={theme}>
            <div
              className="mx-auto max-w-[340px] px-4 pb-8 pt-6 flex flex-col items-center min-h-full"
              style={{
                fontFamily,
                color: theme.typography.text_color,
              }}
            >
              {/* Avatar - Fixed size container */}
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/20 bg-white/10 flex items-center justify-center mb-4 flex-shrink-0">
                {avatarUrl ? (
                  <SmoothImage
                    src={avatarUrl}
                    alt={displayName || 'Profile'}
                    containerClassName="w-full h-full"
                    className="rounded-full"
                    skeletonClassName="rounded-full"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-2xl font-bold"
                    style={{
                      backgroundColor: theme.buttons.fill_color,
                      color: theme.buttons.text_color,
                    }}
                  >
                    {displayName?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </div>

              {/* Name */}
              <h2 className="text-xl font-bold mb-1" style={{ color: theme.typography.text_color }}>
                {displayName || 'Your Name'}
              </h2>

              {/* Bio */}
              <p
                className="text-sm text-center opacity-80 mb-6 max-w-[200px]"
                style={{ color: theme.typography.text_color }}
              >
                {bio || 'Your bio goes here'}
              </p>

              {/* Sample preview tiles — visual swatches, not actionable */}
              <div className="w-full space-y-3 max-w-[280px]">
                <div style={getPreviewTileStyle(theme)}>Primary Link</div>
                <div style={getPreviewTileStyle(theme)}>
                  <img
                    src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=80&h=80&fit=crop"
                    alt=""
                    style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                  Shop My Store
                </div>
                <div style={getPreviewTileStyle(theme)}>Follow Me</div>
              </div>

              {/* Footer label */}
              <div className="mt-8 text-xs opacity-50">
                Live Preview
              </div>
            </div>
          </PageBackground>
        </DeviceFrame>
      </div>
    </div>
  );
}

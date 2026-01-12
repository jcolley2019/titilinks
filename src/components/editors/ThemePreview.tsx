import { useState } from 'react';
import { type ThemeJson, applyAutoContrast } from '@/lib/theme-defaults';
import { PageBackground } from '@/components/PageBackground';
import { LinkButton } from '@/components/LinkButton';
import { DeviceFrame, DeviceSelector, type DeviceType } from '@/components/DeviceFrame';

interface ThemePreviewProps {
  theme: ThemeJson;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
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
              {/* Avatar */}
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/20 bg-white/10 flex items-center justify-center mb-4 flex-shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName || 'Profile'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
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

              {/* Sample Buttons using LinkButton */}
              <div className="w-full space-y-3 max-w-[280px]">
                <LinkButton theme={theme}>
                  <p className="font-medium">Primary Link</p>
                </LinkButton>
                <LinkButton theme={theme} leftThumbnail="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=80&h=80&fit=crop">
                  <p className="font-medium">Shop My Store</p>
                </LinkButton>
                <LinkButton theme={theme}>
                  <p className="font-medium">Follow Me</p>
                </LinkButton>
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

import { useState } from 'react';
import { type ThemeJson } from '@/lib/theme-defaults';
import { PageBackground } from '@/components/PageBackground';
import { LinkButton } from '@/components/LinkButton';
import { Smartphone, Tablet, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

type DeviceFrame = 'mobile' | 'tablet' | 'desktop';

interface ThemePreviewProps {
  theme: ThemeJson;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

export function ThemePreview({ theme, displayName, bio, avatarUrl }: ThemePreviewProps) {
  const [deviceFrame, setDeviceFrame] = useState<DeviceFrame>('mobile');

  // Font family mapping
  const fontFamily =
    theme.typography.font === 'inter'
      ? "'Inter', sans-serif"
      : theme.typography.font === 'system'
      ? 'system-ui, sans-serif'
      : theme.typography.font === 'serif'
      ? 'Georgia, serif'
      : 'monospace';

  // Device width mapping
  const getDeviceWidth = () => {
    switch (deviceFrame) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      case 'desktop':
        return '100%';
    }
  };

  const deviceOptions: { value: DeviceFrame; icon: typeof Smartphone; label: string }[] = [
    { value: 'mobile', icon: Smartphone, label: 'Mobile' },
    { value: 'tablet', icon: Tablet, label: 'Tablet' },
    { value: 'desktop', icon: Monitor, label: 'Desktop' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Device Frame Toggle */}
      <div className="flex items-center justify-center gap-1 p-2 bg-muted/50 rounded-t-lg border border-b-0 border-border">
        {deviceOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              onClick={() => setDeviceFrame(option.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                deviceFrame === option.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{option.label}</span>
            </button>
          );
        })}
      </div>

      {/* Preview Container */}
      <div className="relative flex-1 min-h-[400px] rounded-b-lg overflow-hidden border border-border bg-muted/30 flex items-start justify-center p-4">
        {/* Device Frame */}
        <div
          className={cn(
            'relative rounded-lg overflow-hidden border border-border/50 shadow-lg transition-all duration-200 ease-out',
            'motion-reduce:transition-none',
            deviceFrame !== 'desktop' && 'max-h-[600px]'
          )}
          style={{
            width: getDeviceWidth(),
            maxWidth: '100%',
          }}
        >
          <PageBackground theme={theme}>
            <div
              className="mx-auto max-w-[420px] px-4 pb-8 pt-8 flex flex-col items-center"
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
                Live Preview • {deviceFrame === 'mobile' ? '375px' : deviceFrame === 'tablet' ? '768px' : 'Full'}
              </div>
            </div>
          </PageBackground>
        </div>
      </div>
    </div>
  );
}

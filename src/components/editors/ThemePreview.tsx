import { type ThemeJson } from '@/lib/theme-defaults';
import { PageBackground } from '@/components/PageBackground';

interface ThemePreviewProps {
  theme: ThemeJson;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

export function ThemePreview({ theme, displayName, bio, avatarUrl }: ThemePreviewProps) {
  // Font family mapping
  const fontFamily =
    theme.typography.font === 'inter'
      ? "'Inter', sans-serif"
      : theme.typography.font === 'system'
      ? 'system-ui, sans-serif'
      : theme.typography.font === 'serif'
      ? 'Georgia, serif'
      : 'monospace';

  // Button styles
  const buttonStyle = {
    backgroundColor: theme.buttons.fill_color,
    color: theme.buttons.text_color,
    borderRadius:
      theme.buttons.shape === 'pill'
        ? '9999px'
        : theme.buttons.shape === 'rounded'
        ? '16px'
        : '6px',
    border: theme.buttons.border_enabled
      ? `1px solid ${theme.buttons.border_color}`
      : 'none',
    boxShadow: theme.buttons.shadow_enabled
      ? '0 4px 14px rgba(0,0,0,0.25)'
      : 'none',
    padding:
      theme.buttons.density === 'compact'
        ? '0.5rem 1rem'
        : theme.buttons.density === 'roomy'
        ? '1rem 1.5rem'
        : '0.75rem 1.25rem',
  };

  return (
    <div className="relative w-full min-h-[400px] rounded-lg overflow-hidden border border-border">
      <PageBackground theme={theme}>
        <div
          className="mx-auto max-w-[420px] px-4 pb-8 pt-8 flex flex-col items-center"
          style={{
            fontFamily,
            color: theme.typography.text_color,
          }}
        >
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/20 bg-white/10 flex items-center justify-center mb-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName || 'Profile'}
                className="w-full h-full object-cover"
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

          {/* Sample Buttons */}
          <div className="w-full space-y-3 max-w-[280px]">
            <button className="w-full font-medium transition-all" style={buttonStyle}>
              Primary Link
            </button>
            <button className="w-full font-medium transition-all" style={buttonStyle}>
              Shop My Store
            </button>
            <button className="w-full font-medium transition-all" style={buttonStyle}>
              Follow Me
            </button>
          </div>

          {/* Footer label */}
          <div className="mt-8 text-xs opacity-50">
            Live Preview
          </div>
        </div>
      </PageBackground>
    </div>
  );
}

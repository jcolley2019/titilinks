import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type DeviceType = 'iphone' | 'android' | 'none';

interface DeviceFrameProps {
  children: ReactNode;
  device: DeviceType;
  className?: string;
}

export function DeviceFrame({ children, device, className }: DeviceFrameProps) {
  if (device === 'none') {
    return (
      <div 
        className={cn(
          'w-[375px] max-w-full overflow-hidden rounded-lg border border-border/50 shadow-lg',
          className
        )}
        style={{ maxHeight: '700px' }}
      >
        <div className="h-full overflow-y-auto scrollbar-hide">
          {children}
        </div>
      </div>
    );
  }

  if (device === 'iphone') {
    return (
      <div className={cn('relative', className)}>
        {/* iPhone Frame */}
        <div 
          className="relative bg-[#1a1a1a] rounded-[48px] p-3 shadow-2xl"
          style={{
            width: '390px',
            maxWidth: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(255,255,255,0.1)',
          }}
        >
          {/* Side Buttons - Left (Silent, Volume) */}
          <div className="absolute left-[-3px] top-[120px] w-[3px] h-[28px] bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute left-[-3px] top-[160px] w-[3px] h-[48px] bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute left-[-3px] top-[215px] w-[3px] h-[48px] bg-[#2a2a2a] rounded-l-sm" />
          
          {/* Side Button - Right (Power) */}
          <div className="absolute right-[-3px] top-[180px] w-[3px] h-[75px] bg-[#2a2a2a] rounded-r-sm" />

          {/* Inner Frame with Screen */}
          <div 
            className="relative bg-black rounded-[38px] overflow-hidden"
            style={{ 
              height: '700px',
              maxHeight: 'calc(100vh - 200px)',
            }}
          >
            {/* Dynamic Island */}
            <div className="absolute top-[12px] left-1/2 -translate-x-1/2 z-20">
              <div 
                className="bg-black rounded-full flex items-center justify-center"
                style={{ 
                  width: '126px', 
                  height: '37px',
                }}
              >
                {/* Camera dot */}
                <div className="w-3 h-3 rounded-full bg-[#1a1a2e] ml-8 ring-1 ring-[#2a2a3a]" />
              </div>
            </div>

            {/* Screen Content */}
            <div className="h-full w-full overflow-y-auto scrollbar-hide pt-[50px]">
              {children}
            </div>

            {/* Home Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[5px] bg-white/30 rounded-full z-20" />
          </div>
        </div>

        {/* Reflection overlay */}
        <div 
          className="absolute inset-0 pointer-events-none rounded-[48px]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, transparent 100%)',
          }}
        />
      </div>
    );
  }

  // Android Device Frame
  return (
    <div className={cn('relative', className)}>
      {/* Android Frame */}
      <div 
        className="relative bg-[#1f1f1f] rounded-[32px] p-2 shadow-2xl"
        style={{
          width: '380px',
          maxWidth: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Side Buttons */}
        <div className="absolute right-[-3px] top-[100px] w-[3px] h-[50px] bg-[#2a2a2a] rounded-r-sm" />
        <div className="absolute right-[-3px] top-[165px] w-[3px] h-[80px] bg-[#2a2a2a] rounded-r-sm" />

        {/* Inner Frame with Screen */}
        <div 
          className="relative bg-black rounded-[26px] overflow-hidden"
          style={{ 
            height: '700px',
            maxHeight: 'calc(100vh - 200px)',
          }}
        >
          {/* Status Bar Area with Camera Punch Hole */}
          <div className="absolute top-0 left-0 right-0 h-[28px] z-20 flex items-center justify-center">
            {/* Center punch-hole camera */}
            <div 
              className="w-[12px] h-[12px] rounded-full bg-[#0a0a0a] ring-1 ring-[#1a1a1a]"
              style={{ marginTop: '8px' }}
            />
          </div>

          {/* Screen Content */}
          <div className="h-full w-full overflow-y-auto scrollbar-hide pt-[32px]">
            {children}
          </div>

          {/* Android Navigation Bar (Gesture indicator) */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[100px] h-[4px] bg-white/20 rounded-full z-20" />
        </div>
      </div>

      {/* Subtle reflection */}
      <div 
        className="absolute inset-0 pointer-events-none rounded-[32px]"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, transparent 40%, transparent 100%)',
        }}
      />
    </div>
  );
}

// Device selector component
interface DeviceSelectorProps {
  value: DeviceType;
  onChange: (device: DeviceType) => void;
}

export function DeviceSelector({ value, onChange }: DeviceSelectorProps) {
  const devices: { id: DeviceType; label: string; icon: ReactNode }[] = [
    { 
      id: 'iphone', 
      label: 'iPhone',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <line x1="12" y1="18" x2="12" y2="18.01" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ),
    },
    { 
      id: 'android', 
      label: 'Android',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <circle cx="12" cy="7" r="1" fill="currentColor" />
        </svg>
      ),
    },
    { 
      id: 'none', 
      label: 'None',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
      {devices.map((device) => (
        <button
          key={device.id}
          onClick={() => onChange(device.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === device.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          )}
        >
          {device.icon}
          <span className="hidden sm:inline">{device.label}</span>
        </button>
      ))}
    </div>
  );
}

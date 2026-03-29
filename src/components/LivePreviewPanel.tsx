import { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LivePreviewPanelProps {
  handle: string;
  className?: string;
  externalRefreshKey?: number;
}

export function LivePreviewPanel({ handle, className, externalRefreshKey = 0 }: LivePreviewPanelProps) {
  const [internalKey, setInternalKey] = useState(0);
  const refreshKey = internalKey + externalRefreshKey;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const profileUrl = `${window.location.protocol}//${window.location.host}/${handle}`;

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setIsRefreshing(false), 1000);
  }, []);

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Refresh button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        className="gap-2 self-center"
      >
        <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        Refresh Preview
      </Button>

      {/* iPhone-style frame */}
      <div className="relative">
        <div
          className="relative bg-[#1a1a1a] rounded-[3rem] p-[3px]"
          style={{
            width: '390px',
            boxShadow:
              '0 25px 60px -12px rgba(0,0,0,0.5), inset 0 0 0 1.5px rgba(255,255,255,0.08)',
          }}
        >
          {/* Side Buttons */}
          <div className="absolute left-[-2.5px] top-[100px] w-[2.5px] h-[24px] bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute left-[-2.5px] top-[135px] w-[2.5px] h-[42px] bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute left-[-2.5px] top-[185px] w-[2.5px] h-[42px] bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute right-[-2.5px] top-[155px] w-[2.5px] h-[65px] bg-[#2a2a2a] rounded-r-sm" />

          {/* Screen */}
          <div
            className="relative bg-black rounded-[2.75rem] overflow-hidden"
            style={{ height: '844px' }}
          >
            {/* Dynamic Island */}
            <div className="absolute top-[10px] left-1/2 -translate-x-1/2 z-20">
              <div
                className="bg-black rounded-full flex items-center justify-center"
                style={{ width: '110px', height: '32px' }}
              >
                <div className="w-[10px] h-[10px] rounded-full bg-[#1a1a2e] ml-7 ring-1 ring-[#2a2a3a]" />
              </div>
            </div>

            {/* Iframe content */}
            <iframe
              key={refreshKey}
              src={profileUrl}
              className="w-full h-full border-0 rounded-[2.75rem]"
              title="Profile Preview"
              style={{ colorScheme: 'normal' }}
            />

            {/* Home Indicator */}
            <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-[100px] h-[4px] bg-white/25 rounded-full z-20 pointer-events-none" />
          </div>
        </div>

        {/* Reflection */}
        <div
          className="absolute inset-0 pointer-events-none rounded-[3rem]"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%)',
          }}
        />
      </div>
    </div>
  );
}

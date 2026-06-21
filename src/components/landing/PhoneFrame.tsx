import type { ReactNode } from 'react';

// Reusable iPhone chrome for the landing page — lifted from the hero so the
// menu showcase frames its screens identically. Renders a 320×664 device and
// scales the whole thing to `displayWidth`; children fill the 640px screen.

const BG = 'hsl(30 15% 6%)';
const PHONE_BASE_W = 320;
const PHONE_BASE_H = 664; // 640 screen + 12px bezel top/bottom

export function PhoneFrame({ displayWidth, children }: { displayWidth: number; children: ReactNode }) {
  const scale = displayWidth / PHONE_BASE_W;
  return (
    <div style={{ width: displayWidth, height: PHONE_BASE_H * scale }}>
      <div style={{ width: PHONE_BASE_W, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <div
          className="relative rounded-[48px] p-3"
          style={{
            backgroundColor: '#1a1a1a',
            boxShadow:
              '0 25px 50px -12px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.1), 0 0 55px -10px rgba(201,165,92,0.3)',
          }}
        >
          {/* Side buttons */}
          <div className="absolute left-[-3px] top-[120px] h-[28px] w-[3px] rounded-l-sm bg-[#2a2a2a]" />
          <div className="absolute left-[-3px] top-[160px] h-[48px] w-[3px] rounded-l-sm bg-[#2a2a2a]" />
          <div className="absolute left-[-3px] top-[215px] h-[48px] w-[3px] rounded-l-sm bg-[#2a2a2a]" />
          <div className="absolute right-[-3px] top-[180px] h-[75px] w-[3px] rounded-r-sm bg-[#2a2a2a]" />

          {/* Screen */}
          <div className="relative overflow-hidden rounded-[38px]" style={{ height: '640px', backgroundColor: BG }}>
            {/* Dynamic island */}
            <div className="absolute left-1/2 top-[12px] z-20 -translate-x-1/2">
              <div className="flex h-[37px] w-[126px] items-center justify-center rounded-full bg-black">
                <div className="ml-8 h-3 w-3 rounded-full bg-[#1a1a2e] ring-1 ring-[#2a2a3a]" />
              </div>
            </div>
            {children}
            {/* Home indicator */}
            <div className="absolute bottom-2 left-1/2 z-20 h-[5px] w-[120px] -translate-x-1/2 rounded-full bg-white/30" />
          </div>

          {/* Reflection */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[48px]"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, transparent 100%)' }}
          />
        </div>
      </div>
    </div>
  );
}

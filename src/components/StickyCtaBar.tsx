import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { LinkButton } from '@/components/LinkButton';
import type { ThemeJson } from '@/lib/theme-defaults';

interface StickyCtaBarProps {
  enabled: boolean;
  ctaLabel: string;
  ctaUrl: string;
  theme: ThemeJson;
  onOutboundClick: () => void;
}

export function StickyCtaBar({ 
  enabled, 
  ctaLabel, 
  ctaUrl, 
  theme,
  onOutboundClick 
}: StickyCtaBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setupObserver = useCallback(() => {
    // Find the primary CTA block
    const ctaBlock = document.querySelector('[data-block-type="primary_cta"]');
    if (!ctaBlock) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        // Show sticky bar when CTA block is NOT visible (scrolled past)
        setIsVisible(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '-10% 0px 0px 0px',
      }
    );

    observerRef.current.observe(ctaBlock);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsVisible(false);
      return;
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(setupObserver, 100);

    return () => {
      clearTimeout(timer);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enabled, setupObserver]);

  if (!enabled || !isVisible) return null;

  const handleClick = () => {
    onOutboundClick();
  };

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3',
        'bg-gradient-to-t from-black/80 via-black/60 to-transparent',
        // GPU-accelerated slide-up animation
        'animate-slide-up-fade transform-gpu will-change-transform',
        // Reduced motion: just fade
        'motion-reduce:animate-mode-fade motion-reduce:transform-none'
      )}
    >
      <div className="max-w-[640px] mx-auto">
        <LinkButton
          as="a"
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          theme={theme}
          title={ctaLabel}
          size="button"
          onClick={handleClick}
        />
      </div>
    </div>
  );
}

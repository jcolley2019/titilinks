/**
 * Haptic Feedback Hook
 * 
 * Provides subtle haptic feedback for mobile press interactions using the Vibration API.
 * - Gracefully degrades on unsupported devices
 * - Respects prefers-reduced-motion
 * - Fire-and-forget pattern
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error';

const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,      // Quick tap
  medium: 25,     // Standard press
  heavy: 50,      // Strong feedback
  success: [10, 50, 20], // Double pulse
  error: [50, 30, 50, 30, 50], // Triple warning
};

/**
 * Check if haptic feedback is available and allowed
 */
function canVibrate(): boolean {
  // Check for Vibration API support
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return false;
  }
  
  // Check for reduced motion preference
  if (typeof window !== 'undefined') {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (prefersReducedMotion.matches) {
      return false;
    }
  }
  
  return true;
}

/**
 * Trigger haptic feedback
 */
export function triggerHaptic(pattern: HapticPattern = 'light'): void {
  if (!canVibrate()) return;
  
  try {
    navigator.vibrate(HAPTIC_PATTERNS[pattern]);
  } catch {
    // Silently fail - haptic feedback is non-critical
  }
}

/**
 * Hook for haptic feedback in React components
 */
export function useHapticFeedback() {
  const trigger = (pattern: HapticPattern = 'light') => {
    triggerHaptic(pattern);
  };

  const lightTap = () => trigger('light');
  const mediumTap = () => trigger('medium');
  const heavyTap = () => trigger('heavy');
  const successFeedback = () => trigger('success');
  const errorFeedback = () => trigger('error');

  return {
    trigger,
    lightTap,
    mediumTap,
    heavyTap,
    successFeedback,
    errorFeedback,
    canVibrate: canVibrate(),
  };
}

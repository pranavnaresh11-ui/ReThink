/**
 * Web stand-in for CoreHaptics. navigator.vibrate works on Android Chrome; iOS Safari
 * ignores it, which is one reason the production build is native.
 */
export function haptic(pattern: number | readonly number[]): void {
  // Browsers block vibration until the user has interacted with the page.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate?.(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    /* unsupported */
  }
}

export const HAPTICS = {
  tap: 12,
  success: [30, 60, 30, 60, 80],
  warn: [80, 50, 80],
  /** A rising pulse to pace a 4-second inhale. */
  inhale: [20, 380, 30, 330, 40, 280, 50, 230, 60, 180],
  exhale: [60, 240, 50, 290, 40, 340, 30, 390, 20],
} as const;

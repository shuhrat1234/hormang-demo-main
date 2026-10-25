/**
 * Micro-haptics utility following Apple & mobile-native craft standards.
 * Triggers ultra-short vibration pulses on supported touch devices for tactile confirmation.
 * Safely no-ops in desktop environments or devices without vibration hardware.
 */

export type HapticFeedbackType = "light" | "medium" | "heavy" | "success" | "error";

export function triggerHaptic(type: HapticFeedbackType = "light"): void {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !("vibrate" in navigator)) {
    return;
  }

  try {
    switch (type) {
      case "light":
        navigator.vibrate(10);
        break;
      case "medium":
        navigator.vibrate(18);
        break;
      case "heavy":
        navigator.vibrate(28);
        break;
      case "success":
        navigator.vibrate([10, 30, 15]);
        break;
      case "error":
        navigator.vibrate([20, 40, 20]);
        break;
    }
  } catch {
    // Graceful no-op if blocked by browser policy
  }
}

"use client";

/**
 * Every key this game writes is namespaced, so a reset is a prefix sweep —
 * new keys are covered automatically, and anything else on the origin is left
 * alone.
 */
export const STORAGE_PREFIX = "guessable:";

/** Wipe stats, progress, settings and volume. Returns how many keys went. */
export function clearStoredData(): number {
  if (typeof window === "undefined") return 0;
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
    for (const key of keys) localStorage.removeItem(key);
    return keys.length;
  } catch {
    // storage unavailable — nothing to clear
    return 0;
  }
}

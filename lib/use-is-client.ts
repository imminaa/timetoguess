"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * False during SSR/hydration, true on the client — the sanctioned
 * useSyncExternalStore escape hatch for client-only content (localStorage
 * reads) without a set-state-in-effect cascade or hydration mismatch.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

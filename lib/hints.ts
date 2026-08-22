/**
 * Progressive hint ladder — safe to import from both server and client code.
 *
 * The ladder is fixed and escalates in specificity. Both `/api/round` and
 * `/api/hint` derive a round's available rungs from the decrypted answer via
 * `availableHints`, so client and server agree on labels and indices without
 * any extra state.
 */

export type HintType = "decade" | "genre" | "art" | "letter";

export const HINT_LADDER: { id: HintType; label: string }[] = [
  { id: "decade", label: "decade" },
  { id: "genre", label: "genre" },
  { id: "art", label: "album art" },
  { id: "letter", label: "first letter" },
];

interface HintSource {
  title: string;
  year: number | null;
  genre: string | null;
  artUrl: string | null;
}

/** The rungs this round can actually offer, in ladder order. */
export function availableHints(a: {
  year: number | null;
  genre: string | null;
  artUrl: string | null;
}): HintType[] {
  return HINT_LADDER.filter(({ id }) => {
    if (id === "decade") return a.year != null;
    if (id === "genre") return a.genre != null;
    if (id === "art") return a.artUrl != null;
    return true; // letter — a title always exists
  }).map(({ id }) => id);
}

export function hintLabel(type: HintType): string {
  return HINT_LADDER.find((h) => h.id === type)!.label;
}

/** Text for the non-image rungs. Callers must not pass "art". */
export function resolveHintText(a: HintSource, type: Exclude<HintType, "art">): string {
  switch (type) {
    case "decade":
      return `${Math.floor(a.year! / 10) * 10}s`;
    case "genre":
      return a.genre!;
    case "letter":
      return a.title.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? a.title[0] ?? "?";
  }
}

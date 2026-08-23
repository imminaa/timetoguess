import type { WrongGuess } from "@/lib/use-game-engine";

/**
 * The board, as rows.
 *
 * A guessing game reads as a game when you can see the attempts you have left,
 * so every skin renders one row per stage rather than a pile of chips after
 * the fact. `wrongGuesses[i]` is whatever was spent at stage `i` — each wrong
 * guess and each skip advances exactly one stage, so the indices line up.
 */

export interface Slot {
  /** Snippet length this row buys, in seconds. */
  seconds: number;
  state: "spent" | "current" | "locked";
  /** What was played here, if anything. */
  label?: string;
  kind?: "wrong" | "skip";
}

export function attemptSlots(
  stages: number[],
  currentIndex: number,
  wrongGuesses: WrongGuess[]
): Slot[] {
  return stages.map((seconds, i) => {
    const spent = wrongGuesses[i];
    if (spent) {
      return { seconds, state: "spent", label: spent.label, kind: spent.kind };
    }
    return { seconds, state: i === currentIndex ? "current" : "locked" };
  });
}

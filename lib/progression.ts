import { DIFFICULTIES, type Difficulty } from "@/lib/game-config";

/**
 * Ladder progression: you start on Easy; 2 wins at a tier promote you,
 * 2 consecutive losses demote you. Jumping tiers manually resets the pips.
 */

export const WINS_TO_PROMOTE = 2;
export const LOSSES_TO_DEMOTE = 2;

export interface Progress {
  tier: Difficulty;
  wins: number;
  losses: number;
}

export interface ProgressUpdate {
  progress: Progress;
  promoted: boolean;
  demoted: boolean;
}

export function initialProgress(): Progress {
  return { tier: "easy", wins: 0, losses: 0 };
}

function tierIndex(tier: Difficulty): number {
  return DIFFICULTIES.findIndex((d) => d.id === tier);
}

export function applyResult(progress: Progress, won: boolean): ProgressUpdate {
  const index = tierIndex(progress.tier);
  if (won) {
    const wins = progress.wins + 1;
    if (wins >= WINS_TO_PROMOTE && index < DIFFICULTIES.length - 1) {
      return {
        progress: { tier: DIFFICULTIES[index + 1].id, wins: 0, losses: 0 },
        promoted: true,
        demoted: false,
      };
    }
    // Wins at the top tier keep counting toward nothing — stay put, clear losses.
    return {
      progress: { ...progress, wins: Math.min(wins, WINS_TO_PROMOTE - 1), losses: 0 },
      promoted: false,
      demoted: false,
    };
  }
  const losses = progress.losses + 1;
  if (losses >= LOSSES_TO_DEMOTE && index > 0) {
    return {
      progress: { tier: DIFFICULTIES[index - 1].id, wins: 0, losses: 0 },
      promoted: false,
      demoted: true,
    };
  }
  return {
    progress: { ...progress, losses: Math.min(losses, LOSSES_TO_DEMOTE - 1), wins: 0 },
    promoted: false,
    demoted: false,
  };
}

/** Manual jump to a tier from the ladder. */
export function jumpTo(tier: Difficulty): Progress {
  return { tier, wins: 0, losses: 0 };
}

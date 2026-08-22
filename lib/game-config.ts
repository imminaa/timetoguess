/**
 * Shared game configuration — safe to import from both server and client code.
 */

export const STAGES = [0.01, 0.1, 0.5, 2, 8, 15] as const;

/** Stages that are off until you turn them on. 0.01s is a joke, not a game. */
export const DEFAULT_DISABLED_STAGES: readonly number[] = [0.01];

export type Difficulty = "easy" | "medium" | "hard" | "expert" | "impossible";

export interface DifficultyMeta {
  id: Difficulty;
  label: string;
  tagline: string;
}

export const DIFFICULTIES: DifficultyMeta[] = [
  {
    id: "easy",
    label: "Easy",
    tagline: "The songs everybody knows",
  },
  {
    id: "medium",
    label: "Medium",
    tagline: "Big songs, slightly off the A-list",
  },
  {
    id: "hard",
    label: "Hard",
    tagline: "Fan favourites from well-known artists",
  },
  {
    id: "expert",
    label: "Expert",
    tagline: "Album deep cuts of artists you know",
  },
  {
    id: "impossible",
    label: "Impossible",
    tagline: "Certified obscurities. Good luck.",
  },
];

export function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.some((d) => d.id === value);
}

export function difficultyMeta(id: Difficulty): DifficultyMeta {
  return DIFFICULTIES.find((d) => d.id === id)!;
}

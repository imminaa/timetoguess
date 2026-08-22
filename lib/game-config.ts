/**
 * Shared game configuration — safe to import from both server and client code.
 */

export const STAGES = [0.01, 0.1, 0.5, 2, 8, 15] as const;

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
    tagline: "Today's chart megahits",
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

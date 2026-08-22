"use client";

import { STAGES } from "@/lib/game-config";

const STATS_KEY = "guessable:stats:v1";

export interface Stats {
  plays: number;
  wins: number;
  streak: number;
  bestStreak: number;
  /** Wins indexed by the stage they were won at. */
  stageWins: number[];
}

function emptyStats(): Stats {
  return {
    plays: 0,
    wins: 0,
    streak: 0,
    bestStreak: 0,
    stageWins: Array.from(STAGES, () => 0),
  };
}

export function loadStats(): Stats {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return { ...emptyStats(), ...parsed };
  } catch {
    return emptyStats();
  }
}

function save(stats: Stats): Stats {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // storage unavailable — stats just won't persist
  }
  return stats;
}

export function recordWin(stageIndex: number): Stats {
  const stats = loadStats();
  stats.plays += 1;
  stats.wins += 1;
  stats.streak += 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  stats.stageWins[stageIndex] = (stats.stageWins[stageIndex] ?? 0) + 1;
  return save(stats);
}

export function recordLoss(): Stats {
  const stats = loadStats();
  stats.plays += 1;
  stats.streak = 0;
  return save(stats);
}

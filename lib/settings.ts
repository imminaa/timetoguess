"use client";

import { DEFAULT_DISABLED_STAGES, STAGES } from "@/lib/game-config";

const SETTINGS_KEY = "guessable:settings:v1";
const PROGRESS_KEY = "guessable:progress:v1";

import { initialProgress, type Progress } from "@/lib/progression";
import { isDifficulty } from "@/lib/game-config";
import {
  DECADES,
  GENRE_FAMILIES,
  isDecade,
  isGenreFamilyId,
  normalizeFilter,
  type CatalogFilter,
  type GenreFamilyId,
} from "@/lib/music-taxonomy";

export interface Settings {
  /** Which stage lengths are in play, ascending. Always at least one. */
  enabledStages: number[];
  /** Genre families that may be drawn from. Always at least one. */
  genres: GenreFamilyId[];
  /** Decades that may be drawn from, ascending. Always at least one. */
  decades: number[];
}

export function defaultSettings(): Settings {
  return {
    enabledStages: STAGES.filter((s) => !DEFAULT_DISABLED_STAGES.includes(s)),
    genres: GENRE_FAMILIES.map((f) => f.id),
    decades: [...DECADES],
  };
}

/**
 * Keep only recognized values, and fall back to "everything" for an axis that
 * ends up empty. An empty list would otherwise be indistinguishable from an
 * impossible filter, and would leave the player with no way to start a round
 * except the reset button.
 */
function validList<T>(
  values: unknown,
  isValid: (v: T) => boolean,
  fallback: T[],
  sort?: (a: T, b: T) => number
): T[] {
  if (!Array.isArray(values)) return fallback;
  const kept = [...new Set(values as T[])].filter(isValid);
  if (kept.length === 0) return fallback;
  return sort ? kept.sort(sort) : kept;
}

export function loadSettings(): Settings {
  const defaults = defaultSettings();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      // Settings saved before the filters existed carry neither key, so each
      // axis falls back independently rather than discarding the whole record.
      enabledStages: validList<number>(
        parsed.enabledStages,
        (s) => (STAGES as readonly number[]).includes(s),
        defaults.enabledStages,
        (a, b) => a - b
      ),
      genres: validList<GenreFamilyId>(parsed.genres, isGenreFamilyId, defaults.genres),
      decades: validList<number>(parsed.decades, isDecade, defaults.decades, (a, b) => a - b),
    };
  } catch {
    return defaults;
  }
}

/** The stored selection as a draw restriction — see lib/music-taxonomy.ts. */
export function settingsFilter(settings: Settings): CatalogFilter {
  return normalizeFilter({ genres: settings.genres, decades: settings.decades });
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — settings just won't persist
  }
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return initialProgress();
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return initialProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (!parsed.tier || !isDifficulty(parsed.tier)) return initialProgress();
    return {
      tier: parsed.tier,
      wins: typeof parsed.wins === "number" ? parsed.wins : 0,
      losses: typeof parsed.losses === "number" ? parsed.losses : 0,
    };
  } catch {
    return initialProgress();
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // storage unavailable — progress just won't persist
  }
}

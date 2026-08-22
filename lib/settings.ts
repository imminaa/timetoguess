"use client";

import { STAGES } from "@/lib/game-config";

const SETTINGS_KEY = "guessable:settings:v1";
const PROGRESS_KEY = "guessable:progress:v1";

import { initialProgress, type Progress } from "@/lib/progression";
import { isDifficulty } from "@/lib/game-config";

export interface Settings {
  /** Which stage lengths are in play, ascending. Always at least one. */
  enabledStages: number[];
}

export function defaultSettings(): Settings {
  return { enabledStages: [...STAGES] };
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const valid = (parsed.enabledStages ?? []).filter((s) =>
      (STAGES as readonly number[]).includes(s)
    );
    return valid.length > 0 ? { enabledStages: valid.sort((a, b) => a - b) } : defaultSettings();
  } catch {
    return defaultSettings();
  }
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

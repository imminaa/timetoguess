"use client";

import { useCallback, useState } from "react";
import { STAGES, difficultyMeta, type Difficulty } from "@/lib/game-config";
import type { HintType } from "@/lib/hints";
import {
  applyResult,
  initialProgress,
  jumpTo,
  spendWin,
  type Progress,
} from "@/lib/progression";
import {
  filterToParams,
  type GenreFamilyId,
} from "@/lib/music-taxonomy";
import {
  defaultSettings,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  settingsFilter,
  type Settings,
} from "@/lib/settings";
import { loadStats, recordLoss, recordWin, type Stats } from "@/lib/stats";
import { clearStoredData } from "@/lib/storage";
import type {
  GuessResponse,
  HintResponse,
  PublicAnswer,
  RoundData,
  SearchResult,
} from "@/lib/types";
import { useIsClient } from "@/lib/use-is-client";
import { DEFAULT_VOLUME, usePreviewPlayer, type PreviewPlayer } from "@/lib/use-preview-player";

/**
 * Every rule of a round, with no opinion about how it looks.
 *
 * The game is one screen in three phases, and each phase needs the same eight
 * or so fetches, timers and localStorage round-trips no matter how it is
 * skinned. Keeping them here is what lets a second presentation exist without
 * a second copy of the iOS audio-unlock ordering or the promote/demote maths.
 */

export type RoundResult = "won" | "lost" | "gaveup";

export interface TierChange {
  kind: "promoted" | "demoted";
  tierLabel: string;
}

export type Phase =
  | { kind: "home" }
  | { kind: "loading"; difficulty: Difficulty }
  | { kind: "playing"; difficulty: Difficulty; round: RoundData; stageIndex: number }
  | {
      kind: "reveal";
      difficulty: Difficulty;
      result: RoundResult;
      wonAtSeconds?: number;
      answer: PublicAnswer;
      tierChange: TierChange | null;
    };

export interface WrongGuess {
  key: number;
  label: string;
  kind: "wrong" | "skip";
}

export interface RevealedHint {
  key: number;
  type: HintType;
  text?: string;
}

export interface GameEngine {
  phase: Phase;
  /** Non-null only while a round is in progress — narrows `phase` for callers. */
  playing: Extract<Phase, { kind: "playing" }> | null;
  player: PreviewPlayer;
  stats: Stats | null;
  progress: Progress | null;
  /** Stored settings — stage lengths plus the genre/decade draw filters. */
  settings: Settings;
  /** Stored progress, or the new-player state so SSR renders real markup. */
  homeProgress: Progress;
  tier: Difficulty;
  stages: number[];
  /** Stage index, clamped in case settings shrank the ladder mid-round. */
  currentIndex: number;
  /** The stage a skip would buy, or null on the last one. */
  nextStage: number | null;
  nextHintType: HintType | null;
  wrongGuesses: WrongGuess[];
  revealedHints: RevealedHint[];
  error: string | null;
  /** Bumped on every wrong guess, for a "shake the input" animation. */
  shakeSignal: number;
  busy: boolean;
  startRound: (difficulty: Difficulty) => Promise<void>;
  submitGuess: (guess: SearchResult) => Promise<void>;
  revealAnswer: (result: RoundResult) => Promise<void>;
  takeHint: () => Promise<void>;
  skipStage: () => void;
  goHome: () => void;
  jumpTier: (tier: Difficulty) => void;
  toggleStage: (seconds: number) => void;
  toggleGenre: (id: GenreFamilyId) => void;
  toggleDecade: (decade: number) => void;
  resetEverything: () => void;
  dismissError: () => void;
}

export function useGameEngine(): GameEngine {
  const isClient = useIsClient();
  const [phase, setPhase] = useState<Phase>({ kind: "home" });
  const [progressState, setProgress] = useState<Progress | null>(null);
  const [settingsState, setSettings] = useState<Settings | null>(null);
  const [wrongGuesses, setWrongGuesses] = useState<WrongGuess[]>([]);
  const [revealedHints, setRevealedHints] = useState<RevealedHint[]>([]);
  const [statsState, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shakeSignal, setShakeSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const player = usePreviewPlayer();

  // Until first mutation, fall through to localStorage (client only).
  const stats = statsState ?? (isClient ? loadStats() : null);
  const progress = progressState ?? (isClient ? loadProgress() : null);
  const settings = settingsState ?? (isClient ? loadSettings() : defaultSettings());
  const stages = settings.enabledStages;

  const clampIndex = useCallback(
    (index: number) => Math.min(index, stages.length - 1),
    [stages.length]
  );

  /**
   * Flip one value of a multi-select setting, refusing to empty it.
   *
   * An empty axis is not "no restriction" here, it is "nothing may be drawn":
   * clearing every genre would leave a player unable to start a round at all,
   * with the settings panel the only way back. Every axis keeps a last member.
   */
  const toggleSetting = useCallback(
    <K extends "enabledStages" | "genres" | "decades">(
      axis: K,
      value: Settings[K][number],
      sort?: (a: Settings[K][number], b: Settings[K][number]) => number
    ) => {
      setSettings((prev) => {
        const current = prev ?? loadSettings();
        const list = current[axis] as Settings[K][number][];
        const next = list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value];
        if (next.length === 0) return current;
        if (sort) next.sort(sort);
        // saveSettings replaces the whole record — carry the other axes through.
        const updated = { ...current, [axis]: next };
        saveSettings(updated);
        return updated;
      });
    },
    []
  );

  const numeric = (a: number, b: number) => a - b;

  const toggleStage = useCallback(
    (seconds: number) => toggleSetting("enabledStages", seconds, numeric),
    [toggleSetting]
  );

  const toggleGenre = useCallback(
    (id: GenreFamilyId) => toggleSetting("genres", id),
    [toggleSetting]
  );

  const toggleDecade = useCallback(
    (decade: number) => toggleSetting("decades", decade, numeric),
    [toggleSetting]
  );

  const startRound = useCallback(
    async (difficulty: Difficulty) => {
      // Must happen before the first await: iOS only starts an AudioContext
      // from the synchronous part of a user gesture, and fetching the round
      // would spend it. Without this the first round is silent.
      player.unlock();
      setError(null);
      setWrongGuesses([]);
      setRevealedHints([]);
      player.reset();
      setPhase({ kind: "loading", difficulty });
      try {
        const params = new URLSearchParams({ difficulty });
        filterToParams(settingsFilter(settings), params);
        const res = await fetch(`/api/round?${params}`);
        const data = (await res.json()) as RoundData & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not start a round");
        await player.load(data.audioUrl);
        setPhase({ kind: "playing", difficulty, round: data, stageIndex: 0 });
        player.play(stages[0]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start a round");
        setPhase({ kind: "home" });
      }
    },
    [player, stages, settings]
  );

  const finishRound = useCallback(
    (
      result: RoundResult,
      answer: PublicAnswer,
      difficulty: Difficulty,
      wonAtSeconds?: number
    ) => {
      player.stop();
      const won = result === "won";
      const hintsUsed = revealedHints.length;
      setStats(
        won
          ? recordWin((STAGES as readonly number[]).indexOf(wonAtSeconds!), hintsUsed)
          : recordLoss(hintsUsed)
      );
      const update = applyResult(progress ?? jumpTo(difficulty), won);
      const tierChange: TierChange | null = update.promoted
        ? { kind: "promoted", tierLabel: difficultyMeta(update.progress.tier).label }
        : update.demoted
          ? { kind: "demoted", tierLabel: difficultyMeta(update.progress.tier).label }
          : null;
      saveProgress(update.progress);
      setProgress(update.progress);
      setPhase({ kind: "reveal", difficulty, result, wonAtSeconds, answer, tierChange });
      // Let the reveal animate in, then play the full preview as the payoff.
      setTimeout(() => player.playFull(), 450);
    },
    [player, progress, revealedHints.length]
  );

  const advanceStage = useCallback(() => {
    setPhase((p) => {
      if (p.kind !== "playing") return p;
      const next = clampIndex(p.stageIndex) + 1;
      player.play(stages[next]);
      return { ...p, stageIndex: next };
    });
  }, [player, stages, clampIndex]);

  const submitGuess = useCallback(
    async (guess: SearchResult) => {
      if (phase.kind !== "playing" || busy) return;
      const { round, difficulty } = phase;
      const stageIndex = clampIndex(phase.stageIndex);
      const isLast = stageIndex === stages.length - 1;
      setBusy(true);
      try {
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: round.token,
            guess: { id: guess.id, title: guess.title, artists: guess.artists },
            reveal: isLast,
          }),
        });
        const data = (await res.json()) as GuessResponse;
        if (data.correct && data.answer) {
          finishRound("won", data.answer, difficulty, stages[stageIndex]);
        } else if (isLast && data.answer) {
          finishRound("lost", data.answer, difficulty);
        } else {
          setShakeSignal((s) => s + 1);
          setWrongGuesses((w) => [
            ...w,
            {
              key: Date.now(),
              label: `${guess.title} · ${guess.artists[0] ?? ""}`,
              kind: "wrong",
            },
          ]);
          advanceStage();
        }
      } catch {
        setError("Something went wrong submitting that guess. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [phase, busy, stages, clampIndex, finishRound, advanceStage]
  );

  const revealAnswer = useCallback(
    async (result: RoundResult) => {
      if (phase.kind !== "playing" || busy) return;
      const { round, difficulty } = phase;
      setBusy(true);
      try {
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: round.token, reveal: true }),
        });
        const data = (await res.json()) as GuessResponse;
        if (!data.answer) throw new Error();
        finishRound(result, data.answer, difficulty);
      } catch {
        setError("Could not reveal the answer. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [phase, busy, finishRound]
  );

  const takeHint = useCallback(async () => {
    if (phase.kind !== "playing" || busy) return;
    const { round } = phase;
    const hintIndex = revealedHints.length;
    if (hintIndex >= round.hintTypes.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: round.token, hintIndex }),
      });
      if (!res.ok) throw new Error();
      const { hint } = (await res.json()) as HintResponse;
      setRevealedHints((h) => [
        ...h,
        { key: Date.now(), type: hint.type, text: "text" in hint ? hint.text : undefined },
      ]);
      setProgress((prev) => {
        const next = spendWin(prev ?? loadProgress());
        saveProgress(next);
        return next;
      });
    } catch {
      // A failed hint costs nothing.
      setError("Could not fetch a hint. Try again.");
    } finally {
      setBusy(false);
    }
  }, [phase, busy, revealedHints.length]);

  const skipStage = useCallback(() => {
    if (phase.kind !== "playing") return;
    const isLast = clampIndex(phase.stageIndex) === stages.length - 1;
    if (isLast) {
      void revealAnswer("lost");
      return;
    }
    setWrongGuesses((w) => [...w, { key: Date.now(), label: "Skipped", kind: "skip" }]);
    advanceStage();
  }, [phase, stages, clampIndex, advanceStage, revealAnswer]);

  const goHome = useCallback(() => {
    player.reset();
    setError(null);
    setPhase({ kind: "home" });
  }, [player]);

  const resetEverything = useCallback(() => {
    // Volume first: setVolume persists, so clearing afterwards leaves nothing
    // behind. Then drop every cached slice back to null so the loaders re-read
    // the now-empty storage and hand back defaults.
    player.setVolume(DEFAULT_VOLUME);
    clearStoredData();
    setStats(null);
    setProgress(null);
    setSettings(null);
    setWrongGuesses([]);
    setRevealedHints([]);
    setError(null);
    // A round in flight was started under the old progress — finishing it
    // would write that progress straight back.
    player.reset();
    setPhase({ kind: "home" });
  }, [player]);

  const jumpTier = useCallback((tier: Difficulty) => {
    const next = jumpTo(tier);
    saveProgress(next);
    setProgress(next);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const playing = phase.kind === "playing" ? phase : null;
  const currentIndex = playing ? clampIndex(playing.stageIndex) : 0;
  const nextStage =
    playing && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null;
  const nextHintType = playing
    ? (playing.round.hintTypes[revealedHints.length] ?? null)
    : null;

  return {
    phase,
    playing,
    player,
    stats,
    progress,
    settings,
    // `progress` is null until localStorage is readable, i.e. during SSR and
    // hydration. Gating the home screen on it shipped an empty <main> to
    // crawlers; falling back to the new-player state renders the real markup
    // server-side, then corrects to the stored tier once the client takes over.
    homeProgress: progress ?? initialProgress(),
    tier: progress?.tier ?? "easy",
    stages,
    currentIndex,
    nextStage,
    nextHintType,
    wrongGuesses,
    revealedHints,
    error,
    shakeSignal,
    busy,
    startRound,
    submitGuess,
    revealAnswer,
    takeHint,
    skipStage,
    goHome,
    jumpTier,
    toggleStage,
    toggleGenre,
    toggleDecade,
    resetEverything,
    dismissError,
  };
}

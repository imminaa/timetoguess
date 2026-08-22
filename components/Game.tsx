"use client";

import { Flag, Flame, Lightbulb, Play, SkipForward, VinylRecord, X } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import GuessSearch from "@/components/GuessSearch";
import PlayerDisc, { DISC_SIZE } from "@/components/PlayerDisc";
import RevealCard, { type RoundResult, type TierChange } from "@/components/RevealCard";
import SettingsPanel from "@/components/SettingsPanel";
import SetupBanner from "@/components/SetupBanner";
import StageBar from "@/components/StageBar";
import TierLadder from "@/components/TierLadder";
import { STAGES, difficultyMeta, type Difficulty } from "@/lib/game-config";
import { hintLabel, type HintType } from "@/lib/hints";
import { applyResult, jumpTo, spendWin, type Progress } from "@/lib/progression";
import {
  defaultSettings,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
} from "@/lib/settings";
import { loadStats, recordLoss, recordWin, type Stats } from "@/lib/stats";
import { TIER_STYLES } from "@/lib/tier-styles";
import type {
  GuessResponse,
  HintResponse,
  PublicAnswer,
  RoundData,
  SearchResult,
} from "@/lib/types";
import { useIsClient } from "@/lib/use-is-client";
import { usePreviewPlayer } from "@/lib/use-preview-player";

type Phase =
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

interface WrongGuess {
  key: number;
  label: string;
  kind: "wrong" | "skip";
}

interface RevealedHint {
  key: number;
  type: HintType;
  text?: string;
}

export default function Game({ ready }: { ready: boolean }) {
  const isClient = useIsClient();
  const [phase, setPhase] = useState<Phase>({ kind: "home" });
  const [progressState, setProgress] = useState<Progress | null>(null);
  const [stagesState, setEnabledStages] = useState<number[] | null>(null);
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
  const enabledStages =
    stagesState ?? (isClient ? loadSettings() : defaultSettings()).enabledStages;

  const stages = enabledStages;
  const clampIndex = useCallback(
    (index: number) => Math.min(index, stages.length - 1),
    [stages.length]
  );

  const toggleStage = useCallback((seconds: number) => {
    setEnabledStages((prev) => {
      const current = prev ?? loadSettings().enabledStages;
      const next = current.includes(seconds)
        ? current.filter((s) => s !== seconds)
        : [...current, seconds].sort((a, b) => a - b);
      if (next.length === 0) return current;
      saveSettings({ enabledStages: next });
      return next;
    });
  }, []);

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
        const res = await fetch(`/api/round?difficulty=${difficulty}`);
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
    [player, stages]
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

  const jumpTier = useCallback((tier: Difficulty) => {
    const next = jumpTo(tier);
    saveProgress(next);
    setProgress(next);
  }, []);

  const playing = phase.kind === "playing" ? phase : null;
  const currentIndex = playing ? clampIndex(playing.stageIndex) : 0;
  const nextStage =
    playing && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null;
  const nextHintType = playing
    ? (playing.round.hintTypes[revealedHints.length] ?? null)
    : null;
  const tier = progress?.tier ?? "easy";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-12 pt-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between sm:mb-8">
        <button
          type="button"
          onClick={goHome}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="TimeToGuess, back to the tier ladder"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-accent">
            <VinylRecord size={19} weight="fill" className="text-bg" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            TimeToGuess
          </span>
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {stats && stats.streak > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-tier-hard/30 bg-tier-hard/10 px-2.5 py-1 text-xs font-medium text-tier-hard">
              <Flame size={13} weight="fill" aria-hidden />
              <span className="tabular-nums">{stats.streak}</span>
            </span>
          )}
          {stats && stats.plays > 0 && (
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-xs text-dim">
              {stats.wins}/{stats.plays}
            </span>
          )}
          <SettingsPanel
            volume={player.volume}
            onVolume={player.setVolume}
            enabledStages={enabledStages}
            onToggleStage={toggleStage}
          />
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center">
        {!ready && <SetupBanner />}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="cursor-pointer rounded p-1 outline-none hover:bg-bad/10 focus-visible:ring-2 focus-visible:ring-bad"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        )}

        {phase.kind === "home" && progress && (
          <section className="animate-fade-up">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Name that tune.
            </h1>
            <p className="mt-3 max-w-md text-dim">
              Hear a snippet, {stages[0]}s at first. Two wins climb a tier, two
              losses slide you back. Jump ahead if you dare.
            </p>
            <div className="mt-8">
              <TierLadder progress={progress} onJump={jumpTier} />
            </div>
            <button
              type="button"
              onClick={() => void startRound(tier)}
              disabled={!ready}
              className="mt-8 flex h-13 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full bg-accent py-3.5 font-display text-lg font-semibold text-bg outline-none transition-all duration-200 hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={20} weight="fill" aria-hidden />
              Play · {difficultyMeta(tier).label}
            </button>
          </section>
        )}

        {phase.kind === "loading" && (
          <div className="flex animate-fade-up flex-col items-center gap-6 py-10">
            <div className={`animate-pulse rounded-full border border-line bg-surface ${DISC_SIZE}`} />
            <p className="text-sm text-dim" role="status">
              Dropping the needle…
            </p>
          </div>
        )}

        {playing && (
          <section className="animate-fade-up">
            <div className="mb-6 flex items-center justify-center sm:mb-8">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${TIER_STYLES[playing.difficulty].chip}`}
              >
                {difficultyMeta(playing.difficulty).label}
              </span>
            </div>

            <PlayerDisc
              isPlaying={player.isPlaying}
              progress={player.progress}
              disabled={!player.ready}
              onToggle={() =>
                player.isPlaying ? player.stop() : player.play(stages[currentIndex])
              }
            />

            <p
              className="mt-5 text-center font-display text-sm text-dim"
              aria-live="polite"
            >
              {player.isPlaying ? (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="flex h-3.5 items-end gap-[3px]">
                    <span className="w-[3px] animate-eq rounded-full bg-accent" />
                    <span className="w-[3px] animate-eq rounded-full bg-accent [animation-delay:150ms]" />
                    <span className="w-[3px] animate-eq rounded-full bg-accent [animation-delay:300ms]" />
                  </span>
                  playing a{" "}
                  <span className="font-mono text-ink">{stages[currentIndex]}s</span>{" "}
                  snippet
                </span>
              ) : (
                <span>
                  <span className="font-mono text-ink">{stages[currentIndex]}s</span> of
                  the song unlocked
                </span>
              )}
            </p>

            <div className="mt-6">
              <StageBar
                stages={stages}
                currentIndex={currentIndex}
                elapsedSeconds={
                  player.isPlaying ? player.progress * player.clipSeconds : null
                }
              />
            </div>

            <div className="mt-6">
              <GuessSearch
                onGuess={(g) => void submitGuess(g)}
                shakeSignal={shakeSignal}
                disabled={busy}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={skipStage}
                disabled={busy}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-dim outline-none transition-colors duration-200 hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                <SkipForward size={15} aria-hidden />
                {nextStage != null ? (
                  <>
                    Skip to <span className="tabular-nums">{nextStage}s</span>
                  </>
                ) : (
                  "Skip (ends round)"
                )}
              </button>
              <button
                type="button"
                onClick={() => void takeHint()}
                disabled={busy || nextHintType == null}
                title={
                  nextHintType == null
                    ? "No hints left"
                    : "Costs a win from your tier progress"
                }
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-dim outline-none transition-colors duration-200 hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Lightbulb size={15} aria-hidden />
                {nextHintType == null ? (
                  "No hints left"
                ) : (
                  <>Hint · {hintLabel(nextHintType)}</>
                )}
              </button>
              <button
                type="button"
                onClick={() => void revealAnswer("gaveup")}
                disabled={busy}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm text-faint outline-none transition-colors duration-200 hover:text-bad focus-visible:ring-2 focus-visible:ring-bad disabled:opacity-50"
              >
                <Flag size={15} aria-hidden />
                Give up
              </button>
            </div>

            {revealedHints.length > 0 && (
              <ul aria-label="Hints" className="mt-5 flex flex-wrap items-center gap-2">
                {revealedHints.map((h) => (
                  <li
                    key={h.key}
                    className="flex animate-pop-in items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs text-dim"
                  >
                    {h.type === "art" ? (
                      <>
                        <span className="text-faint">{hintLabel(h.type)}</span>
                        <span className="size-12 overflow-hidden rounded-md">
                          {/* eslint-disable-next-line @next/next/no-img-element -- deliberately degraded 40×40 proxy; next/image optimization has nothing to gain */}
                          <img
                            src={`/api/hint?t=${encodeURIComponent(playing.round.token)}`}
                            alt="Blurred album art hint"
                            className="size-full scale-110 object-cover blur-[6px]"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-faint">{hintLabel(h.type)}</span>
                        <span className="font-medium text-ink">{h.text}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {wrongGuesses.length > 0 && (
              <ul aria-label="Previous guesses" className="mt-5 flex flex-wrap gap-2">
                {wrongGuesses.map((g) => (
                  <li
                    key={g.key}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                      g.kind === "skip"
                        ? "border-line text-faint"
                        : "border-bad/25 bg-bad/5 text-dim"
                    }`}
                  >
                    {g.kind === "wrong" && <X size={11} aria-hidden className="text-bad" />}
                    <span className="max-w-[min(13rem,60vw)] truncate">{g.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {phase.kind === "reveal" && (
          <RevealCard
            answer={phase.answer}
            result={phase.result}
            wonAtSeconds={phase.wonAtSeconds}
            wrongCount={wrongGuesses.filter((g) => g.kind === "wrong").length}
            stats={stats}
            tierChange={phase.tierChange}
            player={player}
            onPlayAgain={() => void startRound(progress?.tier ?? phase.difficulty)}
            onHome={goHome}
          />
        )}
      </main>

      <footer className="mt-10 text-center text-xs text-balance text-faint">
        Powered by Apple Music · not affiliated with Apple
      </footer>
    </div>
  );
}

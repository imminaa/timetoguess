"use client";

import { Flag, Flame, Lightbulb, Play, SkipForward, VinylRecord, X } from "@phosphor-icons/react";
import GuessSearch from "@/components/GuessSearch";
import PlayerDisc, { DISC_SIZE } from "@/components/PlayerDisc";
import RevealCard from "@/components/RevealCard";
import SettingsPanel from "@/components/SettingsPanel";
import SetupBanner from "@/components/SetupBanner";
import StageBar from "@/components/StageBar";
import TierLadder from "@/components/TierLadder";
import { difficultyMeta } from "@/lib/game-config";
import { hintLabel } from "@/lib/hints";
import { settingsFilter } from "@/lib/settings";
import { TIER_STYLES } from "@/lib/tier-styles";
import { useGameEngine } from "@/lib/use-game-engine";

export default function Game({ ready }: { ready: boolean }) {
  const g = useGameEngine();
  const { phase, playing, player, stats, stages, currentIndex } = g;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-12 pt-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between sm:mb-8">
        <button
          type="button"
          onClick={g.goHome}
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
            enabledStages={stages}
            onToggleStage={g.toggleStage}
            genres={g.settings.genres}
            onToggleGenre={g.toggleGenre}
            decades={g.settings.decades}
            onToggleDecade={g.toggleDecade}
            filter={settingsFilter(g.settings)}
            onReset={g.resetEverything}
          />
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center">
        {!ready && <SetupBanner />}
        {g.error && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad"
          >
            <span>{g.error}</span>
            <button
              type="button"
              onClick={g.dismissError}
              aria-label="Dismiss error"
              className="cursor-pointer rounded p-1 outline-none hover:bg-bad/10 focus-visible:ring-2 focus-visible:ring-bad"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        )}

        {phase.kind === "home" && (
          <section className="animate-fade-up">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Name that tune.
            </h1>
            <p className="mt-3 max-w-md text-dim">
              Hear a snippet, {stages[0]}s at first. Two wins climb a tier, two
              losses slide you back. Jump ahead if you dare.
            </p>
            <div className="mt-8">
              <TierLadder progress={g.homeProgress} onJump={g.jumpTier} />
            </div>
            <button
              type="button"
              onClick={() => void g.startRound(g.tier)}
              disabled={!ready}
              className="mt-8 flex h-13 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full bg-accent py-3.5 font-display text-lg font-semibold text-bg outline-none transition-all duration-200 hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={20} weight="fill" aria-hidden />
              Play · {difficultyMeta(g.tier).label}
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
                onGuess={(guess) => void g.submitGuess(guess)}
                shakeSignal={g.shakeSignal}
                disabled={g.busy}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={g.skipStage}
                disabled={g.busy}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-dim outline-none transition-colors duration-200 hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                <SkipForward size={15} aria-hidden />
                {g.nextStage != null ? (
                  <>
                    Skip to <span className="tabular-nums">{g.nextStage}s</span>
                  </>
                ) : (
                  "Skip (ends round)"
                )}
              </button>
              <button
                type="button"
                onClick={() => void g.takeHint()}
                disabled={g.busy || g.nextHintType == null}
                title={
                  g.nextHintType == null
                    ? "No hints left"
                    : "Costs a win from your tier progress"
                }
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-dim outline-none transition-colors duration-200 hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Lightbulb size={15} aria-hidden />
                {g.nextHintType == null ? (
                  "No hints left"
                ) : (
                  <>Hint · {hintLabel(g.nextHintType)}</>
                )}
              </button>
              <button
                type="button"
                onClick={() => void g.revealAnswer("gaveup")}
                disabled={g.busy}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm text-faint outline-none transition-colors duration-200 hover:text-bad focus-visible:ring-2 focus-visible:ring-bad disabled:opacity-50"
              >
                <Flag size={15} aria-hidden />
                Give up
              </button>
            </div>

            {g.revealedHints.length > 0 && (
              <ul aria-label="Hints" className="mt-5 flex flex-wrap items-center gap-2">
                {g.revealedHints.map((h) => (
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

            {g.wrongGuesses.length > 0 && (
              <ul aria-label="Previous guesses" className="mt-5 flex flex-wrap gap-2">
                {g.wrongGuesses.map((guess) => (
                  <li
                    key={guess.key}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                      guess.kind === "skip"
                        ? "border-line text-faint"
                        : "border-bad/25 bg-bad/5 text-dim"
                    }`}
                  >
                    {guess.kind === "wrong" && <X size={11} aria-hidden className="text-bad" />}
                    <span className="max-w-[min(13rem,60vw)] truncate">{guess.label}</span>
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
            wrongCount={g.wrongGuesses.filter((guess) => guess.kind === "wrong").length}
            stats={stats}
            tierChange={phase.tierChange}
            player={player}
            onPlayAgain={() => void g.startRound(g.progress?.tier ?? phase.difficulty)}
            onHome={g.goHome}
          />
        )}
      </main>

      <footer className="mt-10 text-center text-xs text-balance text-faint">
        Powered by Apple Music · not affiliated with Apple
      </footer>
    </div>
  );
}

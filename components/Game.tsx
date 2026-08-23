"use client";

import { Flag, Lightbulb, MusicNotes, Pause, Play, SkipForward, VinylRecord, X } from "@phosphor-icons/react";
import Image from "next/image";
import SetupBanner from "@/components/SetupBanner";
import PlayerDisc from "@/components/PlayerDisc";
import SettingsPanel from "@/components/SettingsPanel";
import { DIFFICULTIES, difficultyMeta } from "@/lib/game-config";
import { attemptSlots } from "@/lib/attempt-slots";
import { hintLabel } from "@/lib/hints";
import { SITE_NAME } from "@/lib/site";
import { WINS_TO_PROMOTE } from "@/lib/progression";
import { settingsFilter } from "@/lib/settings";
import { axisPos, stageBoundaries } from "@/lib/stage-scale";
import { TIER_STYLES } from "@/lib/tier-styles";
import { GUESS_INPUT_PROPS, useGuessSearch } from "@/lib/use-guess-search";
import { useGameEngine, type GameEngine } from "@/lib/use-game-engine";

/**
 * The board: a Wurlitzer selector.
 *
 * The round is one screen in three phases, locked to the viewport like a game
 * rather than a document: banks A–E instead of a tier list, one row per
 * remaining attempt, and the reveal as an overlay. The transport at the centre
 * is `components/PlayerDisc` — the grooved disc with the gold label and the
 * conic progress ring.
 */

/**
 * Warm brass cabinet trim.
 *
 * Metal reads as metal because of the specular flip near the midpoint, not
 * because it is grey — and grey was what dragged a cold band across this warm
 * charcoal. Every stop is opaque on purpose: a transparent stop lets the page
 * show through the middle and the trim breaks into light-dark-light banding.
 */
const BRASS = {
  backgroundImage:
    "linear-gradient(180deg,#8a7149 0%,#54452c 24%,#2c2418 50%,#7c6541 60%,#3e3322 84%,#61502f 100%)",
  boxShadow:
    "inset 0 1px 0 rgba(244,239,230,0.16), inset 0 -1px 0 rgba(0,0,0,0.5), 0 8px 22px -12px rgba(0,0,0,0.8)",
};
/** The disc is smaller here than on the live page: the board carries rows too. */
const DISC = "size-[min(11rem,44vw,26dvh)] sm:size-[min(12.5rem,30dvh)]";

const BANK = ["A", "B", "C", "D", "E"];

/** Illuminated cabinet key. Chunky, with a hard base that compresses. */
function Key({
  children, onClick, disabled, tone = "cabinet", className = "", ariaLabel,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  tone?: "cabinet" | "amber" | "flat"; className?: string; ariaLabel?: string;
}) {
  const skin =
    tone === "amber"
      ? "bg-accent text-bg shadow-[0_4px_0_var(--color-accent-strong),inset_0_1px_0_rgba(255,255,255,0.45)] hover:bg-accent-strong active:shadow-[0_1px_0_var(--color-accent-strong)]"
      : tone === "cabinet"
        ? "bg-surface-2 text-dim shadow-[0_4px_0_#0d0b0a,inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-line hover:text-ink active:shadow-[0_1px_0_#0d0b0a]"
        : "bg-transparent text-faint hover:text-bad";
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-5 font-mono text-[10px] uppercase tracking-[0.18em] outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:translate-y-[3px] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 ${skin} ${className}`}
    >
      {children}
    </button>
  );
}

function Search({ g }: { g: GameEngine }) {
  const {
    query, setQuery, results, open, loading, highlight, setHighlight,
    listMaxHeight, listId, pick, onKeyDown, onFocus, wrapRef, inputRef,
  } = useGuessSearch({ onGuess: (guess) => void g.submitGuess(guess), shakeSignal: g.shakeSignal });

  return (
    <div ref={wrapRef} className="relative">
      <input
        {...GUESS_INPUT_PROPS}
        ref={inputRef}
        role="combobox" aria-expanded={open} aria-controls={listId}
        aria-autocomplete="list" aria-label="Guess the song"
        placeholder="Make your selection…"
        value={query} disabled={g.busy}
        onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} onFocus={onFocus}
        /* text-base or Safari zooms the page in on focus and never back out. */
        className="h-13 w-full rounded-full border border-line bg-surface px-5 text-base text-ink outline-none transition-colors duration-200 placeholder:text-faint focus:border-accent/60 focus:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {loading && (
        <span aria-hidden className="absolute right-5 top-1/2 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      )}
      {open && (
        <ul
          id={listId} role="listbox" aria-label="Song suggestions" style={{ maxHeight: listMaxHeight }}
          className="absolute inset-x-0 bottom-full z-30 mb-2 animate-fade-up overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-2 p-1.5 shadow-[0_-24px_60px_-16px_rgba(0,0,0,0.7)] [animation-duration:200ms]"
        >
          {results.length === 0 && !loading ? (
            <li className="px-4 py-3 text-sm text-faint">Not in this box. Keep typing?</li>
          ) : results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === highlight}>
              <button
                type="button" onClick={() => pick(r)} onPointerEnter={() => setHighlight(i)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-100 ${i === highlight ? "bg-ink/10" : ""}`}
              >
                {r.artUrl ? (
                  <Image src={r.artUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-line text-faint"><MusicNotes size={14} aria-hidden /></span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                  <span className="block truncate text-xs text-dim">{r.artists.join(", ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Game({ ready }: { ready: boolean }) {
  const g = useGameEngine();
  const { phase, playing, player, stats, stages, currentIndex } = g;
  const bounds = stageBoundaries(stages);
  const head = player.isPlaying ? axisPos(player.progress * player.clipSeconds, stages) : null;
  const slots = attemptSlots(stages, currentIndex, g.wrongGuesses);
  const tierIdx = DIFFICULTIES.findIndex((d) => d.id === g.homeProgress.tier);
  const tier = TIER_STYLES[g.homeProgress.tier];

  return (
    <div className="flex h-dvh flex-col overflow-hidden font-sans text-ink">
      <div
        aria-hidden
        className="h-px shrink-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg,transparent,color-mix(in srgb,var(--color-accent) 55%,transparent),transparent)",
        }}
      />

      {/* ── HUD ── */}
      <header className="mx-auto flex w-full max-w-md shrink-0 items-center justify-between gap-3 px-4 py-3">
        <button
          type="button" onClick={g.goHome}
          className="flex cursor-pointer items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={`${SITE_NAME}, back to the bank selector`}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-accent">
            <VinylRecord size={19} weight="fill" className="text-bg" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">{SITE_NAME}</span>
        </button>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tier.chip}`}>
            {difficultyMeta(g.homeProgress.tier).label}
          </span>
          <span aria-label={`${g.homeProgress.wins} of ${WINS_TO_PROMOTE} wins toward promotion`} className="flex items-center gap-1">
            {Array.from({ length: WINS_TO_PROMOTE }, (_, p) => (
              <span key={p} aria-hidden className={`size-2 rounded-full transition-colors duration-300 ${p < g.homeProgress.wins ? tier.dot : "bg-line-strong"}`} />
            ))}
          </span>
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

      <main className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-20">
        {!ready && <SetupBanner />}
        {g.error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
            <span>{g.error}</span>
            <button type="button" onClick={g.dismissError} aria-label="Dismiss error" className="cursor-pointer rounded p-1 outline-none hover:bg-bad/10 focus-visible:ring-2 focus-visible:ring-bad">
              <X size={14} aria-hidden />
            </button>
          </div>
        )}

        {/* ── HOME: the arched selector ── */}
        {phase.kind === "home" && (
          <div className="m-auto w-full animate-fade-up">
            <div className="rounded-t-[3rem] rounded-b-2xl p-[3px]" style={BRASS}>
              <div className="rounded-t-[2.7rem] rounded-b-xl border border-line bg-surface px-6 py-8 text-center">
                <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  Name that tune.
                </h1>
                <p className="mx-auto mt-2 max-w-xs text-sm text-dim">
                  {stages[0]}s to start. Two wins climb a bank, two losses drop you one.
                </p>

                <div className="mt-6 flex flex-col gap-1.5">
                  {DIFFICULTIES.map((d, i) => {
                    const isCurrent = d.id === g.homeProgress.tier;
                    const s = TIER_STYLES[d.id];
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => !isCurrent && g.jumpTier(d.id)}
                        aria-current={isCurrent ? "true" : undefined}
                        aria-label={isCurrent ? `${d.label}, current bank` : `Select bank ${BANK[i]}, ${d.label}`}
                        className={`group flex items-center gap-3 rounded-full border py-2 pl-2 pr-4 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent ${
                          isCurrent
                            ? "cursor-default border-line-strong bg-surface-2"
                            : `cursor-pointer border-line bg-bg/40 opacity-80 hover:opacity-100 ${s.cardHover}`
                        }`}
                      >
                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${isCurrent ? `${s.dot} text-bg` : "bg-line text-dim"}`}>
                          {BANK[i]}
                        </span>
                        <span className={`flex-1 font-display text-sm font-semibold ${isCurrent ? s.text : "text-dim"}`}>
                          {d.label}
                        </span>
                        <span className="truncate text-xs text-faint">{d.tagline}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* The bank and its label are already shown above and in the HUD;
                repeating them on the button only crowded it. The accessible
                name keeps the context that the visible word drops. */}
            <Key
              tone="amber"
              onClick={() => void g.startRound(g.tier)}
              disabled={!ready}
              ariaLabel={`Play ${difficultyMeta(g.tier).label}`}
              className="mt-4 w-full !min-h-13 font-display !text-sm !font-semibold !tracking-normal !normal-case"
            >
              <Play size={17} weight="fill" aria-hidden />
              Play
            </Key>

            <p className="mt-5 text-center text-xs text-balance text-faint">
              Powered by Apple Music · not affiliated with Apple
            </p>
          </div>
        )}

        {/* ── LOADING ── */}
        {phase.kind === "loading" && (
          <div className="m-auto flex animate-fade-up flex-col items-center gap-6">
            <div className={`animate-pulse rounded-full border border-line bg-surface ${DISC}`} />
            <p role="status" className="font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
              Arm is loading the 45
            </p>
          </div>
        )}

        {/* ── PLAYING ── */}
        {playing && (
          <div className="flex animate-fade-up flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
                Selection {BANK[tierIdx]}-{currentIndex + 1}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
                {currentIndex + 1} of {stages.length}
              </span>
            </div>

            {/* The original vinyl transport, borrowed wholesale. */}
            <PlayerDisc
              size={DISC}
              isPlaying={player.isPlaying}
              progress={player.progress}
              disabled={!player.ready}
              onToggle={() => (player.isPlaying ? player.stop() : player.play(stages[currentIndex]))}
            />

            <p className="text-center font-display text-sm text-dim" aria-live="polite">
              {player.isPlaying ? (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="flex h-3.5 items-end gap-[3px]">
                    <span className="w-[3px] animate-eq rounded-full bg-accent" />
                    <span className="w-[3px] animate-eq rounded-full bg-accent [animation-delay:150ms]" />
                    <span className="w-[3px] animate-eq rounded-full bg-accent [animation-delay:300ms]" />
                  </span>
                  playing a <span className="font-mono text-ink">{stages[currentIndex]}s</span> snippet
                </span>
              ) : (
                <span>
                  <span className="font-mono text-ink">{stages[currentIndex]}s</span> of the song unlocked
                </span>
              )}
            </p>

            {/* Tape position */}
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface ring-1 ring-line ring-inset">
              <div
                className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${bounds[currentIndex] * 100}%` }}
              />
              {bounds.slice(0, -1).map((pos, i) => (
                <span key={stages[i]} aria-hidden className="absolute inset-y-0 w-px bg-bg" style={{ left: `${pos * 100}%` }} />
              ))}
              {head != null && (
                <span
                  aria-hidden
                  className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_10px_2px] shadow-accent/50"
                  style={{ left: `${head * 100}%` }}
                />
              )}
            </div>

            {/* Selection log */}
            <ol aria-label="Attempts" className="overflow-hidden rounded-2xl border border-line bg-surface/60">
              {slots.map((slot, i) => (
                <li
                  key={slot.seconds}
                  className={`flex items-center gap-3 border-b border-line/60 px-4 py-2 last:border-b-0 ${
                    slot.state === "spent" ? "animate-slot-in" : ""
                  } ${slot.state === "current" ? "bg-accent/8" : ""}`}
                >
                  <span className={`w-7 shrink-0 font-mono text-[10px] ${slot.state === "current" ? "text-accent" : "text-faint"}`}>
                    {BANK[tierIdx]}{i + 1}
                  </span>
                  <span className="w-8 shrink-0 font-mono text-[10px] tabular-nums text-faint">{slot.seconds}s</span>
                  {slot.state === "spent" ? (
                    <>
                      {slot.kind === "wrong" && <X size={11} aria-hidden className="shrink-0 text-bad" />}
                      <span className="min-w-0 flex-1 truncate text-xs text-dim line-through decoration-faint/50">
                        {slot.label}
                      </span>
                    </>
                  ) : slot.state === "current" ? (
                    <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                      ▸ your pick
                    </span>
                  ) : (
                    <span className="flex-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint/45">
                      —
                    </span>
                  )}
                </li>
              ))}
            </ol>

            {g.revealedHints.length > 0 && (
              <ul aria-label="Hints" className="flex flex-wrap items-center gap-2">
                {g.revealedHints.map((h) => (
                  <li key={h.key} className="flex animate-pop-in items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs text-dim">
                    <span className="text-faint">{hintLabel(h.type)}</span>
                    {h.type === "art" ? (
                      <span className="size-10 overflow-hidden rounded-md">
                        {/* eslint-disable-next-line @next/next/no-img-element -- deliberately degraded proxy; nothing for next/image to optimise */}
                        <img
                          src={`/api/hint?t=${encodeURIComponent(playing.round.token)}`}
                          alt="Blurred album art hint"
                          className="size-full scale-110 object-cover blur-[6px]"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      </span>
                    ) : (
                      <span className="font-medium text-ink">{h.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <Search g={g} />

            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Key onClick={g.skipStage} disabled={g.busy}>
                <SkipForward size={13} aria-hidden />
                {g.nextStage != null ? `+${g.nextStage}s` : "Last"}
              </Key>
              <Key
                onClick={() => void g.takeHint()}
                disabled={g.busy || g.nextHintType == null}
                className="!px-3"
              >
                <Lightbulb size={13} aria-hidden />
                {g.nextHintType == null ? "No hints" : hintLabel(g.nextHintType)}
              </Key>
              <Key tone="flat" onClick={() => void g.revealAnswer("gaveup")} disabled={g.busy} ariaLabel="Give up" className="!px-3">
                <Flag size={13} aria-hidden />
              </Key>
            </div>
          </div>
        )}
      </main>

      {/* ── REVEAL ── */}
      {phase.kind === "reveal" && (
        <div className="animate-overlay-in fixed inset-0 z-[62] flex items-center justify-center bg-bg/85 p-4 backdrop-blur-md">
          <div className="animate-hit-pop relative w-full max-w-sm rounded-[2rem] p-[3px]" style={BRASS}>
            {phase.result === "won" && (
              <span aria-hidden className="animate-hit-ring pointer-events-none absolute inset-0 rounded-[2rem] shadow-[0_0_0_3px_var(--color-good)]" />
            )}
            <div className="rounded-[1.7rem] border border-line bg-surface px-6 py-7 text-center">
              <span
                className={`inline-flex rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                  phase.result === "won" ? "border-good/30 bg-good/10 text-good" : "border-bad/30 bg-bad/10 text-bad"
                }`}
              >
                {phase.result === "won"
                  ? `Picked it at ${phase.wonAtSeconds}s`
                  : phase.result === "lost"
                    ? "Wrong every time"
                    : "Selection cancelled"}
              </span>

              {phase.answer.artUrl ? (
                <Image
                  src={phase.answer.artUrl}
                  alt={`Album artwork for ${phase.answer.title}`}
                  width={200}
                  height={200}
                  sizes="200px"
                  priority
                  className="mx-auto mt-6 h-auto w-full max-w-[200px] rounded-full shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)]"
                />
              ) : (
                <div className="mx-auto mt-6 flex aspect-square w-full max-w-[200px] items-center justify-center rounded-full bg-surface-2 text-faint">
                  <MusicNotes size={44} aria-hidden />
                </div>
              )}

              <h2 className="mt-6 text-balance font-display text-2xl font-bold tracking-tight">
                {phase.answer.title}
              </h2>
              <p className="mt-1 text-pretty text-dim">{phase.answer.artists.join(", ")}</p>
              <div className="mt-3 flex items-center justify-center gap-3 text-xs text-faint">
                {phase.answer.year != null && <span className="font-mono">{phase.answer.year}</span>}
                {phase.answer.year != null && phase.answer.genre && <span aria-hidden>•</span>}
                {phase.answer.genre && <span>{phase.answer.genre}</span>}
              </div>

              {phase.tierChange && (
                <p
                  role="status"
                  className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    phase.tierChange.kind === "promoted"
                      ? "border-good/30 bg-good/10 text-good"
                      : "border-bad/30 bg-bad/10 text-bad"
                  }`}
                >
                  {phase.tierChange.kind === "promoted" ? "Bumped to" : "Back to"} {phase.tierChange.tierLabel}
                </p>
              )}

              <div className="mt-6 flex flex-col gap-2">
                <Key tone="amber" onClick={() => void g.startRound(g.progress?.tier ?? phase.difficulty)} className="mb-2 !min-h-13 font-display !text-sm !font-semibold !tracking-normal !normal-case">
                  Another selection
                </Key>
                <div className="grid grid-cols-2 gap-2">
                  <Key onClick={() => (player.isPlaying ? player.stop() : player.playFull())}>
                    {player.isPlaying ? <Pause size={13} aria-hidden /> : <Play size={13} weight="fill" aria-hidden />}
                    {player.isPlaying ? "Pause" : "Replay"}
                  </Key>
                  <Key onClick={g.goHome}>Banks</Key>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

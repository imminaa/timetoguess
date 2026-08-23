"use client";

import {
  ArrowsClockwise,
  CaretDoubleUp,
  CaretDoubleDown,
  Flame,
  Ladder,
  MusicNotes,
  Pause,
  SpeakerHigh,
} from "@phosphor-icons/react";
import Image from "next/image";
import type { Stats } from "@/lib/stats";
import type { PublicAnswer } from "@/lib/types";
import type { RoundResult, TierChange } from "@/lib/use-game-engine";
import type { PreviewPlayer } from "@/lib/use-preview-player";

export type { RoundResult, TierChange };

interface Props {
  answer: PublicAnswer;
  result: RoundResult;
  /** Stage length the round was won at (undefined unless won). */
  wonAtSeconds?: number;
  wrongCount: number;
  stats: Stats | null;
  tierChange: TierChange | null;
  player: PreviewPlayer;
  onPlayAgain: () => void;
  onHome: () => void;
}

export default function RevealCard({
  answer,
  result,
  wonAtSeconds,
  wrongCount,
  stats,
  tierChange,
  player,
  onPlayAgain,
  onHome,
}: Props) {
  const badge =
    result === "won"
      ? `Nailed it at ${wonAtSeconds}s`
      : result === "lost"
        ? "Out of stages"
        : "Waved the white flag";

  return (
    <section className="flex animate-pop-in flex-col items-center text-center">
      <span
        className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
          result === "won"
            ? "border-good/30 bg-good/10 text-good"
            : "border-bad/30 bg-bad/10 text-bad"
        }`}
      >
        {badge}
      </span>

      <div className="mt-6 w-full rounded-3xl border border-line bg-surface p-5 sm:p-8">
        {answer.artUrl ? (
          <Image
            src={answer.artUrl}
            alt={`Album artwork for ${answer.title}`}
            width={232}
            height={232}
            sizes="232px"
            className="mx-auto h-auto w-full max-w-[232px] rounded-2xl shadow-[0_24px_70px_-24px_rgba(0,0,0,0.85)]"
            priority
          />
        ) : (
          <div className="mx-auto flex aspect-square w-full max-w-[232px] items-center justify-center rounded-2xl bg-surface-2 text-faint">
            <MusicNotes size={48} aria-hidden />
          </div>
        )}
        <h2 className="mt-6 text-balance font-display text-2xl font-bold tracking-tight">
          {answer.title}
        </h2>
        <p className="mt-1 text-pretty text-dim">{answer.artists.join(", ")}</p>

        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-faint">
          {answer.year != null && <span className="font-mono">{answer.year}</span>}
          {answer.year != null && answer.genre && <span aria-hidden>•</span>}
          {answer.genre && <span>{answer.genre}</span>}
        </div>

        <button
          type="button"
          onClick={() => (player.isPlaying ? player.stop() : player.playFull())}
          className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-dim outline-none transition-colors duration-200 hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          {player.isPlaying ? (
            <Pause size={16} aria-hidden />
          ) : (
            <SpeakerHigh size={16} aria-hidden />
          )}
          {player.isPlaying ? "Pause preview" : "Replay preview"}
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-dim" role="status">
        {tierChange && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              tierChange.kind === "promoted"
                ? "border-good/30 bg-good/10 text-good"
                : "border-bad/30 bg-bad/10 text-bad"
            }`}
          >
            {tierChange.kind === "promoted" ? (
              <CaretDoubleUp size={13} aria-hidden />
            ) : (
              <CaretDoubleDown size={13} aria-hidden />
            )}
            {tierChange.kind === "promoted" ? "Promoted to" : "Dropped to"}{" "}
            {tierChange.tierLabel}
          </span>
        )}
        {result === "won" && stats && stats.streak > 1 ? (
          <span className="inline-flex items-center gap-1.5">
            <Flame size={16} weight="fill" aria-hidden className="text-tier-hard" />
            {stats.streak} in a row
          </span>
        ) : wrongCount > 0 ? (
          <span>
            {wrongCount} wrong {wrongCount === 1 ? "guess" : "guesses"} this round
          </span>
        ) : null}
      </div>

      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex h-12 min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent font-display font-semibold text-bg outline-none transition-all duration-200 hover:bg-accent-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.98]"
        >
          <ArrowsClockwise size={18} aria-hidden />
          Next song
        </button>
        <button
          type="button"
          onClick={onHome}
          className="flex h-12 min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-line px-6 text-dim outline-none transition-colors duration-200 hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Ladder size={16} aria-hidden />
          Tier ladder
        </button>
      </div>
    </section>
  );
}

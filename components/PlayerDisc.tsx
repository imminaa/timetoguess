"use client";

import { Pause, Play } from "@phosphor-icons/react";

interface Props {
  isPlaying: boolean;
  /** 0..1 through the current clip — drives the progress ring. */
  progress: number;
  disabled?: boolean;
  onToggle: () => void;
  /** Override the sizing classes — a denser board may want a smaller disc. */
  size?: string;
}

/**
 * The disc is the tallest thing on screen, so it — not the copy around it —
 * decides whether a round fits without scrolling. Bound it by width *and*
 * height: the dvh term is what keeps the whole game visible on a small phone
 * and, more importantly, when someone turns one sideways. Exported so the
 * loading skeleton can hold exactly the same space and nothing jumps.
 */
export const DISC_SIZE = "size-[min(13rem,52vw,34dvh)] sm:size-[min(15rem,40dvh)]";

export default function PlayerDisc({
  isPlaying,
  progress,
  disabled,
  onToggle,
  size = DISC_SIZE,
}: Props) {
  const angle = progress * 360;
  return (
    <div className={`relative mx-auto ${size}`}>
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(var(--color-accent) ${angle}deg, var(--color-line) ${angle}deg)`,
        }}
      />
      <div aria-hidden className="absolute inset-[5px] rounded-full bg-bg" />
      <div
        aria-hidden
        className={`absolute inset-[14px] animate-disc-spin rounded-full border border-line-strong/50 ${
          isPlaying ? "" : "[animation-play-state:paused]"
        }`}
        style={{
          background:
            "repeating-radial-gradient(circle at 50%, #211c16 0px, #211c16 2px, #120f0c 3px, #120f0c 5px)",
        }}
      >
        <div className="absolute left-1/2 top-1/2 size-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-accent to-accent-strong" />
        <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg" />
      </div>
      <button
        type="button"
        aria-label={isPlaying ? "Pause snippet" : "Play snippet"}
        onClick={onToggle}
        disabled={disabled}
        className="group absolute inset-0 flex cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-bg disabled:cursor-default"
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-ink text-bg shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform duration-150 group-hover:scale-105 group-active:scale-95 group-disabled:opacity-50 group-disabled:group-hover:scale-100">
          {isPlaying ? (
            <Pause size={26} weight="fill" />
          ) : (
            <Play size={26} weight="fill" className="ml-0.5" />
          )}
        </span>
      </button>
    </div>
  );
}

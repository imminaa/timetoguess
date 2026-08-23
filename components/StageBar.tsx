"use client";

import { axisPos, segmentWidths, stageBoundaries } from "@/lib/stage-scale";

interface Props {
  /** Enabled stage lengths, ascending. */
  stages: number[];
  /** Index of the currently unlocked stage within `stages`. */
  currentIndex: number;
  /** Seconds into the clip currently playing, or null while idle. */
  elapsedSeconds: number | null;
}

/**
 * How much of the song you hold, as one continuous bar. Ticks mark the stages,
 * the solid band is the slice this stage just bought you, and the playhead
 * sweeps the same axis so it crosses each tick on that tick's second.
 */
export default function StageBar({ stages, currentIndex, elapsedSeconds }: Props) {
  const widths = segmentWidths(stages);
  const bounds = stageBoundaries(stages);
  const max = stages[stages.length - 1];
  const current = stages[currentIndex];
  const unlocked = bounds[currentIndex];
  const previous = currentIndex > 0 ? bounds[currentIndex - 1] : 0;
  const head = elapsedSeconds == null ? null : axisPos(elapsedSeconds, stages);

  return (
    <div className="w-full">
      <div
        role="progressbar"
        aria-label="Song unlocked"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={current}
        aria-valuetext={`${current} of ${max} seconds unlocked`}
        className="relative h-2.5 w-full"
      >
        <div className="absolute inset-0 overflow-hidden rounded-full bg-surface ring-1 ring-line ring-inset">
          {/* Everything you have heard so far. */}
          <div
            className="absolute inset-y-0 left-0 bg-accent/25 transition-[width] duration-500 ease-out"
            style={{ width: `${unlocked * 100}%` }}
          />
          {/* The slice this stage added — what the last wrong guess bought. */}
          <div
            className="absolute inset-y-0 bg-accent transition-all duration-500 ease-out"
            style={{ left: `${previous * 100}%`, width: `${(unlocked - previous) * 100}%` }}
          />
          {/* Punched out of the fill so the stages stay countable at a glance. */}
          {bounds.slice(0, -1).map((pos, i) => (
            <span
              key={stages[i]}
              aria-hidden
              className="absolute inset-y-0 w-px bg-bg"
              style={{ left: `${pos * 100}%` }}
            />
          ))}
        </div>
        {head != null && (
          <span
            aria-hidden
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_10px_2px] shadow-accent/50"
            style={{ left: `${head * 100}%` }}
          />
        )}
      </div>

      <div aria-hidden className="mt-2 flex w-full">
        {stages.map((seconds, i) => (
          <span
            key={seconds}
            style={{ width: `${widths[i] * 100}%` }}
            className={`text-right font-mono text-[10px] tabular-nums transition-colors duration-300 ${
              i === currentIndex
                ? "text-accent"
                : i < currentIndex
                  ? "text-faint"
                  : "text-faint/60"
            }`}
          >
            {i === stages.length - 1 ? `${seconds}s` : seconds}
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

interface Props {
  /** Enabled stage lengths, ascending. */
  stages: number[];
  /** Index of the currently unlocked stage within `stages`. */
  currentIndex: number;
}

export default function StageTimeline({ stages, currentIndex }: Props) {
  return (
    <ol aria-label="Snippet stages" className="flex w-full gap-1.5">
      {stages.map((seconds, i) => {
        const state = i < currentIndex ? "burned" : i === currentIndex ? "current" : "locked";
        return (
          <li
            key={seconds}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex-1 rounded-lg border py-1.5 text-center font-mono text-xs transition-colors duration-300 ${
              state === "current"
                ? "border-accent/60 bg-accent/10 text-accent"
                : state === "burned"
                  ? "border-line bg-surface text-faint line-through opacity-60"
                  : "border-line/60 text-faint/70"
            }`}
          >
            {seconds}s
          </li>
        );
      })}
    </ol>
  );
}

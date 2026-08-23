"use client";

import { CaretRight, Check } from "@phosphor-icons/react";
import { DIFFICULTIES } from "@/lib/game-config";
import { WINS_TO_PROMOTE, type Progress } from "@/lib/progression";
import { TIER_STYLES } from "@/lib/tier-styles";
import type { Difficulty } from "@/lib/game-config";

interface Props {
  progress: Progress;
  onJump: (tier: Difficulty) => void;
}

export default function TierLadder({ progress, onJump }: Props) {
  const currentIndex = DIFFICULTIES.findIndex((d) => d.id === progress.tier);
  return (
    <ol aria-label="Difficulty ladder" className="flex flex-col gap-2.5">
      {DIFFICULTIES.map((d, i) => {
        const tier = TIER_STYLES[d.id];
        const isCurrent = i === currentIndex;
        const isBelow = i < currentIndex;
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => !isCurrent && onJump(d.id)}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={
                isCurrent ? `${d.label}, current tier` : `Jump to ${d.label}`
              }
              className={`group flex w-full items-center gap-4 rounded-2xl border px-5 py-3.5 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent ${
                isCurrent
                  ? "cursor-default border-line-strong bg-surface-2"
                  : `cursor-pointer border-line bg-surface opacity-80 hover:opacity-100 ${tier.cardHover}`
              }`}
            >
              <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${tier.dot}`} />
              <span className="flex-1">
                <span className={`font-display font-semibold ${tier.text}`}>
                  {d.label}
                </span>
                <span className="block text-xs text-dim">{d.tagline}</span>
              </span>
              {isCurrent ? (
                <span
                  className="flex items-center gap-1"
                  aria-label={`${progress.wins} of ${WINS_TO_PROMOTE} wins toward promotion`}
                >
                  {Array.from({ length: WINS_TO_PROMOTE }, (_, p) => (
                    <span
                      key={p}
                      aria-hidden
                      className={`size-2 rounded-full transition-colors duration-300 ${
                        p < progress.wins ? tier.dot : "bg-line-strong"
                      }`}
                    />
                  ))}
                </span>
              ) : isBelow ? (
                <Check size={16} aria-hidden className="text-faint" />
              ) : (
                <CaretRight
                  size={16}
                  aria-hidden
                  className="text-faint transition-transform duration-200 group-hover:translate-x-1"
                />
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

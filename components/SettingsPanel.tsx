"use client";

import { GearSix, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import VolumeSlider from "@/components/VolumeSlider";
import { STAGES } from "@/lib/game-config";

interface Props {
  volume: number;
  onVolume: (v: number) => void;
  enabledStages: number[];
  onToggleStage: (seconds: number) => void;
}

export default function SettingsPanel({
  volume,
  onVolume,
  enabledStages,
  onToggleStage,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Game settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-9 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent ${
          open
            ? "border-line-strong bg-surface-2 text-ink"
            : "border-line text-dim hover:border-line-strong hover:text-ink"
        }`}
      >
        <GearSix size={17} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Game settings"
          className="absolute right-0 top-11 z-30 w-72 animate-fade-up rounded-2xl border border-line bg-surface-2 p-5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)] [animation-duration:200ms]"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Settings</h3>
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded p-1 text-faint outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              Volume
            </p>
            <div className="mt-2 [&_input]:w-full [&_label]:w-full">
              <VolumeSlider volume={volume} onChange={onVolume} />
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              Stages
            </p>
            <p className="mt-1 text-xs text-dim">
              Turn snippet lengths on or off. Applies immediately.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {STAGES.map((s) => {
                const enabled = enabledStages.includes(s);
                const lastEnabled = enabled && enabledStages.length === 1;
                return (
                  <button
                    key={s}
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${s} second stage`}
                    disabled={lastEnabled}
                    title={lastEnabled ? "At least one stage must stay on" : undefined}
                    onClick={() => onToggleStage(s)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 font-mono text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${
                      enabled
                        ? "border-accent/60 bg-accent/15 text-accent"
                        : "border-line text-faint hover:border-line-strong hover:text-dim"
                    }`}
                  >
                    {s}s
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

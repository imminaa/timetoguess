"use client";

import { ArrowCounterClockwise, CaretDown, GearSix, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import FilterMatchCount from "@/components/FilterMatchCount";
import VolumeSlider from "@/components/VolumeSlider";
import { STAGES } from "@/lib/game-config";
import {
  DECADES,
  GENRE_FAMILIES,
  decadeLabel,
  type CatalogFilter,
  type GenreFamilyId,
} from "@/lib/music-taxonomy";

interface Props {
  volume: number;
  onVolume: (v: number) => void;
  enabledStages: number[];
  onToggleStage: (seconds: number) => void;
  genres: GenreFamilyId[];
  onToggleGenre: (id: GenreFamilyId) => void;
  decades: number[];
  onToggleDecade: (decade: number) => void;
  /** The selection as a draw restriction, for the live match count. */
  filter: CatalogFilter;
  /** Wipes stats, tier progress and settings. */
  onReset: () => void;
}

/**
 * One toggle in a multi-select group.
 *
 * Each group must keep a member — an empty genre list would mean "no song may
 * be drawn", not "any genre" — so the last one on disables itself rather than
 * silently refusing the tap.
 */
function Chip({
  label,
  on,
  last,
  lastHint,
  onToggle,
  ariaLabel,
}: {
  label: string;
  on: boolean;
  last: boolean;
  lastHint: string;
  onToggle: () => void;
  ariaLabel?: string;
}) {
  const locked = on && last;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={locked}
      title={locked ? lastHint : undefined}
      onClick={onToggle}
      className={`min-h-9 cursor-pointer rounded-full border px-3 py-1.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${
        on
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-line text-faint hover:border-line-strong hover:text-dim"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * A collapsible filter group.
 *
 * Thirteen genres and eight decades would triple the panel's height if they
 * were always open, burying the volume and reset controls below the fold. The
 * header carries the selection summary so a collapsed group still tells you
 * whether it is filtering anything.
 */
function FilterSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t border-line pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-dim">{summary}</span>
          <CaretDown
            size={12}
            aria-hidden
            className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="animate-fade-up [animation-duration:180ms]">{children}</div>}
    </div>
  );
}

export default function SettingsPanel({
  volume,
  onVolume,
  enabledStages,
  onToggleStage,
  genres,
  onToggleGenre,
  decades,
  onToggleDecade,
  filter,
  onReset,
}: Props) {
  const [open, setOpen] = useState(false);
  // Reset is destructive and there is no modal in this app, so the button
  // arms itself on the first press and fires on the second.
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback(() => {
    setOpen(false);
    setConfirming(false);
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) closePanel();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, closePanel]);

  const summarize = (selected: number, total: number) =>
    selected === total ? "All" : `${selected} of ${total}`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Game settings"
        aria-expanded={open}
        onClick={() => (open ? closePanel() : setOpen(true))}
        className={`flex size-10 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent ${
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
          className="absolute right-0 top-12 z-30 max-h-[min(78vh,42rem)] w-72 max-w-[calc(100vw-2rem)] animate-fade-up overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface-2 p-5 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)] [animation-duration:200ms]"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Settings</h3>
            <button
              type="button"
              aria-label="Close settings"
              onClick={closePanel}
              className="-m-1.5 cursor-pointer rounded p-1.5 text-faint outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
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
              {STAGES.map((s) => (
                <Chip
                  key={s}
                  label={`${s}s`}
                  ariaLabel={`${s} second stage`}
                  on={enabledStages.includes(s)}
                  last={enabledStages.length === 1}
                  lastHint="At least one stage must stay on"
                  onToggle={() => onToggleStage(s)}
                />
              ))}
            </div>
          </div>

          <FilterSection
            title="Genres"
            summary={summarize(genres.length, GENRE_FAMILIES.length)}
          >
            <p className="mt-1.5 text-xs text-dim">
              Only songs in these genres will be played.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {GENRE_FAMILIES.map((f) => (
                <Chip
                  key={f.id}
                  label={f.label}
                  on={genres.includes(f.id)}
                  last={genres.length === 1}
                  lastHint="At least one genre must stay on"
                  onToggle={() => onToggleGenre(f.id)}
                />
              ))}
            </div>
          </FilterSection>

          <FilterSection
            title="Decades"
            summary={summarize(decades.length, DECADES.length)}
          >
            <p className="mt-1.5 text-xs text-dim">
              Only songs released in these decades will be played.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {DECADES.map((d) => (
                <Chip
                  key={d}
                  label={decadeLabel(d)}
                  on={decades.includes(d)}
                  last={decades.length === 1}
                  lastHint="At least one decade must stay on"
                  onToggle={() => onToggleDecade(d)}
                />
              ))}
            </div>
          </FilterSection>

          <FilterMatchCount filter={filter} />

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              Reset
            </p>
            <p className="mt-1 text-xs text-dim">
              Clears your stats, streak, tier progress and settings from this
              device. Can&apos;t be undone.
            </p>
            <button
              type="button"
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                closePanel();
                onReset();
              }}
              className={`mt-2.5 flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-bad ${
                confirming
                  ? "border-bad bg-bad/15 font-medium text-bad"
                  : "border-line text-dim hover:border-bad/50 hover:text-bad"
              }`}
            >
              <ArrowCounterClockwise size={15} aria-hidden />
              {confirming ? "Tap again to erase everything" : "Reset all data"}
            </button>
            <span aria-live="polite" className="sr-only">
              {confirming ? "Confirm reset: press the button again to erase all data." : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

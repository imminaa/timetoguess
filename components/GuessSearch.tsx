"use client";

import { CircleNotch, MagnifyingGlass, MusicNote } from "@phosphor-icons/react";
import Image from "next/image";
import { GUESS_INPUT_PROPS, useGuessSearch } from "@/lib/use-guess-search";
import type { SearchResult } from "@/lib/types";

interface Props {
  onGuess: (result: SearchResult) => void;
  disabled?: boolean;
  /** Increment to trigger a "wrong guess" shake. */
  shakeSignal: number;
}

export default function GuessSearch({ onGuess, disabled, shakeSignal }: Props) {
  // Destructured, not held as one object: the refs travel as their own
  // bindings so the compiler can tell them apart from the render-time values.
  const {
    query,
    setQuery,
    results,
    open,
    loading,
    highlight,
    setHighlight,
    listMaxHeight,
    listId,
    pick,
    onKeyDown,
    onFocus,
    wrapRef,
    inputRef,
  } = useGuessSearch({ onGuess, shakeSignal });

  return (
    <div ref={wrapRef} className="relative">
      <MagnifyingGlass
        size={18}
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        {...GUESS_INPUT_PROPS}
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Guess the song"
        placeholder="Know it? Name it…"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        /* text-base is load-bearing: Safari zooms the whole page in when you
           focus an input under 16px, and never zooms back out. */
        className="h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-11 text-base text-ink placeholder:text-faint outline-none transition-colors duration-200 focus:border-accent/60 focus:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {loading && (
        <CircleNotch
          size={18}
          aria-hidden
          className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-faint"
        />
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Song suggestions"
          style={{ maxHeight: listMaxHeight }}
          className="absolute inset-x-0 top-full z-20 mt-2 animate-fade-up overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-2 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)] [animation-duration:200ms]"
        >
          {results.length === 0 && !loading ? (
            <li className="px-4 py-3 text-sm text-faint">No matches yet. Keep typing?</li>
          ) : (
            results.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  onPointerEnter={() => setHighlight(i)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 ${
                    i === highlight ? "bg-ink/10" : ""
                  }`}
                >
                  {r.artUrl ? (
                    <Image
                      src={r.artUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-line text-faint">
                      <MusicNote size={16} aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {r.title}
                    </span>
                    <span className="block truncate text-xs text-dim">
                      {r.artists.join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

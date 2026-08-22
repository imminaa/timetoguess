"use client";

import { CircleNotch, MagnifyingGlass, MusicNote } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/types";

interface Props {
  onGuess: (result: SearchResult) => void;
  disabled?: boolean;
  /** Increment to trigger a "wrong guess" shake. */
  shakeSignal: number;
}

export default function GuessSearch({ onGuess, disabled, shakeSignal }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listMaxHeight, setListMaxHeight] = useState(288);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = "guess-search-listbox";

  useEffect(() => {
    if (!shakeSignal) return;
    // Retrigger the CSS animation without a render: drop the class, force a
    // reflow, re-add it.
    const el = wrapRef.current;
    if (!el) return;
    el.classList.remove("animate-shake");
    void el.offsetWidth;
    el.classList.add("animate-shake");
    const t = setTimeout(() => el.classList.remove("animate-shake"), 500);
    return () => clearTimeout(t);
  }, [shakeSignal]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(data.results ?? []);
        setHighlight(0);
        setOpen(true);
        setLoading(false);
      } catch {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  // The suggestions hang below the input, and on a phone the software keyboard
  // is sitting right there. iOS doesn't shrink the layout viewport for it, so
  // a fixed max-height simply renders half the list underneath the keys —
  // measure the actually-visible area instead.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const measure = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const room = visibleBottom - rect.bottom - 16;
      // Never collapse to nothing: below ~9rem the list scrolls internally.
      setListMaxHeight(Math.max(144, Math.min(288, room)));
    };
    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const pick = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onGuess(result);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <MagnifyingGlass
        size={18}
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Guess the song"
        placeholder="Know it? Name it…"
        // Song titles are not sentences: iOS auto-capitalising and
        // auto-correcting them fights the autocomplete on every keystroke.
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          if (value.trim().length < 2) {
            setResults([]);
            setOpen(false);
            setLoading(false);
          } else {
            setLoading(true);
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
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

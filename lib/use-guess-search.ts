"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/types";

/**
 * The guess combobox, minus its looks.
 *
 * Everything fiddly about this control — the debounce, the in-flight abort,
 * roving keyboard selection, and measuring how much room the iOS keyboard has
 * left for the suggestion list — is behaviour, not styling. Designs differ in
 * how the input and the options are drawn; none of them differ in this.
 */

interface Options {
  onGuess: (result: SearchResult) => void;
  /** Increment to trigger a "wrong guess" shake on the returned wrapRef. */
  shakeSignal: number;
}

export interface GuessSearch {
  query: string;
  setQuery: (value: string) => void;
  results: SearchResult[];
  open: boolean;
  loading: boolean;
  /** Index of the option under the keyboard cursor. */
  highlight: number;
  setHighlight: (index: number) => void;
  /** Pixel cap for the listbox, measured against the visual viewport. */
  listMaxHeight: number;
  listId: string;
  pick: (result: SearchResult) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  /** Put on the element that should shake, and that outside-clicks close from. */
  wrapRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function useGuessSearch({ onGuess, shakeSignal }: Options): GuessSearch {
  const [query, setQueryState] = useState("");
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

  const setQuery = (value: string) => {
    setQueryState(value);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
    } else {
      setLoading(true);
    }
  };

  const pick = (result: SearchResult) => {
    setQueryState("");
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

  const onFocus = () => {
    if (results.length > 0) setOpen(true);
  };

  return {
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
  };
}

/**
 * Keyboard hygiene every design needs verbatim. Song titles are not sentences:
 * iOS auto-capitalising and auto-correcting them fights the autocomplete on
 * every keystroke.
 *
 * The ARIA contract (`role`, `aria-expanded`, `aria-controls`, …) is left to
 * each design to spell out — hiding a role inside a spread blinds the a11y
 * lint rules that check the attributes around it.
 */
export const GUESS_INPUT_PROPS = {
  type: "text",
  autoCapitalize: "none",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
  enterKeyHint: "search",
} as const;

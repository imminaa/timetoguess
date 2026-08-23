"use client";

import { Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { filterToParams, type CatalogFilter } from "@/lib/music-taxonomy";
import type { CatalogCounts, CatalogResponse } from "@/lib/types";

/**
 * How many songs the current genre/decade filter leaves to play with.
 *
 * A filter can be perfectly reasonable-looking and still empty a tier — the
 * easy band holds no Classical at all and only twelve Country songs — and
 * without this the player finds out when a round refuses to start, with no
 * clue which of the two filters to loosen. Showing the count while the filter
 * is being set turns that failure into a thing you can see coming.
 */

const DEBOUNCE_MS = 350;

interface Props {
  filter: CatalogFilter;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; counts: CatalogCounts }
  | { kind: "failed" };

const format = (n: number) => n.toLocaleString("en-US");

export default function FilterMatchCount({ filter }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  // The filter object is rebuilt on every render; its serialized form is not,
  // so the effect re-runs only when the selection actually changed.
  const params = new URLSearchParams();
  filterToParams(filter, params);
  const query = params.toString();

  useEffect(() => {
    // Toggling chips fires this on every tap; the last one wins and the rest
    // are cancelled before they reach the network.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ kind: "loading" });
      fetch(`/api/catalog?${query}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error();
          const { counts } = (await res.json()) as CatalogResponse;
          setState({ kind: "ready", counts });
        })
        .catch(() => {
          // Aborts land here too; the replacement request owns the state now.
          if (!controller.signal.aborted) setState({ kind: "failed" });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (state.kind === "failed") return null;

  if (state.kind !== "ready") {
    return (
      <p className="mt-2 h-4 text-xs text-faint" aria-hidden>
        {state.kind === "loading" ? "Counting…" : ""}
      </p>
    );
  }

  const { easy, medium, impossible } = state.counts;
  // Hard and Expert pick their artist out of the easy band, so an empty easy
  // band is an empty ladder for everything except Impossible.
  const broken = easy === 0;

  return (
    <div aria-live="polite" className="mt-2">
      {broken ? (
        <p className="flex items-start gap-1.5 text-xs text-bad">
          <Warning size={13} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Nothing matches at Easy, so Easy, Hard and Expert can&apos;t start. Turn
            on another genre or decade.
          </span>
        </p>
      ) : (
        <p className="font-mono text-xs text-faint">
          {format(easy)} easy · {format(medium)} medium · {format(impossible)} obscure
        </p>
      )}
    </div>
  );
}

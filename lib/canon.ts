import {
  chartSongs,
  dailyTopChartPlaylists,
  playlistSongs,
  searchPlaylists,
  type AppleSong,
} from "@/lib/apple";
import { normalizeArtist, normalizeTitle } from "@/lib/normalize";

/**
 * The candidate universe: songs famous enough to be worth guessing, drawn from
 * every era instead of just this week.
 *
 * Charts alone cannot do this. Apple's charts only ever describe the last few
 * days, so a chart-derived definition of "popular" structurally excludes every
 * classic — Billie Jean has not been on a chart since 1983. The fix is Apple's
 * editorial "Essentials" series, which is a per-decade canon of exactly the
 * songs everybody knows, plus the current charts for hits too new to have been
 * canonised yet.
 *
 * This module decides *membership*. How famous each song is relative to the
 * others is Last.fm's job — see lib/popularity.ts.
 */

/**
 * Apple documents none of these playlist ids, so they are resolved by search
 * and then verified by name. A term that stops resolving is skipped and
 * reported rather than silently dropping a whole decade.
 */
const CANON_TERMS = [
  "50s Hits Essentials",
  "60s Hits Essentials",
  "70s Hits Essentials",
  "80s Hits Essentials",
  "90s Hits Essentials",
  "2000s Hits Essentials",
  "2010s Hits Essentials",
  "80s Rock Essentials",
  "80s Soft Rock Essentials",
  "90s Alternative Essentials",
  "90s R&B Essentials",
  "90s Country Essentials",
  "2000s Alternative Essentials",
  "2000s Dance Party Essentials",
];

/** Apple's daily worldwide chart, for hits too new to be in a retrospective. */
const GLOBAL_CHART = "Top 100: Global";

const CACHE_MS = 12 * 60 * 60 * 1000;

/** Apple throttles a burst of parallel catalog reads; three at a time is safe. */
const FETCH_CONCURRENCY = 3;

/** Below this share of working sources the canon is too thin to define "popular". */
const MIN_HEALTHY = 0.5;

export interface CanonSource {
  label: string;
  songs: AppleSong[];
  /** Set when the source could not be resolved or fetched. */
  problem?: string;
  /** True when the problem is a throttle or outage rather than a real gap. */
  transient?: boolean;
}

function describe(err: unknown): Pick<CanonSource, "problem" | "transient"> {
  const problem = err instanceof Error ? err.message : "failed";
  return { problem, transient: /rate limit|failed: 5\d\d|fetch|network|timeout/i.test(problem) };
}

async function mapLimited<T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await task(items[i]);
    })
  );
  return out;
}

/** Compare editorial names ignoring Apple's curly apostrophes: "’80s" ≡ "80s". */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function songKey(song: AppleSong): string {
  return `${normalizeTitle(song.title)}|${normalizeArtist(song.artists[0] ?? "")}`;
}

async function essentialsSource(term: string): Promise<CanonSource> {
  try {
    const matches = await searchPlaylists(term);
    const hit = matches.find((p) => slug(p.name) === slug(term));
    if (!hit) {
      return { label: term, songs: [], problem: `no playlist named "${term}"` };
    }
    return { label: `${hit.name} (${hit.curator})`, songs: await playlistSongs(hit.id) };
  } catch (err) {
    return { label: term, songs: [], ...describe(err) };
  }
}

async function globalChartSource(): Promise<CanonSource> {
  try {
    const charts = await dailyTopChartPlaylists();
    const hit = charts.find((p) => slug(p.name) === slug(GLOBAL_CHART));
    if (!hit) {
      return { label: GLOBAL_CHART, songs: [], problem: "global chart playlist not found" };
    }
    return { label: hit.name, songs: await playlistSongs(hit.id) };
  } catch (err) {
    return { label: GLOBAL_CHART, songs: [], ...describe(err) };
  }
}

async function homeChartSource(): Promise<CanonSource> {
  try {
    // chartSongs uses APPLE_STOREFRONT, so this is the player's own market —
    // local-language hits that a worldwide chart would never carry.
    return { label: "Home storefront chart", songs: await chartSongs({ limit: 100 }) };
  } catch (err) {
    return { label: "Home storefront chart", songs: [], ...describe(err) };
  }
}

let cached: { at: number; sources: CanonSource[] } | null = null;

/** Every canon source with its diagnostics. Cached for half a day. */
export async function canonBreakdown(): Promise<CanonSource[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.sources;

  const builders: (() => Promise<CanonSource>)[] = [
    ...CANON_TERMS.map((term) => () => essentialsSource(term)),
    globalChartSource,
    homeChartSource,
  ];
  const sources = await mapLimited(builders, (build) => build());

  const usable = sources.filter((s) => s.songs.length > 0);
  if (usable.length < Math.ceil(sources.length * MIN_HEALTHY)) {
    const why = sources.find((s) => s.problem)?.problem ?? "unknown";
    throw new Error(
      `Could not build the song canon: only ${usable.length}/${sources.length} sources resolved (${why})`
    );
  }
  // A throttled build is usable now but must not be frozen in for half a day —
  // caching it would leave whole decades missing until the process restarts.
  if (!sources.some((s) => s.transient)) cached = { at: Date.now(), sources };
  return sources;
}

/** The deduplicated canon. */
export async function canonSongs(): Promise<AppleSong[]> {
  const seen = new Set<string>();
  const out: AppleSong[] = [];
  for (const source of await canonBreakdown()) {
    for (const song of source.songs) {
      const key = songKey(song);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(song);
    }
  }
  return out;
}

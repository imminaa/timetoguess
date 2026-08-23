import {
  chartSongs,
  dailyTopChartPlaylists,
  playlistSongs,
  searchPlaylists,
  topLevelGenres,
  type AppleSong,
  type PlaylistRef,
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
 * This module decides *membership*, and records how many independent sources
 * vouch for each song. How famous each one is relative to the others is
 * Last.fm's job — see lib/popularity.ts.
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
  // Genre cuts that carry the pre-1980 canon the decade "Hits" lists skim over.
  // Every term here was verified to resolve; anything that stops resolving is
  // reported by `canonBreakdown` rather than silently dropping its era.
  "50s Rock Essentials",
  "60s Rock Essentials",
  "60s Soul Essentials",
  "70s Rock Essentials",
  "70s Soul Essentials",
  "70s Country Essentials",
  "80s R&B Essentials",
  "80s Country Essentials",
  "90s Hip-Hop Essentials",
  "90s Rock Essentials",
  "2000s Hip-Hop Essentials",
  "2000s Rock Essentials",
  "2000s Country Essentials",
  "2010s Hip-Hop Essentials",
  "2010s Rock Essentials",
  "2010s Country Essentials",
  "Classic Rock Essentials",
  "Motown Essentials",
  "New Wave Essentials",
  "Funk Essentials",
];

/**
 * Markets whose daily Top 100 is worth pulling. Apple exposes 116 of these and
 * the canon used to read exactly one, which meant "current hit" silently meant
 * "current hit in the anglosphere". Names resolve from the `us` storefront, so
 * they are stable English; anything that stops resolving is skipped.
 */
const CHART_MARKETS = [
  "Top 100: Global",
  "Top 100: USA",
  "Top 100: UK",
  "Top 100: Canada",
  "Top 100: Australia",
  "Top 100: Ireland",
  "Top 100: Germany",
  "Top 100: France",
  "Top 100: Italy",
  "Top 100: Spain",
  "Top 100: Netherlands",
  "Top 100: Sweden",
  "Top 100: Poland",
  "Top 100: Brazil",
  "Top 100: Mexico",
  "Top 100: Argentina",
  "Top 100: Japan",
  "Top 100: South Korea",
  "Top 100: India",
  "Top 100: Nigeria",
];

/**
 * Artists to pull an "<Artist> Essentials" playlist for, ranked by how often
 * they already appear in the editorial canon. Apple curates one of these per
 * major artist — 25-40 tracks answering "which of their songs does everyone
 * know" across the whole career, which is precisely the question the game
 * asks, and the single richest source of well-known songs available.
 */
const ARTIST_ESSENTIALS = 250;

const CACHE_MS = 12 * 60 * 60 * 1000;

/** Apple throttles a burst of parallel catalog reads; three at a time is safe. */
const FETCH_CONCURRENCY = 3;

/** Below this share of working sources the canon is too thin to define "popular". */
const MIN_HEALTHY = 0.5;

export type SourceKind = "editorial" | "chart";

export interface CanonSource {
  label: string;
  /**
   * Editorial playlists are a curated verdict on what is worth knowing; charts
   * are a snapshot of this week. They must not be weighed the same — see
   * `topArtists`.
   */
  kind: SourceKind;
  songs: AppleSong[];
  /** Set when the source could not be resolved or fetched. */
  problem?: string;
  /** True when the problem is a throttle or outage rather than a real gap. */
  transient?: boolean;
}

export interface CanonEntry {
  song: AppleSong;
  /**
   * How many independent sources carry this song. A track in '80s Hits *and*
   * '80s Rock *and* Top 100: Global is more canonical than one that squeaked
   * into a single playlist, and this is the only popularity signal in the
   * system that does not come from Last.fm.
   */
  sources: number;
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

/** Resolve an editorial playlist by exact name and read its tracks. */
async function playlistSource(term: string, label = term): Promise<CanonSource> {
  try {
    const matches = await searchPlaylists(term);
    const hit = matches.find((p) => slug(p.name) === slug(term));
    if (!hit) {
      return { label, kind: "editorial", songs: [], problem: `no playlist named "${term}"` };
    }
    return {
      label: `${hit.name} (${hit.curator})`,
      kind: "editorial",
      songs: await playlistSongs(hit.id),
    };
  } catch (err) {
    return { label, kind: "editorial", songs: [], ...describe(err) };
  }
}

async function refSource(ref: PlaylistRef): Promise<CanonSource> {
  try {
    return { label: ref.name, kind: "chart", songs: await playlistSongs(ref.id) };
  } catch (err) {
    return { label: ref.name, kind: "chart", songs: [], ...describe(err) };
  }
}

/** The daily Top 100 of each major market. */
async function chartSources(): Promise<CanonSource[]> {
  let charts: PlaylistRef[];
  try {
    charts = await dailyTopChartPlaylists();
  } catch (err) {
    return [{ label: "Daily top charts", kind: "chart", songs: [], ...describe(err) }];
  }
  const wanted = CHART_MARKETS.map((name) => ({
    name,
    ref: charts.find((p) => slug(p.name) === slug(name)),
  }));
  return mapLimited(wanted, async ({ name, ref }) =>
    ref
      ? refSource(ref)
      : { label: name, kind: "chart" as const, songs: [], problem: `chart "${name}" not found` }
  );
}

/**
 * Apple's most-played chart per genre. Recency-skewed like any chart, so what
 * this contributes is breadth past the pop/rock centre of the Essentials
 * playlists; the popularity floors in lib/popularity.ts decide what survives.
 */
async function genreSources(): Promise<CanonSource[]> {
  let genres: { id: number; name: string }[];
  try {
    genres = await topLevelGenres();
  } catch (err) {
    return [{ label: "Genre charts", kind: "chart", songs: [], ...describe(err) }];
  }
  // Holiday is excluded on purpose: it is the one genre whose chart depends on
  // *when the snapshot was built*, so including it makes the canon irreproducible
  // — a December build would flood every decade band with Christmas records.
  const usable = genres.filter((g) => !/holiday|christmas/i.test(g.name));
  return mapLimited(usable, async (genre) => {
    try {
      return {
        label: `Genre chart: ${genre.name}`,
        kind: "chart" as const,
        songs: await chartSongs({ limit: 100, genreId: genre.id }),
      };
    } catch (err) {
      return { label: `Genre chart: ${genre.name}`, kind: "chart" as const, songs: [], ...describe(err) };
    }
  });
}

async function homeChartSource(): Promise<CanonSource> {
  try {
    // chartSongs uses APPLE_STOREFRONT, so this is the player's own market —
    // local-language hits that a worldwide chart would never carry.
    return {
      label: "Home storefront chart",
      kind: "chart",
      songs: await chartSongs({ limit: 100 }),
    };
  } catch (err) {
    return { label: "Home storefront chart", kind: "chart", songs: [], ...describe(err) };
  }
}

/**
 * The artists the canon vouches for most, best represented first.
 *
 * Editorial appearances are counted in full; every chart appearance together
 * counts once. Weighing them equally hands the list to whoever is charting
 * this week — an artist on 20 country Top 100s outscores Elvis on two
 * Essentials playlists twenty to two — which then aims the per-artist
 * Essentials fetch at current chart acts and leaves the classics out of the
 * canon entirely. Johnny B. Goode, Jailhouse Rock and (I Can't Get No)
 * Satisfaction were all missing for exactly this reason.
 */
export function topArtists(sources: readonly CanonSource[], count: number): string[] {
  const tally = new Map<string, { name: string; editorial: number; charted: boolean }>();
  for (const source of sources) {
    const seenHere = new Set<string>();
    for (const song of source.songs) {
      const key = normalizeArtist(song.primaryArtist);
      if (!key) continue;
      const entry = tally.get(key) ?? { name: song.primaryArtist, editorial: 0, charted: false };
      if (source.kind === "editorial") entry.editorial++;
      else if (!seenHere.has(key)) entry.charted = true;
      seenHere.add(key);
      tally.set(key, entry);
    }
  }
  const weight = (a: { editorial: number; charted: boolean }) => a.editorial + (a.charted ? 1 : 0);
  return [...tally.values()]
    .sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((a) => a.name);
}

let cached: { at: number; deep: boolean; sources: CanonSource[] } | null = null;

export interface CanonOptions {
  /**
   * Also pull a per-artist Essentials playlist for the best-represented
   * artists. Two Apple requests per artist, so it belongs in the snapshot
   * build (scripts/build-canon.ts) rather than in a cold request path.
   */
  deep?: boolean;
  onProgress?: (message: string) => void;
}

/** Every canon source with its diagnostics. Cached for half a day. */
export async function canonBreakdown(options: CanonOptions = {}): Promise<CanonSource[]> {
  const deep = options.deep ?? false;
  const note = options.onProgress ?? (() => {});
  if (cached && cached.deep === deep && Date.now() - cached.at < CACHE_MS) return cached.sources;

  note("resolving editorial playlists and charts…");
  const [essentials, charts, genres, home] = await Promise.all([
    mapLimited(CANON_TERMS, (term) => playlistSource(term)),
    chartSources(),
    genreSources(),
    homeChartSource(),
  ]);
  const base = [...essentials, ...charts, ...genres, home];

  let sources = base;
  if (deep) {
    const artists = topArtists(base, ARTIST_ESSENTIALS);
    note(`pulling Essentials for ${artists.length} artists…`);
    const perArtist = await mapLimited(artists, (name) =>
      playlistSource(`${name} Essentials`, `Essentials: ${name}`)
    );
    // Most artists have no Essentials playlist; that is expected, not a fault,
    // so a missing one must not count against the health check below.
    sources = [...base, ...perArtist.filter((s) => s.songs.length > 0)];
  }

  const usable = sources.filter((s) => s.songs.length > 0);
  if (usable.length < Math.ceil(base.length * MIN_HEALTHY)) {
    const why = sources.find((s) => s.problem)?.problem ?? "unknown";
    throw new Error(
      `Could not build the song canon: only ${usable.length}/${base.length} sources resolved (${why})`
    );
  }
  // A throttled build is usable now but must not be frozen in for half a day —
  // caching it would leave whole decades missing until the process restarts.
  if (!sources.some((s) => s.transient)) cached = { at: Date.now(), deep, sources };
  return sources;
}

/** The deduplicated canon, each song carrying how many sources vouch for it. */
export async function canonEntries(options: CanonOptions = {}): Promise<CanonEntry[]> {
  const byKey = new Map<string, CanonEntry>();
  for (const source of await canonBreakdown(options)) {
    // A song listed twice inside one playlist must not count as two sources.
    const seenHere = new Set<string>();
    for (const song of source.songs) {
      const key = songKey(song);
      if (seenHere.has(key)) continue;
      seenHere.add(key);
      const prev = byKey.get(key);
      if (prev) {
        prev.sources++;
        // Prefer the copy that can actually be played and shown.
        if (!prev.song.previewUrl && song.previewUrl) prev.song = song;
      } else {
        byKey.set(key, { song, sources: 1 });
      }
    }
  }
  return [...byKey.values()];
}

/** The deduplicated canon. */
export async function canonSongs(options: CanonOptions = {}): Promise<AppleSong[]> {
  return (await canonEntries(options)).map((e) => e.song);
}

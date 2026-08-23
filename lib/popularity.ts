import type { AppleSong } from "@/lib/apple";
import { canonEntries, type CanonEntry, type CanonOptions } from "@/lib/canon";
import { loadSnapshot, type ScoredSong } from "@/lib/canon-snapshot";
import { artistCatalog, mapAtLookupRate, songPopularity } from "@/lib/lastfm";
import { matchesFilter, NO_FILTER, type CatalogFilter } from "@/lib/music-taxonomy";

/**
 * How famous each canon song is, on one scale that spans artists and decades.
 *
 * Ranking is deliberately not "listeners, descending". Four weak signals are
 * combined because each one is wrong on its own:
 *
 *  - cohort-relative listeners, so a 2024 hit is not punished for having had
 *    two years to accumulate scrobbles instead of forty;
 *  - how many independent canon sources vouch for the song, the only signal
 *    here that does not come from Last.fm at all;
 *  - plays-per-listener, which separates a song with broad casual reach from
 *    a cult favourite with a small devoted audience;
 *  - the song's rank within its own artist's catalog, which is Apple's
 *    all-time play ordering rather than a scrobble count.
 *
 * Tier boundaries are quantiles and the floors are multiples of the canon's
 * own median, never hardcoded playcounts: Last.fm's absolute counts climb
 * every year and skew heavily by genre, so "the top tenth of the canon" stays
 * meaningful where "over five million plays" would quietly rot.
 */

export type { ScoredSong };

/** Raw measurement, before it can be scored against its cohort. */
interface Measured {
  song: AppleSong;
  listeners: number;
  plays: number;
  cohort: string;
  sources: number;
  artistRank: number | null;
}

/** Quantile of the canon, best-known first, that each tier draws from. */
export const TIER_BANDS = {
  easy: [0, 0.1],
  medium: [0.1, 0.35],
  impossible: [0.7, 1],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Minimum listeners for a tier, as a multiple of the canon's median.
 *
 * This is what stops cohort normalization from promoting the wrong songs. A
 * mid-tier recent single divided by a thin 2020s median produced a score of
 * 5.59x and landed in "the songs everybody knows" on 414k listeners, above
 * Take On Me on 2.9M. A floor expressed against the canon's own median is
 * absolute in effect without rotting as scrobble counts inflate.
 */
export const TIER_FLOORS = {
  easy: 1.5,
  medium: 0.6,
  hard: 0.35,
  expert: 0.08,
  impossible: 0,
} as const;

/** Weight of a doubling of source count. 1 source 1.00x, 4 sources ~1.70x. */
const MULTIPLICITY_WEIGHT = 0.35;
/** How far plays-per-listener may move a score either way. */
const BREADTH_RANGE = [0.75, 1.35] as const;
/** Bonus for being at the top of the artist's own all-time ranking. */
const RANK_BONUS = 0.2;
const RANK_DECAY = 5;

/**
 * Pulls a thin decade's baseline toward the overall median in proportion to
 * how little of it was measured. The old rule was a cliff — a cohort with 8+
 * samples used its own median, otherwise the global one — which meant the
 * 1950s either had every song crushed by a global median built from far
 * bigger modern cohorts, or, once past the threshold, every song inflated by
 * its own small one. Neither produced a usable easy tier: the band contained
 * zero 1950s songs against 58 in the canon.
 */
const SHRINK_K = 25;

/**
 * Which point of a decade's distribution counts as "a well-known song of that
 * era". Not the median: the canon's tail composition differs wildly by decade
 * — the 1960s arrive via curated Essentials playlists, the 2020s via twenty
 * country charts carrying a great deal of filler. Taking the middle of each
 * made the 2020s baseline collapse to filler level, which handed every real
 * recent hit a ratio of up to 168x and gave that one decade 46% of the easy
 * tier. A high quantile is stable against however much tail a decade has.
 */
const COHORT_QUANTILE = 0.85;

/**
 * Songs needed to *define* a baseline (they are all still ranked against it).
 * A track on exactly one country chart is weak evidence of what an era's
 * well-known songs look like; two independent sources is the canon actually
 * vouching for it.
 */
const BASELINE_MIN_SOURCES = 2;

/**
 * Songs scored before the quantiles are trusted, when running without a
 * prebuilt snapshot. Lookups are batched per artist now, so this covers far
 * more of the canon per request than the old per-song cap did — but a cold
 * request path still should not score thousands. Build the snapshot instead:
 *   npm run build-canon
 */
const MIN_SCORED = 600;
const BLOCK = 300;

function cohortOf(song: AppleSong): string {
  return song.year ? String(Math.floor(song.year / 10) * 10) : "unknown";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/** Geometric blend of a cohort's own reference point and the overall one. */
function shrunkBaseline(values: number[], overall: number): number {
  const own = quantile(values, COHORT_QUANTILE);
  if (own <= 0) return overall;
  const w = values.length / (values.length + SHRINK_K);
  return Math.exp(w * Math.log(own) + (1 - w) * Math.log(overall));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Score every measurement against its decade, most-famous-for-its-era first. */
export function rankMeasurements(measured: readonly Measured[]): ScoredSong[] {
  if (measured.length === 0) return [];
  // Only well-vouched-for songs define the baselines; every song is scored
  // against them. Falling back to the whole set keeps a canon with no
  // multi-source songs (a small live build) from dividing by zero.
  const defining = measured.filter((m) => m.sources >= BASELINE_MIN_SOURCES);
  const reference = defining.length > 0 ? defining : measured;
  const byCohort = new Map<string, number[]>();
  for (const m of reference) {
    const bucket = byCohort.get(m.cohort);
    if (bucket) bucket.push(m.listeners);
    else byCohort.set(m.cohort, [m.listeners]);
  }
  const overall = quantile(reference.map((m) => m.listeners), COHORT_QUANTILE) || 1;
  const baseline = new Map<string, number>();
  for (const [key, listeners] of byCohort) {
    baseline.set(key, shrunkBaseline(listeners, overall) || overall);
  }
  // Plays-per-listener has no meaningful absolute scale, only a relative one.
  const medianRatio =
    median(measured.filter((m) => m.listeners > 0).map((m) => m.plays / m.listeners)) || 1;

  return measured
    .map((m) => {
      const cohortRatio = m.listeners / (baseline.get(m.cohort) ?? overall);
      const multiplicity = 1 + MULTIPLICITY_WEIGHT * Math.log2(Math.max(1, m.sources));
      const ratio = m.listeners > 0 ? m.plays / m.listeners : medianRatio;
      // A low ratio means many people heard it once: broad reach, not devotion.
      const breadth = clamp(medianRatio / (ratio || medianRatio), ...BREADTH_RANGE);
      const rank =
        m.artistRank === null ? 1 : 1 + RANK_BONUS * Math.exp(-(m.artistRank - 1) / RANK_DECAY);
      return { ...m, score: cohortRatio * multiplicity * breadth * rank };
    })
    .sort((a, b) => b.score - a.score || b.listeners - a.listeners);
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Measure one canon entry. Null when its popularity cannot be established. */
export async function measureEntry(entry: CanonEntry): Promise<Measured | null> {
  // The unsplit catalog name: Last.fm files September under "Earth, Wind &
  // Fire" and hands back a 1,215-listener stranger for "Earth". The split lead
  // artist goes along as an alternate, because a collaboration credit like
  // "Daft Punk, Pharrell Williams & Nile Rodgers" is its own near-empty
  // Last.fm page while the song really lives under "Daft Punk".
  const found = await songPopularity(entry.song.primaryArtist, entry.song.title, [
    entry.song.artists[0] ?? "",
  ]);
  if (!found || !found.confident) return null;
  return {
    song: entry.song,
    listeners: found.listeners,
    plays: found.plays,
    artistRank: found.artistRank,
    cohort: cohortOf(entry.song),
    sources: entry.sources,
  };
}

export interface ScoreReport {
  songs: ScoredSong[];
  /** Songs Last.fm genuinely could not place. */
  missing: number;
  /** Songs lost to an API failure — a build problem, not obscurity. */
  failed: number;
  /** One example failure, for the build log. */
  firstError: string | null;
}

/** Score an entire canon. Used by the snapshot build; reports progress. */
export async function scoreCanon(
  entries: readonly CanonEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<ScoreReport> {
  const measured: Measured[] = [];
  let missing = 0;
  let failed = 0;
  let firstError: string | null = null;
  let done = 0;
  // Grouping by artist means the per-artist catalog request is made once and
  // every other song by that artist is answered from cache.
  const byArtist = new Map<string, CanonEntry[]>();
  for (const entry of entries) {
    const key = entry.song.primaryArtist.toLowerCase();
    const bucket = byArtist.get(key);
    if (bucket) bucket.push(entry);
    else byArtist.set(key, [entry]);
  }
  await mapAtLookupRate([...byArtist.values()], async (group) => {
    for (const entry of group) {
      try {
        const m = await measureEntry(entry);
        if (m) measured.push(m);
        else missing++;
      } catch (err) {
        // One artist's outage must not abort a build of thousands — but it
        // must not be mistaken for the song being obscure either.
        failed++;
        firstError ??= err instanceof Error ? err.message : String(err);
      }
      onProgress?.(++done, entries.length);
    }
  });
  return { songs: rankMeasurements(measured), missing, failed, firstError };
}

let live: { queue: CanonEntry[]; measured: Measured[] } | null = null;
let ranked: ScoredSong[] | null = null;

/** Score another slice of the canon. False once the canon is used up. */
async function scoreBlock(): Promise<boolean> {
  if (!live) live = { queue: shuffle(await canonEntries()), measured: [] };
  const batch = live.queue.splice(0, BLOCK);
  if (batch.length === 0) return false;
  const results = await mapAtLookupRate(batch, (entry) =>
    measureEntry(entry).catch(() => null)
  );
  live.measured.push(...results.filter((r): r is Measured => r !== null));
  ranked = null;
  return true;
}

/**
 * The ranked canon. Served from the prebuilt snapshot when there is one, which
 * is the supported configuration; otherwise scored live on first use.
 */
export async function rankedCanon(): Promise<ScoredSong[]> {
  if (ranked) return ranked;
  const snapshot = loadSnapshot();
  if (snapshot) {
    ranked = snapshot.songs;
    return ranked;
  }
  while ((live?.measured.length ?? 0) < MIN_SCORED) {
    if (!(await scoreBlock())) break;
  }
  if (!live || live.measured.length === 0) {
    throw new Error(
      "Last.fm returned no usable popularity data for any canon song. Check LASTFM_API_KEY."
    );
  }
  ranked = rankMeasurements(live.measured);
  return ranked;
}

/** Median listeners across the ranked canon — the basis for every tier floor. */
export async function medianListeners(): Promise<number> {
  const all = await rankedCanon();
  return median(all.map((s) => s.listeners)) || 1;
}

/** The absolute listener floor a song must clear to be served at this tier. */
export async function listenerFloor(tier: keyof typeof TIER_FLOORS): Promise<number> {
  return TIER_FLOORS[tier] * (await medianListeners());
}

/** Everything scored, best-known first. Exported for the calibration script. */
export async function popularitySnapshot(): Promise<ScoredSong[]> {
  return [...(await rankedCanon())];
}

/**
 * The songs of a tier's quantile band that also clear its listener floor.
 *
 * A genre/decade filter narrows the band *after* it is cut, never before.
 * Ranking the filtered subset instead would redefine every tier: the top tenth
 * of jazz alone is not "the songs everybody knows", it is the songs a jazz
 * listener knows, and easy would quietly become hard for any narrow pick. The
 * cost is that a thin filter can empty a tier outright — which the caller is
 * expected to report rather than paper over.
 */
export async function tierSongs(
  tier: keyof typeof TIER_BANDS,
  filter: CatalogFilter = NO_FILTER
): Promise<ScoredSong[]> {
  const all = await rankedCanon();
  const band = TIER_BANDS[tier];
  const floor = await listenerFloor(tier);
  const from = Math.floor(all.length * band[0]);
  const to = Math.max(from + 1, Math.ceil(all.length * band[1]));
  return all
    .slice(from, to)
    .filter((s) => s.listeners >= floor && matchesFilter(s.song, filter));
}

/** A random sample of the tier's songs. */
export async function sampleTier(
  tier: keyof typeof TIER_BANDS,
  want: number,
  filter: CatalogFilter = NO_FILTER
): Promise<AppleSong[]> {
  return shuffle(await tierSongs(tier, filter))
    .slice(0, want)
    .map((s) => s.song);
}

/**
 * How many canon songs each directly-drawn tier has under a filter.
 *
 * `/api/catalog` serves this so the settings panel can show the damage before
 * a player starts a round they cannot finish. The artist-driven tiers are
 * absent on purpose: they pick their artist out of the easy band, so `easy`
 * being non-zero is exactly the condition for hard and expert to work too.
 */
export async function tierCounts(
  filter: CatalogFilter
): Promise<Record<keyof typeof TIER_BANDS, number>> {
  const tiers = Object.keys(TIER_BANDS) as (keyof typeof TIER_BANDS)[];
  const counts = await Promise.all(
    tiers.map(async (tier) => [tier, (await tierSongs(tier, filter)).length] as const)
  );
  return Object.fromEntries(counts) as Record<keyof typeof TIER_BANDS, number>;
}

/** Minimum tracks over the hard floor before an artist counts as deep enough. */
const DEEP_CATALOG_TRACKS = 8;

/**
 * True when the artist has enough well-known material for a "fan favourite"
 * round to be fair. Without this the hard tier picks a one-hit act, takes the
 * songs *after* their one hit, and asks you to name something nobody has heard.
 */
export async function hasDeepCatalog(artist: string, floor: number): Promise<boolean> {
  const catalog = await artistCatalog(artist);
  let deep = 0;
  for (const track of catalog.tracks.values()) {
    if (track.listeners >= floor && ++deep >= DEEP_CATALOG_TRACKS) return true;
  }
  return false;
}

/**
 * The artist's own tracks ranked by listeners, best-known first. This is the
 * ordering the hard tier needs: Apple's top-songs view stops at 25 and mixes
 * in re-releases, and its rank 6 for a one-hit act is not a fan favourite.
 */
export async function artistRanking(
  artist: string
): Promise<{ title: string; listeners: number }[]> {
  const catalog = await artistCatalog(artist);
  return [...catalog.tracks.entries()]
    .map(([title, stat]) => ({ title, listeners: stat.listeners }))
    .sort((a, b) => b.listeners - a.listeners);
}

/**
 * The best-known canon songs, used to pick the artists behind the deep-cut
 * tiers. Sampling the top band rather than the literal top N keeps the same
 * handful of megastars from owning every hard round.
 */
export async function famousSongs(
  count: number,
  filter: CatalogFilter = NO_FILTER
): Promise<AppleSong[]> {
  return sampleTier("easy", count, filter);
}

/** Rebuild from a freshly written snapshot without restarting the process. */
export function resetPopularityCache(): void {
  live = null;
  ranked = null;
}

export type { CanonOptions };

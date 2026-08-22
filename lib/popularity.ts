import type { AppleSong } from "@/lib/apple";
import { canonSongs } from "@/lib/canon";
import { mapAtLookupRate, trackPopularity } from "@/lib/lastfm";

/**
 * How famous each canon song is, on one scale that spans artists and decades.
 *
 * Tier boundaries are quantiles of what has actually been measured rather than
 * hardcoded playcount numbers: Last.fm's absolute counts climb every year and
 * skew heavily by genre, so "the top fifth of the canon" stays meaningful where
 * "over five million plays" would quietly rot.
 */

export interface ScoredSong {
  song: AppleSong;
  /** Distinct Last.fm listeners. */
  listeners: number;
  plays: number;
  /** Decade the song belongs to, e.g. "1980". */
  cohort: string;
  /** Listeners relative to the median of its own decade — the ranking key. */
  score: number;
}

/** Raw measurement, before it can be scored against its cohort. */
interface Measured {
  song: AppleSong;
  listeners: number;
  plays: number;
  cohort: string;
}

/** Quantile of the canon, most-listened first, that each tier draws from. */
export const BANDS = {
  easy: [0, 0.2],
  medium: [0.2, 0.5],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Songs scored before the quantiles are trusted. The canon is shuffled before
 * scoring, so this is a random sample of it and a few hundred is plenty to
 * place the boundaries; scoring all ~1500 up front would cost a five-minute
 * first round for no extra accuracy.
 */
const MIN_SCORED = 250;
const BLOCK = 125;

/**
 * Last.fm counts accumulate for as long as a song has existed, so a brand-new
 * release is structurally penalised: measured live, today's Top 100: Global has
 * a median of ~219k listeners against ~1.0M for 2000s and 2010s hits — a 4.6x
 * handicap for being new, enough to file this week's number one under "hard".
 *
 * Ranking each song against the median of its own decade removes that. The
 * 1980s–2010s medians sit within 1.4x of each other, so their relative order
 * barely moves; it is the recent cohort that gets lifted to where it belongs.
 */
function cohortOf(song: AppleSong): string {
  return song.year ? String(Math.floor(song.year / 10) * 10) : "unknown";
}

/** Below this a decade has too few samples to trust its own median. */
const MIN_COHORT = 8;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

let queue: AppleSong[] | null = null;
const measured: Measured[] = [];
let ranked: ScoredSong[] = [];
let rankedAt = -1;

/** Score every measurement against its decade, most-famous-for-its-era first. */
function rank(): ScoredSong[] {
  if (rankedAt === measured.length) return ranked;
  const byCohort = new Map<string, number[]>();
  for (const m of measured) {
    byCohort.set(m.cohort, [...(byCohort.get(m.cohort) ?? []), m.listeners]);
  }
  const overall = median(measured.map((m) => m.listeners)) || 1;
  const baseline = new Map<string, number>();
  for (const [key, listeners] of byCohort) {
    baseline.set(key, listeners.length >= MIN_COHORT ? median(listeners) || overall : overall);
  }
  ranked = measured
    .map((m) => ({ ...m, score: m.listeners / (baseline.get(m.cohort) ?? overall) }))
    .sort((a, b) => b.score - a.score || b.listeners - a.listeners);
  rankedAt = measured.length;
  return ranked;
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Score another slice of the canon. False once the canon is used up. */
async function scoreBlock(): Promise<boolean> {
  if (!queue) queue = shuffle(await canonSongs());
  const batch = queue.splice(0, BLOCK);
  if (batch.length === 0) return false;
  const results = await mapAtLookupRate(batch, async (song) => {
    // Last.fm files collaborations under the lead artist, which is Apple's first.
    const found = await trackPopularity(song.artists[0] ?? "", song.title);
    return found ? { song, ...found, cohort: cohortOf(song) } : null;
  });
  // Songs Last.fm has never seen are not "popular" by any reading — drop them.
  measured.push(...results.filter((r): r is Measured => r !== null));
  return true;
}

async function ensureScored(min: number): Promise<void> {
  while (measured.length < min) {
    if (!(await scoreBlock())) break;
  }
  if (measured.length === 0) {
    throw new Error(
      "Last.fm returned no popularity data for any canon song. Check LASTFM_API_KEY."
    );
  }
}

/** Everything scored so far, best-known first. Exported for the calibration script. */
export async function popularitySnapshot(min = MIN_SCORED): Promise<ScoredSong[]> {
  await ensureScored(min);
  return [...rank()];
}

/** A random sample of canon songs whose popularity falls inside `band`. */
export async function sampleBand(
  band: readonly [number, number],
  want: number
): Promise<AppleSong[]> {
  await ensureScored(MIN_SCORED);
  const all = rank();
  const from = Math.floor(all.length * band[0]);
  const to = Math.max(from + 1, Math.ceil(all.length * band[1]));
  return shuffle(all.slice(from, to))
    .slice(0, want)
    .map((s) => s.song);
}

/**
 * The best-known canon songs, used to pick the artists behind the deep-cut
 * tiers. Sampling the top band rather than the literal top N keeps the same
 * handful of megastars from owning every hard round.
 */
export async function famousSongs(count: number): Promise<AppleSong[]> {
  return sampleBand(BANDS.easy, count);
}

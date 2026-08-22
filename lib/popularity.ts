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
  /** Distinct Last.fm listeners — the ranking key. */
  listeners: number;
  plays: number;
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
const MIN_SCORED = 150;
const BLOCK = 150;

let queue: AppleSong[] | null = null;
const scored: ScoredSong[] = [];

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
    return found ? { song, ...found } : null;
  });
  // Songs Last.fm has never seen are not "popular" by any reading — drop them.
  scored.push(...results.filter((r): r is ScoredSong => r !== null));
  scored.sort((a, b) => b.listeners - a.listeners || b.plays - a.plays);
  return true;
}

async function ensureScored(min: number): Promise<void> {
  while (scored.length < min) {
    if (!(await scoreBlock())) break;
  }
  if (scored.length === 0) {
    throw new Error(
      "Last.fm returned no popularity data for any canon song. Check LASTFM_API_KEY."
    );
  }
}

/** Everything scored so far, most-listened first. Exported for the calibration script. */
export async function popularitySnapshot(min = MIN_SCORED): Promise<ScoredSong[]> {
  await ensureScored(min);
  return [...scored];
}

/** A random sample of canon songs whose popularity falls inside `band`. */
export async function sampleBand(
  band: readonly [number, number],
  want: number
): Promise<AppleSong[]> {
  await ensureScored(MIN_SCORED);
  const from = Math.floor(scored.length * band[0]);
  const to = Math.max(from + 1, Math.ceil(scored.length * band[1]));
  return shuffle(scored.slice(from, to))
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

import {
  albumSongs,
  artistAlbumIds,
  artistTopSongs,
  chartSongs,
  searchSongs,
  songArtistId,
  type AppleSong,
} from "@/lib/apple";
import type { Difficulty } from "@/lib/game-config";
import { normalizeArtist, normalizeTitle } from "@/lib/normalize";

/**
 * Per-difficulty candidate pools, built Apple-natively (the Apple Music API
 * exposes no per-song popularity number):
 *
 * - easy       most-played chart, top of the list
 * - medium     deeper chart cuts + genre charts
 * - hard       lower top-songs (ranks 6+) of chart artists
 * - expert     album tracks of chart artists that are NOT in the artist's
 *              top songs — the classic "deep cut"
 * - impossible search results for obscure words, skipping the head of the list
 *
 * Pools are in-memory per server process; rounds pop candidates until one
 * has a playable preview.
 */

/** Apple Music genre ids for genre-scoped charts. */
const GENRE_IDS = [14, 21, 18, 20, 17, 15, 6, 11, 7]; // pop rock hip-hop alt dance r&b country jazz electronic

/** Evocative but uncommon words — their search results are mostly deep cuts. */
const DEEP_WORDS = [
  "lantern", "sorrow", "harvest", "ember", "willow", "thunder", "silver",
  "garden", "mirror", "canyon", "sailor", "meadow", "marble", "wolves",
  "sparrow", "hollow", "crimson", "velvet", "lighthouse", "avalanche",
  "satellite", "horizon", "wanderer", "echoes", "porcelain", "monsoon",
  "juniper", "cathedral", "tides", "driftwood", "quicksand", "stardust",
  "wildfire", "undertow", "copper", "ivory", "compass", "glacier",
];

const JUNK_RE =
  /(karaoke|tribute|originally performed|made famous|in the style of|8[- ]?bit|lullab|instrumental|sped[- ]?up|slowed|nightcore|workout|fitness|meditat|rain sounds|white noise|asmr|sleep music|commentary|interlude|skit|intro|outro)/i;

const POOL_LOW_WATER = 6;
/** Cap per generator call so one artist/search word can't flood a pool. */
const MAX_PER_CALL = 3;
const MAX_DRAW_ATTEMPTS = 10;

const pools = new Map<Difficulty, AppleSong[]>();
const served = new Map<Difficulty, Set<string>>();
/** Chart artists feed the hard/expert generators. */
let chartArtistSongs: AppleSong[] = [];

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom<T>(items: T[]): T | undefined {
  return items[randomInt(0, items.length - 1)];
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dedupeKey(song: AppleSong): string {
  return `${normalizeTitle(song.title)}|${normalizeArtist(song.artists[0] ?? "")}`;
}

function isViable(song: AppleSong): boolean {
  if (!song.previewUrl) return false;
  if (song.durationMs < 60_000) return false;
  if (song.title.length > 80) return false;
  const haystack = `${song.title} ${song.artists.join(" ")} ${song.album}`;
  return !JUNK_RE.test(haystack);
}

function addToPool(difficulty: Difficulty, songs: AppleSong[]): void {
  const pool = pools.get(difficulty) ?? [];
  const servedIds = served.get(difficulty) ?? new Set<string>();
  const seen = new Set(pool.map(dedupeKey));
  let kept = 0;
  for (const song of songs) {
    if (kept >= MAX_PER_CALL) break;
    if (!isViable(song)) continue;
    if (servedIds.has(song.id)) continue;
    const key = dedupeKey(song);
    if (seen.has(key)) continue;
    seen.add(key);
    kept++;
    pool.splice(randomInt(0, pool.length), 0, song);
  }
  pools.set(difficulty, pool);
  served.set(difficulty, servedIds);
}

async function chartSample(): Promise<AppleSong[]> {
  if (chartArtistSongs.length === 0) {
    chartArtistSongs = await chartSongs({ limit: 50 });
  }
  return chartArtistSongs;
}

/** A random chart artist's id (chart payloads omit it; resolve via the song). */
async function randomChartArtistId(): Promise<string | null> {
  const song = pickRandom(await chartSample());
  if (!song) return null;
  return song.artistId ?? songArtistId(song.id);
}

const generators: Record<Difficulty, () => Promise<AppleSong[]>> = {
  async easy() {
    return chartSongs({ limit: 50, offset: Math.random() < 0.5 ? 0 : 50 });
  },

  async medium() {
    // Deeper global chart, or the top of a random genre chart.
    if (Math.random() < 0.5) {
      return chartSongs({ limit: 50, offset: randomInt(50, 150) });
    }
    return chartSongs({ limit: 30, genreId: pickRandom(GENRE_IDS) });
  },

  async hard() {
    const artistId = await randomChartArtistId();
    if (!artistId) return [];
    // Skip the artist's signature hits; ranks 6+ are the fan-favourite zone.
    return (await artistTopSongs(artistId)).slice(5);
  },

  async expert() {
    const artistId = await randomChartArtistId();
    if (!artistId) return [];
    const [albumIds, topSongs] = await Promise.all([
      artistAlbumIds(artistId),
      artistTopSongs(artistId),
    ]);
    const albumId = pickRandom(albumIds);
    if (!albumId) return [];
    const topKeys = new Set(topSongs.map(dedupeKey));
    // Album tracks that are NOT in the artist's top songs = deep cuts.
    return (await albumSongs(albumId)).filter((s) => !topKeys.has(dedupeKey(s)));
  },

  async impossible() {
    const word = pickRandom(DEEP_WORDS)!;
    // Skip the head of the results — relevance puts the best-known first.
    const results = await searchSongs(word, { limit: 25, offset: randomInt(0, 15) });
    return results.slice(8);
  },
};

async function topUp(difficulty: Difficulty): Promise<void> {
  for (let i = 0; i < 4; i++) {
    if ((pools.get(difficulty)?.length ?? 0) >= POOL_LOW_WATER) return;
    try {
      addToPool(difficulty, shuffle(await generators[difficulty]()));
    } catch (err) {
      // Auth/config errors won't fix themselves — surface them to the route.
      if (err instanceof Error && /developer token|APPLE_/.test(err.message)) throw err;
    }
  }
}

export interface DrawnTrack {
  track: AppleSong;
  previewUrl: string;
}

/** Pick a random playable track for the difficulty tier. */
export async function drawTrack(difficulty: Difficulty): Promise<DrawnTrack> {
  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
    let pool = pools.get(difficulty) ?? [];
    if (pool.length < POOL_LOW_WATER) {
      await topUp(difficulty);
      pool = pools.get(difficulty) ?? [];
    }
    const track = pool.shift();
    if (!track) continue;
    served.get(difficulty)?.add(track.id);
    if (track.previewUrl) return { track, previewUrl: track.previewUrl };
  }
  throw new Error(
    `Could not find a playable ${difficulty} track. Apple Music may be rate limiting, try again.`
  );
}

/** For scripts/sample-pools.ts: peek at tier candidates. */
export async function sampleCandidates(
  difficulty: Difficulty,
  count: number
): Promise<AppleSong[]> {
  for (let i = 0; i < 6 && (pools.get(difficulty)?.length ?? 0) < count; i++) {
    const before = pools.get(difficulty)?.length ?? 0;
    try {
      addToPool(difficulty, shuffle(await generators[difficulty]()));
    } catch (err) {
      if (i === 0) throw err;
    }
    if ((pools.get(difficulty)?.length ?? 0) === before && i >= 2) break;
  }
  return (pools.get(difficulty) ?? []).slice(0, count);
}

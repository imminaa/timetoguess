import {
  albumSongs,
  artistAlbums,
  artistTopSongs,
  songArtistId,
  type AlbumRef,
  type AppleSong,
} from "@/lib/apple";
import type { Difficulty } from "@/lib/game-config";
import { artistCatalog, mapAtLookupRate, songPopularity } from "@/lib/lastfm";
import {
  describeFilter,
  filterKey,
  isUnfiltered,
  matchesFilter,
  NO_FILTER,
  type CatalogFilter,
} from "@/lib/music-taxonomy";
import { cleanTitle, normalizeArtist, normalizeTitle } from "@/lib/normalize";
import { famousSongs, hasDeepCatalog, listenerFloor, sampleTier } from "@/lib/popularity";

/**
 * Per-difficulty candidate pools.
 *
 * Every tier is anchored to the all-era canon in lib/canon.ts, ranked by the
 * composite popularity score in lib/popularity.ts. Anchoring to charts instead
 * — as this used to — meant "popular" could only ever mean "popular this
 * week", so no song older than the current chart cycle could appear anywhere.
 *
 * - easy       top tenth of the canon, over a hard listener floor: the songs
 *              everyone knows, from Billie Jean to whatever is number one today
 * - medium     the next band down — big songs, slightly off the A-list
 * - hard       a well-known artist's own ranks 4-12 by listeners, still over a
 *              floor, and only for artists with a deep enough catalog that
 *              those ranks mean something
 * - expert     studio-album tracks outside the artist's top songs — the classic
 *              deep cut — over a low floor so the answer is at least placeable
 * - impossible the obscure tail of the canon, plus deep cuts with no floor
 *
 * The three artist-driven tiers all pick their artist from the easy band, so a
 * hard round is always a song *by someone you know*: that is the difference
 * between a fan favourite and a stranger's B-side.
 *
 * Pools are in-memory per server process; rounds pop candidates until one has
 * a playable preview.
 */

const JUNK_RE =
  /(karaoke|tribute|originally performed|made famous|in the style of|8[- ]?bit|lullab|instrumental|sped[- ]?up|slowed|nightcore|workout|fitness|meditat|rain sounds|white noise|asmr|sleep music|commentary|interlude|skit|intro|outro)/i;

/**
 * Albums that make a poor deep cut even when Apple does not flag them as
 * compilations. A live take or a remix record is not "a track off an album you
 * own", and Apple marks Queen's greatest-hits sets as ordinary albums.
 */
const NON_STUDIO_RE =
  /(\blive\b|unplugged|greatest hits|best of|the collection|anthology|essentials|soundtrack|original score|karaoke|\bremix|instrumental|\bdemos?\b|sessions|b[- ]sides|rarities|tribute)/i;

/** Errors that mean "misconfigured", not "unlucky draw" — never swallowed. */
const SETUP_ERROR_RE = /developer token|APPLE_|LASTFM_|Last\.fm|canon/i;

const POOL_LOW_WATER = 6;
/** Cap per generator call, so one top-up cannot bury the tier in one artist. */
const MAX_PER_CALL = 12;
/** …and no more than this many from the same artist within that call. */
const MAX_PER_ARTIST = 3;
const MAX_DRAW_ATTEMPTS = 10;

/**
 * How many recently served tracks a tier remembers, so rounds do not repeat.
 * Bounded on purpose: an unbounded set eventually marks every candidate used
 * and the tier throws "could not find a playable track" for the rest of the
 * process. The bound alone is not enough — a tier with fewer candidates than
 * this would still stall — so `topUp` also clears the history the moment a
 * top-up is blocked entirely by it.
 */
const RECENT_MEMORY = 300;

/** Artist picks to try before giving up on finding one with a deep catalog. */
const ARTIST_ATTEMPTS = 6;
/** Refresh the famous-artist pool this often so tiers don't fixate. */
const FAMOUS_POOL_TTL_MS = 30 * 60 * 1000;
const FAMOUS_POOL_SIZE = 120;

/**
 * How many distinct genre/decade selections keep a warm pool.
 *
 * Pools are per server process and shared across everyone hitting it, so the
 * key space is "however many filter combinations players have picked" rather
 * than five. Bounded least-recently-used so a handful of households cannot
 * grow the process without limit; the unfiltered key is just one more entry,
 * and in a single-filter household nothing is ever evicted.
 */
const MAX_POOL_KEYS = 24;

/** Pool identity: a tier under one filter. Unfiltered play keys on the tier. */
type PoolKey = string;

function poolKey(difficulty: Difficulty, filter: CatalogFilter): PoolKey {
  const key = filterKey(filter);
  return key ? `${difficulty}#${key}` : difficulty;
}

const pools = new Map<PoolKey, AppleSong[]>();

/** Drop the coldest keys once too many filters have been played. */
function evictColdPools(): void {
  // Map iterates in insertion order and `touch` reinserts, so the front is
  // the least recently used.
  while (pools.size > MAX_POOL_KEYS) {
    const oldest = pools.keys().next();
    if (oldest.done) return;
    pools.delete(oldest.value);
    served.delete(oldest.value);
  }
}

function touch(key: PoolKey, songs: AppleSong[]): void {
  pools.delete(key);
  pools.set(key, songs);
  evictColdPools();
}

/** Bounded FIFO of ids already served, so a tier can never run itself dry. */
class RecentlyServed {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    this.order.push(id);
    while (this.order.length > RECENT_MEMORY) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.ids.delete(oldest);
    }
  }

  clear(): void {
    this.ids.clear();
    this.order.length = 0;
  }
}

const served = new Map<PoolKey, RecentlyServed>();

function recent(key: PoolKey): RecentlyServed {
  const hit = served.get(key);
  if (hit) return hit;
  const fresh = new RecentlyServed();
  served.set(key, fresh);
  return fresh;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickRandom<T>(items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[randomInt(0, items.length - 1)];
}

function shuffle<T>(items: readonly T[]): T[] {
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

export interface Selection {
  keep: AppleSong[];
  /** Candidates rejected only because they were served recently. */
  blockedByRecent: number;
}

/**
 * Choose which of a generator's candidates enter the pool.
 *
 * Pure so the caps are testable without a network. The per-artist cap replaces
 * a flat per-call cap of 3: the flat cap existed to stop one artist flooding a
 * tier, but it throttled the diverse, already-curated easy and medium samples
 * just as hard, so pools refilled three songs at a time.
 */
export function selectCandidates(
  songs: readonly AppleSong[],
  options: {
    isRecent: (id: string) => boolean;
    alreadyPooled: ReadonlySet<string>;
    maxTotal?: number;
    maxPerArtist?: number;
  }
): Selection {
  const maxTotal = options.maxTotal ?? MAX_PER_CALL;
  const maxPerArtist = options.maxPerArtist ?? MAX_PER_ARTIST;
  const seen = new Set(options.alreadyPooled);
  const perArtist = new Map<string, number>();
  const keep: AppleSong[] = [];
  let blockedByRecent = 0;
  for (const song of songs) {
    if (keep.length >= maxTotal) break;
    if (!isViable(song)) continue;
    const key = dedupeKey(song);
    if (seen.has(key)) continue;
    if (options.isRecent(song.id)) {
      blockedByRecent++;
      continue;
    }
    const artist = normalizeArtist(song.primaryArtist);
    const fromArtist = perArtist.get(artist) ?? 0;
    if (fromArtist >= maxPerArtist) continue;
    perArtist.set(artist, fromArtist + 1);
    seen.add(key);
    keep.push(song);
  }
  return { keep, blockedByRecent };
}

function addToPool(key: PoolKey, songs: readonly AppleSong[]): Selection {
  const pool = pools.get(key) ?? [];
  const servedIds = recent(key);
  const selection = selectCandidates(songs, {
    isRecent: (id) => servedIds.has(id),
    alreadyPooled: new Set(pool.map(dedupeKey)),
  });
  for (const song of selection.keep) pool.splice(randomInt(0, pool.length), 0, song);
  touch(key, pool);
  return selection;
}

export interface FamousArtist {
  name: string;
  id: string;
}

let famousPool: { key: string; at: number; songs: AppleSong[] } | null = null;
/** Playlist and chart payloads omit the artist id; resolving it costs a call. */
const artistIdCache = new Map<string, string | null>();

async function resolveArtistId(song: AppleSong): Promise<string | null> {
  if (song.artistId) return song.artistId;
  const cached = artistIdCache.get(song.id);
  if (cached !== undefined) return cached;
  const id = await songArtistId(song.id).catch(() => null);
  artistIdCache.set(song.id, id);
  return id;
}

/**
 * A random famous artist with enough well-known material to sustain a deep-cut
 * round. Drawing from the canon rather than the chart is what lets Queen and
 * Nirvana show up alongside this week's names; the catalog-depth gate is what
 * stops a one-hit act being asked for its sixth-best song.
 */
async function randomFamousArtist(
  requireDepth: boolean,
  filter: CatalogFilter
): Promise<FamousArtist | null> {
  // Drawing the artist from the *filtered* easy band is what makes the
  // artist-driven tiers respect a filter at all: pick Queen for a 1970s-only
  // game and their deep cuts are 1970s by construction, where picking any
  // famous artist and then filtering their tracks would mostly draw a blank.
  const key = filterKey(filter);
  if (!famousPool || famousPool.key !== key || Date.now() - famousPool.at > FAMOUS_POOL_TTL_MS) {
    famousPool = { key, at: Date.now(), songs: await famousSongs(FAMOUS_POOL_SIZE, filter) };
  }
  const floor = await listenerFloor("hard");
  for (const song of shuffle(famousPool.songs).slice(0, ARTIST_ATTEMPTS)) {
    if (requireDepth && !(await hasDeepCatalog(song.primaryArtist, floor).catch(() => false))) {
      continue;
    }
    const id = await resolveArtistId(song);
    if (id) return { name: song.primaryArtist, id };
  }
  return null;
}

/** Apple's songs for an artist, re-ordered by Last.fm listeners. */
async function byListeners(
  artist: string,
  songs: readonly AppleSong[]
): Promise<{ song: AppleSong; listeners: number }[]> {
  const catalog = await artistCatalog(artist);
  const lookup = (song: AppleSong): number =>
    catalog.tracks.get(normalizeTitle(song.title))?.listeners ??
    catalog.tracks.get(normalizeTitle(cleanTitle(song.title)))?.listeners ??
    0;
  // Apple lists the same song under several releases; keep the best-known copy.
  const best = new Map<string, { song: AppleSong; listeners: number }>();
  for (const song of songs) {
    const key = normalizeTitle(cleanTitle(song.title));
    const entry = { song, listeners: lookup(song) };
    const prev = best.get(key);
    if (!prev || prev.listeners < entry.listeners) best.set(key, entry);
  }
  return [...best.values()].sort((a, b) => b.listeners - a.listeners);
}

/** Strip "(Deluxe Edition)" / "[2011 Remaster]" so releases of one album match. */
function albumBase(name: string): string {
  return normalizeTitle(name.replace(/\s*[([][^)\]]*[)\]]\s*/g, " "));
}

/**
 * Studio albums worth taking a deep cut from, best first.
 *
 * Albums carrying one of the artist's top songs come first — that is "an album
 * you own" rather than a forgotten record — but they cannot be the only option:
 * Apple resolves a legacy act's top songs to greatest-hits compilations, which
 * `artistAlbums` already filters out, so requiring a match would starve the
 * tier for exactly the artists it most wants.
 */
function studioAlbums(albums: readonly AlbumRef[], topSongs: readonly AppleSong[]): AlbumRef[] {
  const studio = albums.filter((a) => a.name && !NON_STUDIO_RE.test(a.name));
  const known = new Set(topSongs.map((s) => albumBase(s.album)).filter(Boolean));
  const preferred = studio.filter((a) => known.has(albumBase(a.name)));
  return preferred.length > 0 ? preferred : studio;
}

/** Keep only songs Last.fm can place above `floor` listeners. */
async function overFloor(songs: readonly AppleSong[], floor: number): Promise<AppleSong[]> {
  if (floor <= 0) return [...songs];
  const measured = await mapAtLookupRate(songs, async (song) => {
    const found = await songPopularity(song.primaryArtist, song.title, [
      song.artists[0] ?? "",
    ]).catch(() => null);
    return found && found.listeners >= floor ? song : null;
  });
  return measured.filter((s): s is AppleSong => s !== null);
}

/** Album tracks that are not among the artist's best-known songs. */
async function deepCuts(floor: number, filter: CatalogFilter): Promise<AppleSong[]> {
  const artist = await randomFamousArtist(true, filter);
  if (!artist) return [];
  const [albums, topSongs] = await Promise.all([
    artistAlbums(artist.id),
    artistTopSongs(artist.id),
  ]);
  const album = pickRandom(studioAlbums(albums, topSongs));
  if (!album) return [];
  const topKeys = new Set(topSongs.map(dedupeKey));
  // The artist already cleared the filter; the tracks are checked again
  // because a long career crosses decades and Apple tags reissues by their own
  // release date. Over-rejecting here only costs candidates — `topUp` retries
  // with another artist — while under-rejecting serves a filtered-out song.
  const tracks = (await albumSongs(album.id)).filter(
    (s) => !topKeys.has(dedupeKey(s)) && isViable(s) && matchesFilter(s, filter)
  );
  return overFloor(shuffle(tracks).slice(0, 10), floor);
}

const generators: Record<Difficulty, (filter: CatalogFilter) => Promise<AppleSong[]>> = {
  async easy(filter) {
    return sampleTier("easy", 25, filter);
  },

  async medium(filter) {
    return sampleTier("medium", 25, filter);
  },

  async hard(filter) {
    const artist = await randomFamousArtist(true, filter);
    if (!artist) return [];
    const ranked = await byListeners(artist.name, await artistTopSongs(artist.id));
    const floor = await listenerFloor("hard");
    // Ranks 4-12 by actual listeners: past the signature hits, still songs a
    // fan would name. Apple's own rank 6 was neither, for a one-hit artist.
    return ranked
      .slice(3, 12)
      .filter((r) => r.listeners >= floor && matchesFilter(r.song, filter))
      .map((r) => r.song);
  },

  async expert(filter) {
    return deepCuts(await listenerFloor("expert"), filter);
  },

  async impossible(filter) {
    // Mostly unfloored deep cuts — real songs by artists you know, which is
    // what makes the reveal land — leavened with the canon's obscure tail.
    if (Math.random() < 0.7) {
      const cuts = await deepCuts(await listenerFloor("impossible"), filter);
      if (cuts.length > 0) return cuts;
    }
    return sampleTier("impossible", 25, filter);
  },
};

async function topUp(
  difficulty: Difficulty,
  filter: CatalogFilter,
  key: PoolKey
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    if ((pools.get(key)?.length ?? 0) >= POOL_LOW_WATER) return;
    try {
      const songs = shuffle(await generators[difficulty](filter));
      const selection = addToPool(key, songs);
      const starved = (pools.get(key)?.length ?? 0) === 0;
      if (starved && selection.keep.length === 0 && selection.blockedByRecent > 0) {
        // Nothing left to serve and every candidate has been seen recently. A
        // tier with fewer candidates than RECENT_MEMORY would otherwise stall
        // here permanently; forgetting the history recycles it instead.
        //
        // The starvation check matters: without it this also fires whenever the
        // pool already holds every unserved candidate, wiping the history early
        // and repeating a track while others were still waiting.
        recent(key).clear();
        addToPool(key, songs);
      }
    } catch (err) {
      // Auth/config errors won't fix themselves — surface them to the route
      // rather than letting the pool look merely empty.
      if (err instanceof Error && SETUP_ERROR_RE.test(err.message)) throw err;
    }
  }
}

export interface DrawnTrack {
  track: AppleSong;
  previewUrl: string;
}

/**
 * Pick a random playable track for the difficulty tier, honouring the filter.
 *
 * When a filter is active and the tier comes up empty, the filter is by far
 * the likeliest cause — Classical has no songs in the easy band at all — so
 * the error names it. Serving an unfiltered song instead would hand a player
 * exactly the decade they just excluded, which is the one outcome the setting
 * exists to prevent.
 */
export async function drawTrack(
  difficulty: Difficulty,
  filter: CatalogFilter = NO_FILTER
): Promise<DrawnTrack> {
  const key = poolKey(difficulty, filter);
  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
    let pool = pools.get(key) ?? [];
    if (pool.length < POOL_LOW_WATER) {
      await topUp(difficulty, filter, key);
      pool = pools.get(key) ?? [];
    }
    const track = pool.shift();
    if (!track) continue;
    recent(key).add(track.id);
    if (track.previewUrl) return { track, previewUrl: track.previewUrl };
  }
  if (!isUnfiltered(filter)) {
    throw new Error(
      `No ${difficulty} songs match your filters (${describeFilter(filter)}). ` +
        `Widen the genres or decades in Settings.`
    );
  }
  throw new Error(
    `Could not find a playable ${difficulty} track. Apple Music may be rate limiting, try again.`
  );
}

/** For scripts/sample-pools.ts: peek at tier candidates. */
export async function sampleCandidates(
  difficulty: Difficulty,
  count: number,
  filter: CatalogFilter = NO_FILTER
): Promise<AppleSong[]> {
  const key = poolKey(difficulty, filter);
  for (let i = 0; i < 6 && (pools.get(key)?.length ?? 0) < count; i++) {
    const before = pools.get(key)?.length ?? 0;
    try {
      addToPool(key, shuffle(await generators[difficulty](filter)));
    } catch (err) {
      if (i === 0) throw err;
    }
    if ((pools.get(key)?.length ?? 0) === before && i >= 2) break;
  }
  return (pools.get(key) ?? []).slice(0, count);
}

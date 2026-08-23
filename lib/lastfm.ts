import { cleanTitle, normalizeArtist, normalizeTitle } from "@/lib/normalize";

/**
 * Last.fm global scrobble counts — a cross-artist, all-eras popularity number.
 * Apple Music has no equivalent: its song resources carry no popularity,
 * playCount or chart-position field, not even via `extend=`, and its charts
 * only ever describe *this week*. That makes every pre-2024 classic invisible
 * to a chart-derived definition of "popular", which is what this fixes.
 *
 * Lookups go through `artist.getTopTracks`, one request per *artist* rather
 * than per song. The canon's ~1400 songs span ~700 artists, and each request
 * returns 50 tracks with their listener counts, so the whole canon costs about
 * as much as the 250-song sample it replaces. The per-song `track.getInfo`
 * endpoint survives only as a fallback, behind a mismatch guard — see
 * `songPopularity`.
 *
 * Metadata only — audio still comes from Apple Music.
 * Free key: https://www.last.fm/api/account/create
 */

const ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
/** Last.fm asks callers to stay near 5 requests/second per key. */
export const LOOKUP_CONCURRENCY = 5;
/**
 * …which is a *rate*, not a concurrency. Running five workers with no pacing
 * issued tens of requests a second, and every resulting 429 surfaced as a
 * thrown error that the canon build swallowed — silently filing 6,387 songs,
 * Blinding Lights and Seven Nation Army among them, as "unverifiable". Request
 * starts are spaced here so the whole process obeys the documented rate no
 * matter how many callers are in flight.
 */
const DEFAULT_REQUEST_GAP_MS = 1000 / 5;

/**
 * Overridable via `LASTFM_MIN_REQUEST_GAP_MS` — raise it if Last.fm throttles
 * a large build anyway, or set it to 0 for tests, which exercise the retry
 * path and should not pay a production rate limit in wall-clock time.
 */
function requestGapMs(): number {
  const raw = Number(process.env.LASTFM_MIN_REQUEST_GAP_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REQUEST_GAP_MS;
}
/** A 429 that slips through anyway is retried rather than losing the song. */
const RATE_LIMIT_RETRIES = 4;
/** Last.fm's "invalid parameters" code, which is also what a miss returns. */
const NOT_FOUND = 6;
/** Tracks fetched per artist. The tail past this is not "widely known" anyway. */
const TOP_TRACKS = 50;

/**
 * How far above the artist's least-listened known track an unverified title
 * lookup may land before it is treated as a different artist's song. Slack
 * enough for a stale top-tracks page, tight enough to catch "Earth"/September.
 */
const MISMATCH_SLACK = 1.5;

export interface TrackStat {
  /** Distinct listeners. Less skewed by superfans on repeat than `plays`. */
  listeners: number;
  /** Total scrobbles across all Last.fm users. */
  plays: number;
}

export interface TrackPopularity extends TrackStat {
  /** 1-based rank among the artist's own most-listened tracks, when known. */
  artistRank: number | null;
  /**
   * False when the count came from a bare title lookup that could not be
   * checked against the artist's catalog. Callers should not trust the
   * magnitude of an unconfident number.
   */
  confident: boolean;
}

export function hasLastfmCreds(): boolean {
  return Boolean(process.env.LASTFM_API_KEY);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Claim the next send slot, so concurrent callers still share one rate. */
let nextSlot = 0;
async function takeSlot(): Promise<void> {
  const gap = requestGapMs();
  if (gap === 0) return;
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + gap;
  if (at > now) await sleep(at - now);
}

async function query<T>(params: Record<string, string>): Promise<T | null> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("Missing LASTFM_API_KEY");
  const search = new URLSearchParams({ api_key: key, format: "json", ...params });
  for (let attempt = 0; ; attempt++) {
    await takeSlot();
    const res = await fetch(`${ENDPOINT}?${search}`, { cache: "no-store" });
    if (res.status === 429) {
      if (attempt >= RATE_LIMIT_RETRIES) throw new Error("Last.fm rate limit hit");
      // Retry-After: 0 is a valid "try again now"; only an absent or
      // malformed header should fall back to exponential backoff.
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 500 * 2 ** attempt
      );
      continue;
    }
    const body = (await res.json().catch(() => null)) as
      | (T & { error?: number; message?: string })
      | null;
    if (!res.ok || !body) {
      if (body?.error === NOT_FOUND) return null;
      throw new Error(`Last.fm request failed: ${res.status} ${body?.message ?? ""}`.trim());
    }
    if (body.error === NOT_FOUND) return null;
    if (body.error) throw new Error(`Last.fm error ${body.error}: ${body.message ?? ""}`);
    return body;
  }
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** One artist's most-listened tracks, keyed by normalized title. */
export interface ArtistCatalog {
  /** Normalized title -> stats. */
  tracks: Map<string, TrackStat & { artistRank: number }>;
  /** Listeners of the least-listened track we know about, for the guard. */
  floor: number;
  /** Listeners of the artist's single most-listened track. */
  peak: number;
}

const EMPTY_CATALOG: ArtistCatalog = { tracks: new Map(), floor: 0, peak: 0 };

interface RawTopTracks {
  toptracks?: {
    track?: { name?: string; listeners?: string; playcount?: string; "@attr"?: { rank?: string } }[];
  };
}

const catalogCache = new Map<string, Promise<ArtistCatalog>>();

/**
 * Every track Last.fm knows for this artist, in one request.
 *
 * Must be called with the catalog's unsplit `artistName`: Apple ships
 * "Earth, Wind & Fire" and asking for "Earth" returns a stranger's songs.
 */
export function artistCatalog(artist: string): Promise<ArtistCatalog> {
  const key = normalizeArtist(artist);
  if (!key) return Promise.resolve(EMPTY_CATALOG);
  const hit = catalogCache.get(key);
  if (hit) return hit;

  const pending = (async (): Promise<ArtistCatalog> => {
    const body = await query<RawTopTracks>({
      method: "artist.getTopTracks",
      artist,
      autocorrect: "1",
      limit: String(TOP_TRACKS),
    });
    const raw = body?.toptracks?.track ?? [];
    const tracks = new Map<string, TrackStat & { artistRank: number }>();
    let floor = Number.POSITIVE_INFINITY;
    let peak = 0;
    for (const [i, t] of raw.entries()) {
      const title = normalizeTitle(t.name ?? "");
      if (!title) continue;
      const listeners = count(t.listeners);
      const stat = {
        listeners,
        plays: count(t.playcount),
        artistRank: Number(t["@attr"]?.rank) || i + 1,
      };
      // Apple's catalog splits a song across releases ("Boogie Wonderland" and
      // "Boogie Wonderland (with The Emotions)") and so does Last.fm; the
      // better-listened entry is the one the title actually refers to.
      const prev = tracks.get(title);
      if (!prev || prev.listeners < listeners) tracks.set(title, stat);
      floor = Math.min(floor, listeners);
      peak = Math.max(peak, listeners);
    }
    return { tracks, floor: Number.isFinite(floor) ? floor : 0, peak };
  })().catch((err) => {
    // A failed fetch must not poison the cache for the rest of the process.
    catalogCache.delete(key);
    throw err;
  });

  catalogCache.set(key, pending);
  return pending;
}

interface RawInfo {
  track?: { listeners?: string; playcount?: string };
}

/** Bare title lookup. Unverified on its own — see `songPopularity`. */
async function trackInfo(artist: string, track: string): Promise<TrackStat | null> {
  const body = await query<RawInfo>({
    method: "track.getInfo",
    artist,
    track,
    autocorrect: "1",
  });
  if (!body?.track) return null;
  const listeners = Number(body.track.listeners);
  const plays = Number(body.track.playcount);
  if (!Number.isFinite(listeners) || !Number.isFinite(plays)) return null;
  return { listeners, plays };
}

const songCache = new Map<string, TrackPopularity | null>();

/**
 * Global popularity for one track, or null when it cannot be established.
 *
 * The artist's own catalog answers first, which is what makes the number
 * trustworthy. `track.getInfo` is consulted only for titles missing from that
 * catalog, and its answer is rejected when it lands implausibly far above the
 * artist's least-listened known track — that is the signature of Last.fm's
 * `autocorrect` quietly handing back a different artist's song of the same
 * name. It never reports "not found", so without this guard a mis-scored song
 * is indistinguishable from a genuinely obscure one.
 *
 * `alternates` exist because neither form of the credit is reliably right. The
 * unsplit name is what fixes "Earth" (1,215 listeners for September) back to
 * "Earth, Wind & Fire" (2,171,206) — but Last.fm also keeps splinter entities
 * for collaboration credits: "Daft Punk, Pharrell Williams & Nile Rodgers" is
 * a real artist page whose entire catalog peaks at 20,265, next to the actual
 * "Daft Punk" at 2,421,083. Both attributions are plausible readings of the
 * same credit, so every candidate is resolved and the best-supported one wins.
 */
export async function songPopularity(
  artist: string,
  title: string,
  alternates: readonly string[] = []
): Promise<TrackPopularity | null> {
  const names = [artist, ...alternates].filter(Boolean);
  const distinct = [...new Map(names.map((n) => [normalizeArtist(n), n])).values()];
  const key = `${distinct.map(normalizeArtist).join("+")}|${normalizeTitle(title)}`;
  const cached = songCache.get(key);
  if (cached !== undefined) return cached;

  const settled = await Promise.allSettled(distinct.map((name) => resolve(name, title)));
  const results = settled
    .filter((r): r is PromiseFulfilledResult<TrackPopularity | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r): r is TrackPopularity => r !== null);

  if (results.length === 0) {
    // Nothing usable. If that is because a request *failed*, say so: swallowing
    // it here would report a throttled lookup as a song nobody has heard of,
    // which is how 6,387 canon songs — Blinding Lights included — were filed
    // as "unverifiable" in a build that was really just being rate limited.
    const failure = settled.find((r) => r.status === "rejected");
    if (failure) throw (failure as PromiseRejectedResult).reason;
    songCache.set(key, null);
    return null;
  }

  // A confident reading always beats an unverifiable one, regardless of size.
  const confident = results.filter((r) => r.confident);
  const pool = confident.length > 0 ? confident : results;
  const best = pool.reduce<TrackPopularity | null>(
    (acc, r) => (acc === null || r.listeners > acc.listeners ? r : acc),
    null
  );
  songCache.set(key, best);
  return best;
}

async function resolve(artist: string, title: string): Promise<TrackPopularity | null> {
  const catalog = await artistCatalog(artist);
  // Apple ships "Africa (Remastered 2011)" where Last.fm has "Africa".
  const cleaned = normalizeTitle(cleanTitle(title));
  const exact = catalog.tracks.get(normalizeTitle(title)) ?? catalog.tracks.get(cleaned);
  if (exact) {
    return { listeners: exact.listeners, plays: exact.plays, artistRank: exact.artistRank, confident: true };
  }

  const found =
    (await trackInfo(artist, cleanTitle(title))) ??
    (cleanTitle(title) !== title ? await trackInfo(artist, title) : null);
  if (!found) return null;

  // Below the artist's known floor is exactly where a real deep cut sits, so
  // only an implausibly *large* number indicates the wrong song.
  const ceiling = catalog.tracks.size > 0 ? catalog.floor * MISMATCH_SLACK : Infinity;
  if (found.listeners > ceiling) return null;
  return { ...found, artistRank: null, confident: catalog.tracks.size > 0 };
}

interface RawArtistInfo {
  artist?: { stats?: { listeners?: string; playcount?: string } };
}

const artistStatCache = new Map<string, Promise<TrackStat | null>>();

/** How well known the artist is overall — the reveal's "should I know them?". */
export function artistPopularity(artist: string): Promise<TrackStat | null> {
  const key = normalizeArtist(artist);
  if (!key) return Promise.resolve(null);
  const hit = artistStatCache.get(key);
  if (hit) return hit;
  const pending = (async () => {
    const body = await query<RawArtistInfo>({
      method: "artist.getInfo",
      artist,
      autocorrect: "1",
    });
    const stats = body?.artist?.stats;
    if (!stats) return null;
    return { listeners: count(stats.listeners), plays: count(stats.playcount) };
  })().catch((err) => {
    artistStatCache.delete(key);
    throw err;
  });
  artistStatCache.set(key, pending);
  return pending;
}

/**
 * Run `task` over `items` with bounded concurrency. The request *rate* is
 * enforced inside `query`, so this only caps how many lookups are in flight.
 */
export async function mapAtLookupRate<T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(LOOKUP_CONCURRENCY, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await task(items[i]);
  });
  await Promise.all(workers);
  return out;
}

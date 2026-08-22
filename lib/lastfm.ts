import { cleanTitle, normalizeArtist, normalizeTitle } from "@/lib/normalize";

/**
 * Last.fm global scrobble counts — a cross-artist, all-eras popularity number.
 * Apple Music has no equivalent: its song resources carry no popularity,
 * playCount or chart-position field, not even via `extend=`, and its charts
 * only ever describe *this week*. That makes every pre-2024 classic invisible
 * to a chart-derived definition of "popular", which is what this fixes.
 *
 * Metadata only — audio still comes from Apple Music.
 * Free key: https://www.last.fm/api/account/create
 */

const ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
/** Last.fm asks callers to stay near 5 requests/second per key. */
export const LOOKUP_CONCURRENCY = 5;
/** Last.fm's "invalid parameters" code, which is also what a miss returns. */
const NOT_FOUND = 6;

export interface Popularity {
  /** Distinct listeners. Less skewed by superfans on repeat than `plays`. */
  listeners: number;
  /** Total scrobbles across all Last.fm users. */
  plays: number;
}

export function hasLastfmCreds(): boolean {
  return Boolean(process.env.LASTFM_API_KEY);
}

interface RawInfo {
  track?: { listeners?: string; playcount?: string };
  error?: number;
  message?: string;
}

async function fetchInfo(artist: string, track: string): Promise<Popularity | null> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("Missing LASTFM_API_KEY");
  const params = new URLSearchParams({
    method: "track.getInfo",
    api_key: key,
    artist,
    track,
    autocorrect: "1",
    format: "json",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store" });
  if (res.status === 429) throw new Error("Last.fm rate limit hit");
  const body = (await res.json().catch(() => null)) as RawInfo | null;
  if (!res.ok || !body) {
    if (body?.error === NOT_FOUND) return null;
    throw new Error(`Last.fm request failed: ${res.status} ${body?.message ?? ""}`.trim());
  }
  if (body.error === NOT_FOUND) return null;
  if (body.error) throw new Error(`Last.fm error ${body.error}: ${body.message ?? ""}`);
  const listeners = Number(body.track?.listeners);
  const plays = Number(body.track?.playcount);
  if (!Number.isFinite(listeners) || !Number.isFinite(plays)) return null;
  return { listeners, plays };
}

const cache = new Map<string, Popularity | null>();

/**
 * Global popularity for one track, or null when Last.fm has never heard of it.
 * Tries the de-noised title first — Apple ships "Africa (Remastered 2011)"
 * where Last.fm scrobbles are filed under "Africa" — then the raw title.
 */
export async function trackPopularity(
  artist: string,
  title: string
): Promise<Popularity | null> {
  const key = `${normalizeArtist(artist)}|${normalizeTitle(title)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const cleaned = cleanTitle(title);
  let found = await fetchInfo(artist, cleaned);
  if (!found && cleaned !== title) found = await fetchInfo(artist, title);
  cache.set(key, found);
  return found;
}

/** Run `task` over `items` at Last.fm's tolerated request rate. */
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

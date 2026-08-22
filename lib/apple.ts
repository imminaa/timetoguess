import { readFile } from "node:fs/promises";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Apple Music API (MusicKit) client. Requires an Apple Developer account
 * with a Media Services (MusicKit) key — see README. The developer token
 * is an ES256 JWT minted here and cached for the process lifetime.
 */

const STOREFRONT = process.env.APPLE_STOREFRONT || "us";

export interface AppleSong {
  id: string;
  title: string;
  artists: string[];
  artistId: string | null;
  album: string;
  artUrl: string | null;
  previewUrl: string | null;
  isrc: string | null;
  durationMs: number;
  year: number | null;
  genre: string | null;
}

export function hasAppleCreds(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      (process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY_PATH)
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function privateKeyPem(): Promise<string> {
  if (process.env.APPLE_PRIVATE_KEY) {
    return process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  const path = process.env.APPLE_PRIVATE_KEY_PATH;
  if (!path) throw new Error("Missing APPLE_PRIVATE_KEY / APPLE_PRIVATE_KEY_PATH");
  return readFile(path, "utf8");
}

/** Mint (or reuse) the MusicKit developer token. Exported for testing. */
export async function developerToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  if (!teamId || !keyId) throw new Error("Missing APPLE_TEAM_ID / APPLE_KEY_ID");
  const key = await importPKCS8(await privateKeyPem(), "ES256");
  const lifetimeSec = 12 * 60 * 60;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + lifetimeSec)
    .sign(key);
  cachedToken = { value: token, expiresAt: Date.now() + lifetimeSec * 1000 };
  return token;
}

interface RawSong {
  id: string;
  attributes?: {
    name: string;
    artistName: string;
    albumName?: string;
    artwork?: { url: string };
    previews?: { url: string }[];
    isrc?: string;
    durationInMillis?: number;
    releaseDate?: string;
    genreNames?: string[];
  };
  relationships?: {
    artists?: { data?: { id: string }[] };
  };
}

function mapSong(raw: RawSong): AppleSong | null {
  const a = raw.attributes;
  if (!a) return null;
  return {
    id: raw.id,
    title: a.name,
    // artistName can be "A & B" / "A, B" for collabs — split for matching.
    artists: a.artistName.split(/\s*(?:,|&|\bfeat\.?\b|\bx\b)\s*/i).filter(Boolean),
    artistId: raw.relationships?.artists?.data?.[0]?.id ?? null,
    album: a.albumName ?? "",
    artUrl: a.artwork ? a.artwork.url.replace("{w}", "300").replace("{h}", "300") : null,
    previewUrl: a.previews?.[0]?.url ?? null,
    isrc: a.isrc ?? null,
    durationMs: a.durationInMillis ?? 0,
    year: a.releaseDate ? Number.parseInt(a.releaseDate.slice(0, 4), 10) || null : null,
    genre: a.genreNames?.find((g) => g !== "Music") ?? null,
  };
}

async function appleFetch<T>(path: string): Promise<T> {
  const token = await developerToken();
  const res = await fetch(`https://api.music.apple.com/v1/catalog/${STOREFRONT}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Apple Music API rejected the developer token. Check APPLE_TEAM_ID / APPLE_KEY_ID / private key."
    );
  }
  if (res.status === 429) {
    throw new Error("Apple Music API rate limit hit");
  }
  if (!res.ok) {
    throw new Error(`Apple Music API request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function searchSongs(
  term: string,
  { limit = 10, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<AppleSong[]> {
  const params = new URLSearchParams({
    term,
    types: "songs",
    limit: String(limit),
    offset: String(offset),
  });
  const data = await appleFetch<{
    results?: { songs?: { data?: RawSong[] } };
  }>(`/search?${params}`);
  return (data.results?.songs?.data ?? [])
    .map(mapSong)
    .filter((s): s is AppleSong => s !== null);
}

/** Most-played songs chart; pass a genre id (e.g. 14 = Pop) to scope it. */
export async function chartSongs(
  { limit = 50, offset = 0, genreId }: { limit?: number; offset?: number; genreId?: number } = {}
): Promise<AppleSong[]> {
  const params = new URLSearchParams({
    types: "songs",
    chart: "most-played",
    limit: String(limit),
    offset: String(offset),
  });
  if (genreId != null) params.set("genre", String(genreId));
  const data = await appleFetch<{
    results?: { songs?: { data?: RawSong[] }[] };
  }>(`/charts?${params}`);
  return (data.results?.songs?.[0]?.data ?? [])
    .map(mapSong)
    .filter((s): s is AppleSong => s !== null);
}

export async function artistTopSongs(artistId: string): Promise<AppleSong[]> {
  const data = await appleFetch<{ data?: RawSong[] }>(
    `/artists/${artistId}/view/top-songs?limit=20`
  );
  return (data.data ?? []).map(mapSong).filter((s): s is AppleSong => s !== null);
}

interface RawAlbum {
  id: string;
  attributes?: { isSingle?: boolean; isCompilation?: boolean; name?: string };
}

export async function artistAlbumIds(artistId: string): Promise<string[]> {
  const data = await appleFetch<{ data?: RawAlbum[] }>(
    `/artists/${artistId}/albums?limit=25`
  );
  return (data.data ?? [])
    .filter((a) => !a.attributes?.isSingle && !a.attributes?.isCompilation)
    .map((a) => a.id);
}

export async function albumSongs(albumId: string): Promise<AppleSong[]> {
  const data = await appleFetch<{ data?: RawSong[] }>(`/albums/${albumId}/tracks?limit=30`);
  return (data.data ?? []).map(mapSong).filter((s): s is AppleSong => s !== null);
}

/** The song's artist id isn't in chart/search payloads by default; resolve it. */
export async function songArtistId(songId: string): Promise<string | null> {
  const data = await appleFetch<{ data?: RawSong[] }>(
    `/songs/${songId}?include=artists`
  );
  return data.data?.[0]?.relationships?.artists?.data?.[0]?.id ?? null;
}

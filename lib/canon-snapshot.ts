import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { AppleSong } from "@/lib/apple";

/**
 * The prebuilt, fully-scored canon.
 *
 * Scoring the whole canon costs one Last.fm request per artist plus a few
 * hundred Apple reads — minutes, not milliseconds, which is why it used to be
 * truncated to a 250-song sample on the request path and why the easy tier
 * ended up drawing from 50 songs. Doing it once, ahead of time, is what makes
 * a canon of thousands affordable at runtime:
 *
 *   npm run build-canon
 *
 * The file is read with `fs` rather than imported: a JSON module of this size
 * makes TypeScript infer a multi-thousand-entry literal type on every build.
 * next.config.ts traces it into the server bundle.
 *
 * A missing or empty snapshot is not an error — lib/popularity.ts falls back
 * to scoring a live sample, exactly as before, just smaller than the real thing.
 */

export interface ScoredSong {
  song: AppleSong;
  /** Distinct Last.fm listeners. */
  listeners: number;
  plays: number;
  /** Decade the song belongs to, e.g. "1980". */
  cohort: string;
  /** How many independent canon sources carry this song. */
  sources: number;
  /** 1-based rank within its own artist's catalog, when known. */
  artistRank: number | null;
  /** The composite ranking key — see lib/popularity.ts. */
  score: number;
}

export interface CanonSnapshot {
  /** ISO timestamp, or null for the committed placeholder. */
  builtAt: string | null;
  /** Storefront the songs were read from; ids and previews are per-market. */
  storefront: string;
  songs: ScoredSong[];
}

export const SNAPSHOT_PATH = path.join(process.cwd(), "data", "canon.json");

/** Snapshots older than this are stale enough to warn about, not to reject. */
export const SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let loaded: CanonSnapshot | null | undefined;

function isScored(value: unknown): value is ScoredSong {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const song = v.song as Record<string, unknown> | undefined;
  return (
    typeof song === "object" &&
    song !== null &&
    typeof song.id === "string" &&
    typeof song.title === "string" &&
    typeof song.primaryArtist === "string" &&
    Array.isArray(song.artists) &&
    typeof v.listeners === "number" &&
    typeof v.score === "number"
  );
}

/**
 * The snapshot, or null when there is none to use. Read once per process.
 * A malformed file falls back to live scoring rather than crashing a round.
 */
export function loadSnapshot(): CanonSnapshot | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  try {
    const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) return loaded;
    const candidate = raw as Partial<CanonSnapshot>;
    const songs = Array.isArray(candidate.songs) ? candidate.songs.filter(isScored) : [];
    if (songs.length === 0) return loaded;
    loaded = {
      builtAt: typeof candidate.builtAt === "string" ? candidate.builtAt : null,
      storefront: typeof candidate.storefront === "string" ? candidate.storefront : "us",
      songs,
    };
  } catch {
    // No snapshot, unreadable, or malformed — live scoring covers it.
  }
  return loaded;
}

export function writeSnapshot(snapshot: CanonSnapshot): void {
  mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot)}\n`, "utf8");
  loaded = undefined;
}

/** Human-readable staleness note for scripts/check-popularity.ts. */
export function snapshotAge(snapshot: CanonSnapshot): { days: number; stale: boolean } | null {
  if (!snapshot.builtAt) return null;
  const at = Date.parse(snapshot.builtAt);
  if (!Number.isFinite(at)) return null;
  const ms = Date.now() - at;
  return { days: Math.floor(ms / (24 * 60 * 60 * 1000)), stale: ms > SNAPSHOT_MAX_AGE_MS };
}

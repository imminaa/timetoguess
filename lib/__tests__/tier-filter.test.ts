import { describe, expect, it, vi } from "vitest";
import type { AppleSong } from "@/lib/apple";
import type { ScoredSong } from "@/lib/canon-snapshot";

/**
 * Where a genre/decade filter is applied inside the tier bands.
 *
 * The bands are quantiles of the *whole* canon, so a filter has to narrow a
 * band after it is cut, never before. Ranking the filtered subset instead
 * would redefine every tier — the top tenth of jazz alone is what a jazz
 * listener knows, not what everybody knows — and easy would quietly become
 * hard for any narrow pick. These tests pin the order of those two steps.
 */

function song(overrides: Partial<AppleSong> = {}): AppleSong {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Song",
    primaryArtist: "Artist",
    artists: ["Artist"],
    artistId: null,
    album: "Album",
    artUrl: null,
    previewUrl: "https://example.test/p.m4a",
    isrc: null,
    durationMs: 200_000,
    year: 1985,
    genre: "Rock",
    ...overrides,
  };
}

/** Rank `n` of a synthetic canon, best-known first. */
function scored(rank: number, overrides: Partial<AppleSong> = {}): ScoredSong {
  const s = song(overrides);
  // The top half clears every tier floor, the bottom half only the zero one.
  const listeners = rank < 50 ? 1_000_000 : 1_000;
  return {
    song: s,
    listeners,
    plays: listeners * 5,
    cohort: String(Math.floor((s.year ?? 1985) / 10) * 10),
    sources: 3,
    artistRank: null,
    score: 1000 - rank,
  };
}

/**
 * 100 songs. Jazz sits at ranks 10-14 and 70-79 and nowhere else, so it has a
 * real presence in the canon while being entirely absent from the easy band —
 * the same shape Classical has in the real snapshot.
 */
const CANON: ScoredSong[] = Array.from({ length: 100 }, (_, rank) => {
  const jazz = (rank >= 10 && rank < 15) || (rank >= 70 && rank < 80);
  // Alternate decades inside the easy band so a decade filter has something
  // to cut there too.
  const year = rank < 10 ? (rank % 2 === 0 ? 1985 : 2021) : 1995;
  return scored(rank, { genre: jazz ? "Jazz" : "Rock", year });
});

vi.mock("@/lib/canon-snapshot", () => ({
  loadSnapshot: () => ({ builtAt: null, storefront: "us", songs: CANON }),
}));

const { tierSongs, tierCounts } = await import("@/lib/popularity");

describe("tierSongs under a filter", () => {
  it("leaves an unfiltered band exactly as it was", async () => {
    expect(await tierSongs("easy")).toHaveLength(10);
    expect(await tierSongs("medium")).toHaveLength(25);
  });

  it("narrows the band after cutting it, not before", async () => {
    // Jazz holds 15 of the 100 songs but none in the top tenth. Filtering
    // first and banding after would rank those 15 among themselves and call
    // the best two "the songs everybody knows".
    expect(await tierSongs("easy", { genres: ["jazzblues"], decades: null })).toHaveLength(0);
    expect(await tierSongs("medium", { genres: ["jazzblues"], decades: null })).toHaveLength(5);
    expect(
      await tierSongs("impossible", { genres: ["jazzblues"], decades: null })
    ).toHaveLength(10);
  });

  it("narrows a band by decade", async () => {
    const eighties = await tierSongs("easy", { genres: null, decades: [1980] });
    expect(eighties).toHaveLength(5);
    expect(eighties.every((s) => s.song.year === 1985)).toBe(true);
  });

  it("applies both axes together", async () => {
    expect(
      await tierSongs("easy", { genres: ["jazzblues"], decades: [1980] })
    ).toHaveLength(0);
    expect(await tierSongs("easy", { genres: ["rock"], decades: [2020] })).toHaveLength(5);
  });
});

describe("tierCounts", () => {
  it("reports what the settings panel shows the player", async () => {
    expect(await tierCounts({ genres: ["jazzblues"], decades: null })).toEqual({
      easy: 0,
      medium: 5,
      impossible: 10,
    });
  });

  it("reports the whole band when nothing is restricted", async () => {
    const counts = await tierCounts({ genres: null, decades: null });
    expect(counts.easy).toBe(10);
    expect(counts.medium).toBe(25);
  });
});

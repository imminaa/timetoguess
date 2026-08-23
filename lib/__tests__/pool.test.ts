import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppleSong } from "@/lib/apple";

function song(
  id: string,
  artist = "Artist",
  title = `Song ${id}`,
  extra: Partial<AppleSong> = {}
): AppleSong {
  return {
    id,
    title,
    primaryArtist: artist,
    artists: [artist],
    artistId: `a-${artist}`,
    album: "Album",
    artUrl: null,
    previewUrl: `https://example.test/${id}.m4a`,
    isrc: null,
    durationMs: 200_000,
    year: 1985,
    genre: "Rock",
    ...extra,
  };
}

/**
 * A small tier, deliberately smaller than the served-history bound, split
 * across two genres and two decades so a filter has something to bite on.
 */
const TIER = [
  ...Array.from({ length: 4 }, (_, i) => song(`r${i}`, `Rock Artist ${i}`)),
  ...Array.from({ length: 4 }, (_, i) =>
    song(`c${i}`, `Country Artist ${i}`, `Song c${i}`, { year: 2021, genre: "Country" })
  ),
];

// The real sampleTier narrows the band by the filter; the mock has to do the
// same or a filter test would pass on a stub that ignores its argument.
vi.mock("@/lib/popularity", async () => {
  const { matchesFilter, NO_FILTER } = await import("@/lib/music-taxonomy");
  return {
    sampleTier: vi.fn(async (_tier: string, want: number, filter = NO_FILTER) =>
      TIER.filter((s) => matchesFilter(s, filter)).slice(0, want)
    ),
    famousSongs: vi.fn(async () => []),
    listenerFloor: vi.fn(async () => 0),
    hasDeepCatalog: vi.fn(async () => true),
  };
});

const { drawTrack, selectCandidates } = await import("@/lib/pool");
const ROCK_IDS = TIER.filter((s) => s.genre === "Rock").map((s) => s.id);

describe("selectCandidates", () => {
  const opts = { isRecent: () => false, alreadyPooled: new Set<string>() };

  it("caps how many songs one artist contributes to a single top-up", () => {
    const flood = Array.from({ length: 10 }, (_, i) => song(`f${i}`, "One Artist"));
    expect(selectCandidates(flood, opts).keep).toHaveLength(3);
  });

  it("counts each artist's cap separately", () => {
    const mixed = [
      ...Array.from({ length: 5 }, (_, i) => song(`a${i}`, "Artist A")),
      ...Array.from({ length: 5 }, (_, i) => song(`b${i}`, "Artist B")),
    ];
    expect(selectCandidates(mixed, opts).keep).toHaveLength(6);
  });

  it("drops unplayable, too-short and junk candidates", () => {
    const bad = [
      { ...song("no-preview"), previewUrl: null },
      { ...song("short"), durationMs: 30_000 },
      { ...song("junk"), title: "Bohemian Rhapsody (Karaoke Version)" },
      song("good"),
    ];
    expect(selectCandidates(bad, opts).keep.map((s) => s.id)).toEqual(["good"]);
  });

  it("skips songs already in the pool without counting them as blocked", () => {
    const s = song("dup");
    const result = selectCandidates([s], {
      ...opts,
      alreadyPooled: new Set([`${"song dup"}|artist`]),
    });
    expect(result.keep).toHaveLength(0);
    expect(result.blockedByRecent).toBe(0);
  });

  it("reports candidates held back only by recent history", () => {
    const result = selectCandidates(TIER, { ...opts, isRecent: () => true });
    expect(result.keep).toHaveLength(0);
    expect(result.blockedByRecent).toBe(TIER.length);
  });
});

describe("drawTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps serving a tier smaller than the served-history bound", async () => {
    // The tier has 8 candidates and the history holds 300. Bounding the
    // history alone never evicts anything here, so the tier used to mark all
    // eight used and then throw for the rest of the process.
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const drawn = await drawTrack("easy");
      expect(drawn.previewUrl).toBeTruthy();
      seen.push(drawn.track.id);
    }
    expect(seen).toHaveLength(40);
    expect(new Set(seen).size).toBe(TIER.length);
  });

  it("does not repeat a track while others remain unserved", async () => {
    const first = new Set<string>();
    for (let i = 0; i < TIER.length; i++) {
      first.add((await drawTrack("medium")).track.id);
    }
    expect(first.size).toBe(TIER.length);
  });

  it("serves only songs matching an active genre filter", async () => {
    const drawn = new Set<string>();
    for (let i = 0; i < 12; i++) {
      drawn.add((await drawTrack("easy", { genres: ["rock"], decades: null })).track.id);
    }
    expect([...drawn].sort()).toEqual([...ROCK_IDS].sort());
  });

  it("serves only songs matching an active decade filter", async () => {
    for (let i = 0; i < 6; i++) {
      const { track } = await drawTrack("easy", { genres: null, decades: [2020] });
      expect(track.year).toBe(2021);
    }
  });

  it("keeps each filter's pool separate from the unfiltered one", async () => {
    // A shared pool would let a song drawn under one filter be marked served
    // for another, and eventually hand a filtered game a song it excluded.
    const filtered = await drawTrack("medium", { genres: ["country"], decades: null });
    expect(filtered.track.genre).toBe("Country");
    const unfiltered = new Set<string>();
    for (let i = 0; i < TIER.length; i++) {
      unfiltered.add((await drawTrack("medium")).track.id);
    }
    expect(unfiltered.size).toBe(TIER.length);
  });

  it("refuses, naming the filter, when nothing matches", async () => {
    // Serving an unfiltered song here would hand a player exactly the genre
    // they just excluded, which is the one thing the setting exists to stop.
    await expect(
      drawTrack("easy", { genres: ["classical"], decades: null })
    ).rejects.toThrow(/No easy songs match your filters \(Classical\)/);
  });

  it("keeps the rate-limit wording when no filter is to blame", async () => {
    // An empty tier with no filter set is a supply problem, not a filter one,
    // and telling that player to widen their genres would be a lie.
    const { sampleTier } = await import("@/lib/popularity");
    const real = vi.mocked(sampleTier).getMockImplementation()!;
    vi.mocked(sampleTier).mockResolvedValue([]);
    try {
      await expect(drawTrack("impossible")).rejects.toThrow(/rate limiting/);
    } finally {
      vi.mocked(sampleTier).mockImplementation(real);
    }
  });
});

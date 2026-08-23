import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppleSong } from "@/lib/apple";

function song(id: string, artist = "Artist", title = `Song ${id}`): AppleSong {
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
  };
}

/** A small tier, deliberately smaller than the served-history bound. */
const TIER = Array.from({ length: 8 }, (_, i) => song(`t${i}`, `Artist ${i}`));

vi.mock("@/lib/popularity", () => ({
  sampleTier: vi.fn(async () => TIER),
  famousSongs: vi.fn(async () => []),
  listenerFloor: vi.fn(async () => 0),
  hasDeepCatalog: vi.fn(async () => true),
}));

const { drawTrack, selectCandidates } = await import("@/lib/pool");

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
});

import { describe, expect, it } from "vitest";
import type { AppleSong } from "@/lib/apple";
import { rankMeasurements, TIER_BANDS, TIER_FLOORS } from "@/lib/popularity";

function song(overrides: Partial<AppleSong> = {}): AppleSong {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
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

interface Input {
  song: AppleSong;
  listeners: number;
  plays: number;
  cohort: string;
  sources: number;
  artistRank: number | null;
}

type MeasuredOverrides = Partial<Omit<Input, "song">> & { song?: Partial<AppleSong> };

function measured(overrides: MeasuredOverrides = {}): Input {
  const listeners = overrides.listeners ?? 100_000;
  return {
    song: song(overrides.song),
    listeners,
    // A neutral plays-per-listener ratio unless a test says otherwise.
    plays: overrides.plays ?? listeners * 5,
    cohort: overrides.cohort ?? "1980",
    sources: overrides.sources ?? 1,
    artistRank: overrides.artistRank ?? null,
  };
}

/** A neutral backdrop so one cohort's median doesn't come from a single song. */
function backdrop(count: number, listeners: number, cohort: string): Input[] {
  return Array.from({ length: count }, () => measured({ listeners, cohort }));
}

describe("rankMeasurements", () => {
  it("ranks a song above an equally-listened one from a more-listened decade", () => {
    const modest = measured({ listeners: 300_000, cohort: "2020", song: { id: "new" } });
    const same = measured({ listeners: 300_000, cohort: "1990", song: { id: "old" } });
    const ranked = rankMeasurements([
      modest,
      same,
      ...backdrop(40, 100_000, "2020"),
      ...backdrop(40, 900_000, "1990"),
    ]);
    const pos = (id: string) => ranked.findIndex((r) => r.song.id === id);
    // 300k is a triumph for the 2020s cohort and unremarkable for the 1990s one.
    expect(pos("new")).toBeLessThan(pos("old"));
  });

  it("rewards songs vouched for by more canon sources", () => {
    const one = measured({ listeners: 200_000, sources: 1, song: { id: "single" } });
    const many = measured({ listeners: 200_000, sources: 4, song: { id: "multi" } });
    const ranked = rankMeasurements([one, many, ...backdrop(30, 200_000, "1980")]);
    const score = (id: string) => ranked.find((r) => r.song.id === id)!.score;
    expect(score("multi")).toBeGreaterThan(score("single"));
    // 4 sources is two doublings: 1 + 0.35*log2(4) = 1.7x.
    expect(score("multi") / score("single")).toBeCloseTo(1.7, 5);
  });

  it("prefers broad reach over a small devoted audience", () => {
    // Same listeners; the cult track is scrobbled far more times per listener.
    const broad = measured({ listeners: 200_000, plays: 600_000, song: { id: "broad" } });
    const cult = measured({ listeners: 200_000, plays: 6_000_000, song: { id: "cult" } });
    const ranked = rankMeasurements([broad, cult, ...backdrop(30, 200_000, "1980")]);
    const pos = (id: string) => ranked.findIndex((r) => r.song.id === id);
    expect(pos("broad")).toBeLessThan(pos("cult"));
  });

  it("rewards being at the top of the artist's own ranking", () => {
    const first = measured({ listeners: 200_000, artistRank: 1, song: { id: "signature" } });
    const twentieth = measured({ listeners: 200_000, artistRank: 20, song: { id: "album-cut" } });
    const ranked = rankMeasurements([first, twentieth, ...backdrop(30, 200_000, "1980")]);
    const score = (id: string) => ranked.find((r) => r.song.id === id)!.score;
    expect(score("signature")).toBeGreaterThan(score("album-cut"));
  });

  it("shrinks a thin cohort's baseline toward the overall median", () => {
    // One 1950s song against a large, much-bigger-listened 1990s cohort. With a
    // per-cohort median it would score exactly 1.0 and rank mid-pack; with the
    // global median it would be crushed. Shrinkage puts it in between.
    const lone = measured({ listeners: 120_000, cohort: "1950", song: { id: "lone" } });
    const ranked = rankMeasurements([lone, ...backdrop(80, 600_000, "1990")]);
    const score = ranked.find((r) => r.song.id === "lone")!.score;
    expect(score).toBeGreaterThan(120_000 / 600_000);
    expect(score).toBeLessThan(1);
  });

  it("gives a well-sampled cohort close to its own median", () => {
    const subject = measured({ listeners: 500_000, cohort: "1960", song: { id: "s" } });
    const ranked = rankMeasurements([
      subject,
      ...backdrop(200, 500_000, "1960"),
      ...backdrop(200, 100_000, "2010"),
    ]);
    // 200 samples against SHRINK_K=25 is w≈0.89, so the ratio stays near 1.
    expect(ranked.find((r) => r.song.id === "s")!.score).toBeCloseTo(1, 1);
  });

  it("returns nothing for no input rather than throwing", () => {
    expect(rankMeasurements([])).toEqual([]);
  });

  it("orders tiers from best-known downward with descending floors", () => {
    expect(TIER_BANDS.easy[1]).toBeLessThanOrEqual(TIER_BANDS.medium[0]);
    expect(TIER_BANDS.medium[1]).toBeLessThanOrEqual(TIER_BANDS.impossible[0]);
    expect(TIER_FLOORS.easy).toBeGreaterThan(TIER_FLOORS.medium);
    expect(TIER_FLOORS.medium).toBeGreaterThan(TIER_FLOORS.hard);
    expect(TIER_FLOORS.hard).toBeGreaterThan(TIER_FLOORS.expert);
    expect(TIER_FLOORS.impossible).toBe(0);
  });
});

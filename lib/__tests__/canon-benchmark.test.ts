import { describe, expect, it } from "vitest";
import { benchmarkIndex, WIDELY_KNOWN } from "@/lib/canon-benchmark";
import { loadSnapshot } from "@/lib/canon-snapshot";
import { popularitySnapshot, tierSongs } from "@/lib/popularity";

/**
 * The gate that the arithmetic in lib/popularity.ts exists to pass: if "the
 * songs everybody knows" does not contain the songs everybody know, the
 * ranking is wrong however defensible its formula looks.
 *
 * Runs against the committed data/canon.json, so it needs no network and no
 * API keys. Rebuild with `npm run build-canon` after changing the scoring.
 */

const snapshot = loadSnapshot();

describe.runIf(snapshot)("widely-known songs land in the top tiers", () => {
  it("has a snapshot worth testing", () => {
    // Guards against the assertions below passing vacuously on an empty file.
    expect(snapshot!.songs.length).toBeGreaterThan(2000);
  });

  it("carries the great majority of the benchmark in the canon at all", async () => {
    const scored = await popularitySnapshot();
    const present = WIDELY_KNOWN.filter((entry) =>
      scored.some((s) => benchmarkIndex(s.song) === WIDELY_KNOWN.indexOf(entry))
    );
    expect(present.length).toBeGreaterThanOrEqual(34);
  });

  it("puts them in easy, and none below medium", async () => {
    const scored = await popularitySnapshot();
    const easy = new Set((await tierSongs("easy")).map((s) => s.song.id));
    const medium = new Set((await tierSongs("medium")).map((s) => s.song.id));

    const placed = WIDELY_KNOWN.map((entry, i) => {
      const hit = scored.find((s) => benchmarkIndex(s.song) === i);
      if (!hit) return { entry, where: "absent" as const };
      if (easy.has(hit.song.id)) return { entry, where: "easy" as const };
      if (medium.has(hit.song.id)) return { entry, where: "medium" as const };
      return { entry, where: "below" as const };
    });

    const present = placed.filter((p) => p.where !== "absent");
    const inEasy = present.filter((p) => p.where === "easy");
    const below = present.filter((p) => p.where === "below");

    // Named in the failure message so a regression says *which* song slipped.
    expect(below.map((p) => `${p.entry.title} — ${p.entry.artist}`)).toEqual([]);
    expect(inEasy.length / present.length).toBeGreaterThanOrEqual(0.75);
  });

  it("spans every decade the canon claims to cover", async () => {
    const easy = await tierSongs("easy");
    const decades = new Set(easy.map((s) => s.cohort));
    // The old ranking put zero 1950s songs in easy against 58 in the canon,
    // because a thin cohort's baseline fell off a cliff.
    for (const decade of ["1950", "1960", "1970", "1980", "1990", "2000", "2010", "2020"]) {
      expect(decades).toContain(decade);
    }
  });

  it("does not let any one decade own the easy tier", async () => {
    const easy = await tierSongs("easy");
    const counts = new Map<string, number>();
    for (const s of easy) counts.set(s.cohort, (counts.get(s.cohort) ?? 0) + 1);
    const largest = Math.max(...counts.values());
    expect(largest / easy.length).toBeLessThan(0.35);
  });
});

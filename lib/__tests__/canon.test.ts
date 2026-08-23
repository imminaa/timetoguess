import { describe, expect, it } from "vitest";
import type { AppleSong } from "@/lib/apple";
import { topArtists, type CanonSource } from "@/lib/canon";

function song(artist: string, title: string): AppleSong {
  return {
    id: `${artist}-${title}`,
    title,
    primaryArtist: artist,
    artists: [artist],
    artistId: null,
    album: "Album",
    artUrl: null,
    previewUrl: "https://example.test/p.m4a",
    isrc: null,
    durationMs: 200_000,
    year: 1975,
    genre: "Rock",
  };
}

function source(kind: CanonSource["kind"], label: string, songs: AppleSong[]): CanonSource {
  return { kind, label, songs };
}

describe("topArtists", () => {
  it("counts every chart appearance as one vote in total", () => {
    // A chart act on 20 market Top 100s versus a classic on two Essentials.
    const charts = Array.from({ length: 20 }, (_, i) =>
      source("chart", `Top 100: Market ${i}`, [song("Chart Act", "This Week")])
    );
    const editorial = [
      source("editorial", "'50s Rock Essentials", [song("Elvis Presley", "Jailhouse Rock")]),
      source("editorial", "'50s Hits Essentials", [song("Elvis Presley", "Hound Dog")]),
    ];
    expect(topArtists([...charts, ...editorial], 2)).toEqual(["Elvis Presley", "Chart Act"]);
  });

  it("ranks by editorial breadth", () => {
    const sources = [
      source("editorial", "a", [song("Deep", "1"), song("Shallow", "1")]),
      source("editorial", "b", [song("Deep", "2")]),
      source("editorial", "c", [song("Deep", "3")]),
    ];
    expect(topArtists(sources, 1)).toEqual(["Deep"]);
  });

  it("counts several songs by one artist in the same editorial source", () => {
    const sources = [
      source("editorial", "a", [song("Prolific", "1"), song("Prolific", "2"), song("Prolific", "3")]),
      source("editorial", "b", [song("Single", "1")]),
    ];
    expect(topArtists(sources, 1)).toEqual(["Prolific"]);
  });

  it("still surfaces a chart-only artist when nothing else competes", () => {
    const sources = [source("chart", "Top 100: Global", [song("New Act", "Hit")])];
    expect(topArtists(sources, 5)).toEqual(["New Act"]);
  });

  it("ignores songs with no usable artist name", () => {
    const sources = [source("editorial", "a", [song("", "Untitled"), song("Real", "Song")])];
    expect(topArtists(sources, 5)).toEqual(["Real"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  DECADES,
  GENRE_FAMILIES,
  decadeOf,
  filterFromParams,
  filterKey,
  filterToParams,
  genreFamily,
  matchesFilter,
  normalizeFilter,
  OLDEST_DECADE,
  type CatalogFilter,
} from "@/lib/music-taxonomy";

describe("genreFamily", () => {
  it("places the plain leaves", () => {
    expect(genreFamily("Rock")).toBe("rock");
    expect(genreFamily("Country")).toBe("country");
    expect(genreFamily("Hip-Hop/Rap")).toBe("hiphop");
    expect(genreFamily("R&B/Soul")).toBe("rnb");
    expect(genreFamily("Classical")).toBe("classical");
  });

  // Each of these leaves is carried by the real canon and matches more than
  // one family's rule. They are the reason the rule list is ordered, so an
  // innocent-looking reorder has to break a test rather than a filter.
  it.each([
    ["Pop Latino", "latin", "pop"],
    ["Urbano latino", "latin", "pop"],
    ["Alternative Rap", "hiphop", "rock"],
    ["West Coast Rap", "hiphop", "rock"],
    ["Modern Dancehall", "world", "dance"],
    ["Afro House", "world", "dance"],
    ["Christian Rock", "other", "rock"],
    ["Christmas: Country", "other", "country"],
    ["Baile Funk", "latin", "rnb"],
    ["Korean Rock", "asia", "rock"],
    ["Vocal Jazz", "jazzblues", "pop"],
    ["Folk-Rock", "rock", "pop"],
    ["Classical Crossover", "classical", "pop"],
    ["Indian Pop", "asia", "pop"],
    ["K-Pop", "asia", "pop"],
  ])("files %s under %s, not %s", (leaf, expected) => {
    expect(genreFamily(leaf)).toBe(expected);
  });

  it("files plain Folk under pop, unlike Folk-Rock", () => {
    expect(genreFamily("Folk")).toBe("pop");
  });

  it("sends an unrecognized leaf to other rather than dropping it", () => {
    // A filter has to place every song somewhere; a leaf none of the rules
    // know is by definition not one of the twelve families a player ticked.
    expect(genreFamily("Zeuhl")).toBe("other");
  });

  it("has no family for an untagged song", () => {
    expect(genreFamily(null)).toBeNull();
    expect(genreFamily("")).toBeNull();
  });

  it("only ever returns a listed family", () => {
    const ids = new Set(GENRE_FAMILIES.map((f) => f.id));
    for (const leaf of ["Rock", "Sertanejo", "Amapiano", "Nonsense", "Doo Wop"]) {
      expect(ids).toContain(genreFamily(leaf));
    }
  });
});

describe("decadeOf", () => {
  it("floors a year to its decade", () => {
    expect(decadeOf(1984)).toBe(1980);
    expect(decadeOf(1990)).toBe(1990);
    expect(decadeOf(2026)).toBe(2020);
  });

  it("clamps everything older than the oldest bucket into it", () => {
    // The canon holds a handful of pre-1950 recordings. They belong in the
    // oldest chip rather than in no chip at all.
    expect(decadeOf(1948)).toBe(OLDEST_DECADE);
    expect(decadeOf(1901)).toBe(OLDEST_DECADE);
  });

  it("has no decade for an unknown year", () => {
    expect(decadeOf(null)).toBeNull();
    expect(decadeOf(undefined)).toBeNull();
  });
});

describe("normalizeFilter", () => {
  it("treats a full selection as no restriction", () => {
    // This is what keeps the default settings drawing exactly as they did
    // before filters existed, including songs Apple never tagged.
    const filter = normalizeFilter({
      genres: GENRE_FAMILIES.map((f) => f.id),
      decades: [...DECADES],
    });
    expect(filter).toEqual({ genres: null, decades: null });
  });

  it("keeps a partial selection", () => {
    const filter = normalizeFilter({ genres: ["rock", "pop"], decades: [1980] });
    expect(filter.genres).toEqual(["pop", "rock"]);
    expect(filter.decades).toEqual([1980]);
  });

  it("drops unknown entries", () => {
    const filter = normalizeFilter({ genres: ["rock", "polka"], decades: [1980, 1337] });
    expect(filter.genres).toEqual(["rock"]);
    expect(filter.decades).toEqual([1980]);
  });

  it("reads an empty selection as unrestricted, never as nothing playable", () => {
    expect(normalizeFilter({ genres: [], decades: [] })).toEqual({
      genres: null,
      decades: null,
    });
  });

  it("deduplicates and sorts, so one selection has one key", () => {
    const a = normalizeFilter({ genres: ["pop", "rock", "pop"], decades: [1990, 1980] });
    const b = normalizeFilter({ genres: ["rock", "pop"], decades: [1980, 1990] });
    expect(filterKey(a)).toBe(filterKey(b));
  });
});

describe("matchesFilter", () => {
  const filter: CatalogFilter = { genres: ["rock"], decades: [1980] };

  it("admits a song matching both axes", () => {
    expect(matchesFilter({ genre: "Hard Rock", year: 1984 }, filter)).toBe(true);
  });

  it("rejects a song failing either axis", () => {
    expect(matchesFilter({ genre: "Country", year: 1984 }, filter)).toBe(false);
    expect(matchesFilter({ genre: "Hard Rock", year: 2024 }, filter)).toBe(false);
  });

  it("rejects a song whose genre or year Apple never supplied", () => {
    // The restriction was explicit, so an unknown value cannot satisfy it.
    expect(matchesFilter({ genre: null, year: 1984 }, filter)).toBe(false);
    expect(matchesFilter({ genre: "Hard Rock", year: null }, filter)).toBe(false);
  });

  it("admits an untagged song when nothing is restricted", () => {
    expect(matchesFilter({ genre: null, year: null }, { genres: null, decades: null })).toBe(
      true
    );
  });

  it("only restricts the axis that carries a selection", () => {
    const decadesOnly: CatalogFilter = { genres: null, decades: [1970] };
    expect(matchesFilter({ genre: null, year: 1975 }, decadesOnly)).toBe(true);
    expect(matchesFilter({ genre: "Rock", year: 1985 }, decadesOnly)).toBe(false);
  });
});

describe("filter params", () => {
  it("round-trips a filter through a query string", () => {
    const filter = normalizeFilter({ genres: ["rock", "jazzblues"], decades: [1960, 1970] });
    const params = new URLSearchParams();
    filterToParams(filter, params);
    expect(filterFromParams(params)).toEqual(filter);
  });

  it("writes nothing for an unrestricted filter", () => {
    const params = new URLSearchParams();
    filterToParams({ genres: null, decades: null }, params);
    expect(params.toString()).toBe("");
  });

  it("reads a missing or junk parameter as unrestricted", () => {
    expect(filterFromParams(new URLSearchParams(""))).toEqual({
      genres: null,
      decades: null,
    });
    expect(filterFromParams(new URLSearchParams("genres=&decades=abc"))).toEqual({
      genres: null,
      decades: null,
    });
  });

  it("keys unfiltered play on an empty string, so it shares one pool", () => {
    expect(filterKey({ genres: null, decades: null })).toBe("");
    expect(filterKey({ genres: ["rock"], decades: null })).not.toBe("");
  });
});

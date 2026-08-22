import { describe, expect, it } from "vitest";
import {
  artistsMatch,
  cleanTitle,
  normalizeTitle,
  queryMatchesSong,
  titlesMatch,
} from "@/lib/normalize";

describe("normalizeTitle", () => {
  it("strips remaster suffixes", () => {
    expect(normalizeTitle("Africa - Remastered 2011")).toBe("africa");
    expect(normalizeTitle("Dreams (2004 Remaster)")).toBe("dreams");
  });

  it("strips feat credits", () => {
    expect(normalizeTitle("Umbrella (feat. JAY-Z)")).toBe("umbrella");
    expect(normalizeTitle("Umbrella feat. JAY-Z")).toBe("umbrella");
    expect(normalizeTitle("Empire State of Mind ft. Alicia Keys")).toBe(
      "empire state of mind"
    );
  });

  it("keeps meaningful brackets, dropping apostrophes", () => {
    expect(normalizeTitle("(I Can't Get No) Satisfaction")).toBe(
      "i cant get no satisfaction"
    );
  });

  it("does not treat 'alive' as the noise word 'live'", () => {
    expect(normalizeTitle("Stayin' Alive (Still Alive)")).toBe(
      "stayin alive still alive"
    );
  });

  it("normalizes punctuation, case, and diacritics", () => {
    expect(titlesMatch("HUMBLE.", "Humble")).toBe(true);
    expect(titlesMatch("Beyoncé's Song", "beyonces song")).toBe(true);
  });
});

describe("titlesMatch", () => {
  it("matches across release variants", () => {
    expect(titlesMatch("Africa - Remastered 2011", "Africa")).toBe(true);
    expect(titlesMatch("Mr. Brightside", "Mr Brightside")).toBe(true);
  });

  it("rejects different songs", () => {
    expect(titlesMatch("Africa", "Rosanna")).toBe(false);
    expect(titlesMatch("", "")).toBe(false);
  });
});

describe("artistsMatch", () => {
  it("matches ignoring case, 'The', and diacritics", () => {
    expect(artistsMatch(["The Killers"], ["Killers"])).toBe(true);
    expect(artistsMatch(["Beyoncé"], ["beyonce"])).toBe(true);
  });

  it("matches when any collaborator overlaps", () => {
    expect(artistsMatch(["Rihanna", "JAY-Z"], ["Rihanna"])).toBe(true);
  });

  it("rejects disjoint artist lists", () => {
    expect(artistsMatch(["Toto"], ["Africa by Toto Tribute Band X"])).toBe(false);
  });
});

describe("cleanTitle", () => {
  it("strips release noise but stays human-readable for third-party lookups", () => {
    // Last.fm scrobbles live under the plain title; Apple ships the decorated one.
    expect(cleanTitle("Africa (Remastered 2011)")).toBe("Africa");
    expect(cleanTitle("Bohemian Rhapsody - Remastered 2011")).toBe("Bohemian Rhapsody");
    expect(cleanTitle("Yeah! (feat. Lil Jon & Ludacris)")).toBe("Yeah!");
    expect(cleanTitle("Rock with You (Single Version)")).toBe("Rock with You");
  });

  it("keeps the casing and punctuation a lookup needs to match on", () => {
    expect(cleanTitle("Don't Stop Me Now")).toBe("Don't Stop Me Now");
    expect(cleanTitle("HUMBLE.")).toBe("HUMBLE.");
    expect(cleanTitle("Beyoncé")).toBe("Beyoncé");
  });

  it("leaves meaningful brackets alone", () => {
    expect(cleanTitle("Sit Down (Reprise)")).toBe("Sit Down (Reprise)");
  });
});

describe("queryMatchesSong", () => {
  const bohemian: [string, string[]] = ["Bohemian Rhapsody", ["Queen"]];

  it("rejects lyrics that name neither the title nor the artist", () => {
    expect(queryMatchesSong("is this the real life", ...bohemian)).toBe(false);
    expect(queryMatchesSong("just a poor boy", ...bohemian)).toBe(false);
    expect(queryMatchesSong("billie jean is not my lover", "Billie Jean", ["Michael Jackson"])).toBe(
      false
    );
  });

  it("accepts the title, partially typed", () => {
    expect(queryMatchesSong("bohem", ...bohemian)).toBe(true);
    expect(queryMatchesSong("Bohemian Rhapsody", ...bohemian)).toBe(true);
    expect(queryMatchesSong("rhapsody", ...bohemian)).toBe(true);
  });

  it("accepts the artist, and title plus artist together", () => {
    expect(queryMatchesSong("queen", ...bohemian)).toBe(true);
    expect(queryMatchesSong("bohemian rhapsody queen", ...bohemian)).toBe(true);
    expect(queryMatchesSong("take on me a-ha", "Take On Me", ["a-ha"])).toBe(true);
  });

  it("ignores punctuation, case, and diacritics", () => {
    expect(queryMatchesSong("dont stop", "Don't Stop Me Now", ["Queen"])).toBe(true);
    expect(queryMatchesSong("beyonce halo", "Halo", ["Beyoncé"])).toBe(true);
  });

  it("still matches across release noise in the catalog title", () => {
    expect(queryMatchesSong("africa", "Africa (Remastered 2011)", ["TOTO"])).toBe(true);
  });

  it("tolerates articles the artist normalizer strips", () => {
    expect(queryMatchesSong("the beatles hey jude", "Hey Jude", ["The Beatles"])).toBe(true);
    expect(queryMatchesSong("the killers mr brightside", "Mr. Brightside", ["The Killers"])).toBe(
      true
    );
  });

  it("rejects a query that is only articles", () => {
    expect(queryMatchesSong("the", "Hey Jude", ["The Beatles"])).toBe(false);
  });

  it("rejects an empty or punctuation-only query", () => {
    expect(queryMatchesSong("", ...bohemian)).toBe(false);
    expect(queryMatchesSong("...", ...bohemian)).toBe(false);
  });
});

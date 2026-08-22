import { describe, expect, it } from "vitest";
import { artistsMatch, cleanTitle, normalizeTitle, titlesMatch } from "@/lib/normalize";

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

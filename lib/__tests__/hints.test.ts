import { describe, expect, it } from "vitest";
import { availableHints, hintLabel, resolveHintText } from "@/lib/hints";

describe("availableHints", () => {
  it("offers the full ladder in order when all metadata exists", () => {
    expect(availableHints({ year: 1987, genre: "Rock", artUrl: "https://x/300x300bb.jpg" })).toEqual(
      ["decade", "genre", "art", "letter"]
    );
  });

  it("falls back to just the letter when everything is null", () => {
    expect(availableHints({ year: null, genre: null, artUrl: null })).toEqual(["letter"]);
  });

  it("drops only the rungs with missing metadata", () => {
    expect(availableHints({ year: 2003, genre: null, artUrl: null })).toEqual([
      "decade",
      "letter",
    ]);
  });
});

describe("resolveHintText", () => {
  const song = { title: "Take On Me", year: 1987, genre: "Synth-pop", artUrl: null };

  it("rounds the year down to a decade", () => {
    expect(resolveHintText(song, "decade")).toBe("1980s");
    expect(resolveHintText({ ...song, year: 2020 }, "decade")).toBe("2020s");
  });

  it("passes the genre through", () => {
    expect(resolveHintText(song, "genre")).toBe("Synth-pop");
  });

  it("uses the first alphanumeric character of the title, uppercased", () => {
    expect(resolveHintText(song, "letter")).toBe("T");
    expect(resolveHintText({ ...song, title: "99 Luftballons" }, "letter")).toBe("9");
    expect(resolveHintText({ ...song, title: "(Don't Fear) The Reaper" }, "letter")).toBe("D");
    expect(resolveHintText({ ...song, title: "élan" }, "letter")).toBe("É");
  });
});

describe("hintLabel", () => {
  it("labels every ladder rung", () => {
    expect(hintLabel("decade")).toBe("decade");
    expect(hintLabel("art")).toBe("album art");
  });
});

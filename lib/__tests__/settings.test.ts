import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DISABLED_STAGES, STAGES } from "@/lib/game-config";
import { DECADES, GENRE_FAMILIES } from "@/lib/music-taxonomy";
import { defaultSettings, loadSettings, saveSettings, settingsFilter } from "@/lib/settings";

/**
 * The settings module reads `localStorage` behind a `typeof window` guard, so
 * the node test environment needs both stubbed to exercise anything but the
 * defaults.
 */
const store = new Map<string, string>();

const KEY = "guessable:settings:v1";

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaultSettings", () => {
  it("starts with every genre and decade on", () => {
    const d = defaultSettings();
    expect(d.genres).toEqual(GENRE_FAMILIES.map((f) => f.id));
    expect(d.decades).toEqual([...DECADES]);
  });

  it("leaves the default draw unrestricted", () => {
    // A new player must draw from the whole canon, including songs Apple never
    // tagged with a genre or a year.
    expect(settingsFilter(defaultSettings())).toEqual({ genres: null, decades: null });
  });
});

describe("loadSettings", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it("round-trips a saved selection", () => {
    saveSettings({ enabledStages: [2, 8], genres: ["rock"], decades: [1970, 1980] });
    const loaded = loadSettings();
    expect(loaded.enabledStages).toEqual([2, 8]);
    expect(loaded.genres).toEqual(["rock"]);
    expect(loaded.decades).toEqual([1970, 1980]);
  });

  it("fills in the filters for a record saved before they existed", () => {
    // Settings written by an earlier build carry only enabledStages. Losing
    // that record would silently re-enable the 0.01s stage a player turned on.
    store.set(KEY, JSON.stringify({ enabledStages: [0.5, 15] }));
    const loaded = loadSettings();
    expect(loaded.enabledStages).toEqual([0.5, 15]);
    expect(loaded.genres).toEqual(defaultSettings().genres);
    expect(loaded.decades).toEqual(defaultSettings().decades);
  });

  it("drops unrecognized entries but keeps the rest of the axis", () => {
    store.set(
      KEY,
      JSON.stringify({ genres: ["rock", "polka"], decades: [1980, 1337], enabledStages: [2] })
    );
    const loaded = loadSettings();
    expect(loaded.genres).toEqual(["rock"]);
    expect(loaded.decades).toEqual([1980]);
  });

  it("falls back to everything when an axis would end up empty", () => {
    // An empty axis means "nothing may be drawn", which would leave a player
    // unable to start any round at all.
    store.set(KEY, JSON.stringify({ genres: [], decades: ["nope"], enabledStages: [] }));
    const loaded = loadSettings();
    expect(loaded.genres).toEqual(defaultSettings().genres);
    expect(loaded.decades).toEqual(defaultSettings().decades);
    expect(loaded.enabledStages).toEqual(
      STAGES.filter((s) => !DEFAULT_DISABLED_STAGES.includes(s))
    );
  });

  it("falls back to the defaults on malformed JSON", () => {
    store.set(KEY, "{not json");
    expect(loadSettings()).toEqual(defaultSettings());
  });

  it("sorts decades and stages ascending however they were stored", () => {
    saveSettings({ enabledStages: [15, 2], genres: ["pop"], decades: [2000, 1960] });
    const loaded = loadSettings();
    expect(loaded.enabledStages).toEqual([2, 15]);
    expect(loaded.decades).toEqual([1960, 2000]);
  });
});

describe("settingsFilter", () => {
  it("restricts only the axis the player narrowed", () => {
    const filter = settingsFilter({
      enabledStages: [2],
      genres: GENRE_FAMILIES.map((f) => f.id),
      decades: [1970, 1980],
    });
    expect(filter.genres).toBeNull();
    expect(filter.decades).toEqual([1970, 1980]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { songPopularity } from "@/lib/lastfm";

/**
 * The mismatch guard, which exists because Last.fm's `autocorrect` never
 * reports a miss — it hands back a different artist's song of the same name.
 * Asking it for "Earth" / September (Apple splits "Earth, Wind & Fire" on the
 * ampersand) returned 1,215 listeners for the real song's 2,171,206, which
 * filed a universally-known song at the bottom of the ranking.
 */

interface TopTrack {
  name: string;
  listeners: number;
  plays: number;
}

function stubLastfm(catalog: Record<string, TopTrack[]>, info: Record<string, number>) {
  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const method = url.searchParams.get("method");
    const artist = url.searchParams.get("artist") ?? "";
    if (method === "artist.getTopTracks") {
      const tracks = catalog[artist] ?? [];
      return new Response(
        JSON.stringify({
          toptracks: {
            track: tracks.map((t, i) => ({
              name: t.name,
              listeners: String(t.listeners),
              playcount: String(t.plays),
              "@attr": { rank: String(i + 1) },
            })),
          },
        }),
        { status: 200 }
      );
    }
    if (method === "track.getInfo") {
      const key = `${artist}|${url.searchParams.get("track")}`;
      const listeners = info[key];
      if (listeners === undefined) {
        return new Response(JSON.stringify({ error: 6, message: "Track not found" }), { status: 404 });
      }
      return new Response(
        JSON.stringify({ track: { listeners: String(listeners), playcount: String(listeners * 4) } }),
        { status: 200 }
      );
    }
    throw new Error(`unexpected method ${method}`);
  });
}

const original = globalThis.fetch;

beforeEach(() => {
  process.env.LASTFM_API_KEY = "test-key";
  // Exercise the retry logic without paying the production request rate.
  process.env.LASTFM_MIN_REQUEST_GAP_MS = "0";
});

afterEach(() => {
  globalThis.fetch = original;
  vi.restoreAllMocks();
});

describe("rate limiting", () => {
  it("retries a 429 instead of losing the song", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return new Response("", { status: 429, headers: { "retry-after": "0" } });
      }
      return new Response(
        JSON.stringify({
          toptracks: {
            track: [
              {
                name: "Blinding Lights",
                listeners: "2422612",
                playcount: "20000000",
                "@attr": { rank: "1" },
              },
            ],
          },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    // A swallowed 429 is what filed Blinding Lights as "unverifiable".
    const found = await songPopularity("The Weeknd", "Blinding Lights");
    expect(calls).toBe(2);
    expect(found).toMatchObject({ listeners: 2_422_612, confident: true });
  });

  it("gives up loudly rather than silently, once retries are exhausted", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("", { status: 429, headers: { "retry-after": "0" } })
    ) as unknown as typeof fetch;

    await expect(songPopularity("Throttled Artist", "Some Song")).rejects.toThrow(/rate limit/i);
  });
});

describe("songPopularity", () => {
  it("answers from the artist's own catalog, with its rank", async () => {
    globalThis.fetch = stubLastfm(
      {
        "Earth, Wind & Fire": [
          { name: "September", listeners: 2_171_206, plays: 17_991_738 },
          { name: "Let's Groove", listeners: 1_308_941, plays: 8_253_613 },
        ],
      },
      {}
    ) as unknown as typeof fetch;

    const found = await songPopularity("Earth, Wind & Fire", "September");
    expect(found).toMatchObject({ listeners: 2_171_206, artistRank: 1, confident: true });
  });

  it("rejects a title lookup that lands implausibly above the artist's catalog", async () => {
    // "Earth" has a small catalog; a 2.1M-listener answer cannot be its song.
    globalThis.fetch = stubLastfm(
      { Earth: [{ name: "Ouroboros", listeners: 40_000, plays: 200_000 }] },
      { "Earth|September": 2_171_206 }
    ) as unknown as typeof fetch;

    expect(await songPopularity("Earth", "September")).toBeNull();
  });

  it("still accepts a genuine deep cut below the catalog floor", async () => {
    globalThis.fetch = stubLastfm(
      {
        Radiohead: [
          { name: "Creep", listeners: 4_203_595, plays: 30_000_000 },
          { name: "Karma Police", listeners: 3_360_178, plays: 25_000_000 },
        ],
      },
      { "Radiohead|Blow Out": 180_000 }
    ) as unknown as typeof fetch;

    const found = await songPopularity("Radiohead", "Blow Out");
    expect(found).toMatchObject({ listeners: 180_000, artistRank: null, confident: true });
  });

  it("flags a lookup it could not check against any catalog", async () => {
    globalThis.fetch = stubLastfm({}, { "Nobody At All|Some Song": 900 }) as unknown as typeof fetch;

    const found = await songPopularity("Nobody At All", "Some Song");
    expect(found).toMatchObject({ listeners: 900, confident: false });
  });

  it("matches Apple's release noise against Last.fm's plain title", async () => {
    globalThis.fetch = stubLastfm(
      { TOTO: [{ name: "Africa", listeners: 2_312_709, plays: 20_000_000 }] },
      {}
    ) as unknown as typeof fetch;

    const found = await songPopularity("TOTO", "Africa (Remastered 2011)");
    expect(found).toMatchObject({ listeners: 2_312_709, confident: true });
  });

  it("prefers the lead artist over a near-empty collaboration-credit page", async () => {
    // Last.fm keeps a splinter entity for the full credit whose whole catalog
    // peaks at 20,265, alongside the real Daft Punk page at 2.4M.
    globalThis.fetch = stubLastfm(
      {
        "Daft Punk, Pharrell Williams & Nile Rodgers": [
          { name: "Get Lucky", listeners: 20_265, plays: 104_065 },
        ],
        "Daft Punk": [
          { name: "Instant Crush", listeners: 2_421_083, plays: 20_000_000 },
          { name: "Get Lucky", listeners: 863_427, plays: 4_634_031 },
        ],
      },
      {}
    ) as unknown as typeof fetch;

    const found = await songPopularity(
      "Daft Punk, Pharrell Williams & Nile Rodgers",
      "Get Lucky",
      ["Daft Punk"]
    );
    expect(found?.listeners).toBe(863_427);
  });

  it("keeps the unsplit credit when the split one is the impostor", async () => {
    // The reverse direction: "Earth" must not win just because it answered.
    globalThis.fetch = stubLastfm(
      {
        "Earth, Wind & Fire": [{ name: "September", listeners: 2_171_206, plays: 17_991_738 }],
        Earth: [{ name: "September", listeners: 1_215, plays: 4_000 }],
      },
      {}
    ) as unknown as typeof fetch;

    const found = await songPopularity("Earth, Wind & Fire", "September", ["Earth"]);
    expect(found?.listeners).toBe(2_171_206);
  });

  it("returns null when neither the catalog nor a title lookup knows the song", async () => {
    globalThis.fetch = stubLastfm(
      { Someone: [{ name: "A Song", listeners: 5_000, plays: 20_000 }] },
      {}
    ) as unknown as typeof fetch;

    expect(await songPopularity("Someone", "Nonexistent Track")).toBeNull();
  });
});

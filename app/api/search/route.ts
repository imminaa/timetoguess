import { hasAppleCreds, searchSongs } from "@/lib/apple";
import { queryMatchesSong } from "@/lib/normalize";

export const dynamic = "force-dynamic";

const SUGGESTIONS = 8;
/** Apple caps search at 25. Over-fetch so lyric hits can be dropped without emptying the list. */
const FETCH_LIMIT = 25;

/** Autocomplete for the guess box, backed by Apple Music catalog search. */
export async function GET(req: Request): Promise<Response> {
  if (!hasAppleCreds()) {
    return Response.json({ error: "setup" }, { status: 503 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ results: [] });
  }
  try {
    const songs = await searchSongs(q, { limit: FETCH_LIMIT });
    return Response.json({
      results: songs
        // Apple matches lyrics too, which would let you type the chorus and be
        // handed the answer. Keep only songs the query actually names.
        .filter((s) => queryMatchesSong(q, s.title, s.artists))
        .slice(0, SUGGESTIONS)
        .map((s) => ({
          id: s.id,
          title: s.title,
          artists: s.artists,
          artUrl: s.artUrl,
        })),
    });
  } catch {
    return Response.json({ results: [] }, { status: 502 });
  }
}

import { hasAppleCreds, searchSongs } from "@/lib/apple";

export const dynamic = "force-dynamic";

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
    const songs = await searchSongs(q, { limit: 8 });
    return Response.json({
      results: songs.map((s) => ({
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

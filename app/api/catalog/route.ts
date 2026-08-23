import { hasAppleCreds } from "@/lib/apple";
import { hasLastfmCreds } from "@/lib/lastfm";
import { filterFromParams } from "@/lib/music-taxonomy";
import { tierCounts } from "@/lib/popularity";

/**
 * How many canon songs survive a genre/decade filter, per tier.
 *
 * The settings panel calls this so a filter's damage is visible while it is
 * being set rather than at the moment a round refuses to start — Classical has
 * no songs in the easy band at all, and Country has twelve. Counts only; no
 * song ever leaves this route, so it cannot leak an answer.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!hasAppleCreds() || !hasLastfmCreds()) {
    return Response.json({ error: "setup" }, { status: 503 });
  }
  try {
    const counts = await tierCounts(filterFromParams(new URL(req.url).searchParams));
    return Response.json({ counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the catalog";
    return Response.json({ error: message }, { status: 502 });
  }
}

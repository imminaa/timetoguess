import { encryptAnswer } from "@/lib/answer-token";
import { hasAppleCreds } from "@/lib/apple";
import { isDifficulty } from "@/lib/game-config";
import { hasLastfmCreds } from "@/lib/lastfm";
import { drawTrack } from "@/lib/pool";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!hasAppleCreds() || !hasLastfmCreds()) {
    return Response.json({ error: "setup" }, { status: 503 });
  }
  const difficulty = new URL(req.url).searchParams.get("difficulty") ?? "";
  if (!isDifficulty(difficulty)) {
    return Response.json({ error: "Unknown difficulty" }, { status: 400 });
  }
  try {
    const { track, previewUrl } = await drawTrack(difficulty);
    const token = encryptAnswer({
      trackId: track.id,
      title: track.title,
      artists: track.artists,
      artUrl: track.artUrl,
      previewUrl,
      year: track.year,
      genre: track.genre,
    });
    return Response.json({
      token,
      audioUrl: `/api/audio?t=${encodeURIComponent(token)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start a round";
    return Response.json({ error: message }, { status: 502 });
  }
}

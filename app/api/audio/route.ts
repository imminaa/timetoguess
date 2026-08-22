import { decryptAnswer } from "@/lib/answer-token";

export const dynamic = "force-dynamic";

/**
 * Streams the round's iTunes preview. The client never sees the upstream URL
 * (nothing about the song leaks into devtools) and same-origin fetch keeps
 * the Web Audio decode path CORS-free.
 */
export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("t");
  const answer = token ? decryptAnswer(token) : null;
  if (!answer) {
    return Response.json({ error: "Invalid round token" }, { status: 400 });
  }
  const upstream = await fetch(answer.previewUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "Preview unavailable" }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mp4",
      "Cache-Control": "private, max-age=600",
    },
  });
}

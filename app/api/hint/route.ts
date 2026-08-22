import { decryptAnswer } from "@/lib/answer-token";
import { availableHints, resolveHintText } from "@/lib/hints";
import type { HintPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

interface HintBody {
  token?: string;
  hintIndex?: number;
}

/**
 * POST reveals one rung of the round's hint ladder. The server is stateless
 * (answers live in the token), so it can't know how many hints were "paid
 * for" — but each response reveals exactly one rung and never the answer,
 * which is the invariant that matters.
 */
export async function POST(req: Request): Promise<Response> {
  let body: HintBody;
  try {
    body = (await req.json()) as HintBody;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const answer = body.token ? decryptAnswer(body.token) : null;
  if (!answer) {
    return Response.json({ error: "Invalid round token" }, { status: 400 });
  }
  const rungs = availableHints(answer);
  const index = body.hintIndex;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= rungs.length) {
    return Response.json({ error: "No such hint" }, { status: 400 });
  }
  const type = rungs[index];
  const hint: HintPayload =
    type === "art" ? { type } : { type, text: resolveHintText(answer, type) };
  return Response.json({ hint });
}

/**
 * GET streams a tiny (40×40) version of the album art for the blurred-art
 * hint. Apple artwork URLs are size-templated, so downscaling is a URL edit —
 * un-blurring in devtools yields only a thumbnail, and the full-size art
 * still only reaches the client at reveal.
 */
export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("t");
  const answer = token ? decryptAnswer(token) : null;
  if (!answer) {
    return Response.json({ error: "Invalid round token" }, { status: 400 });
  }
  if (!answer.artUrl) {
    return Response.json({ error: "No album art" }, { status: 404 });
  }
  const upstream = await fetch(answer.artUrl.replace(/\d+x\d+/, "40x40"), {
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "Art unavailable" }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=600",
    },
  });
}

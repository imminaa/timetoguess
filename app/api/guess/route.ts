import { decryptAnswer, type RoundAnswer } from "@/lib/answer-token";
import { artistsMatch, titlesMatch } from "@/lib/normalize";

export const dynamic = "force-dynamic";

interface GuessBody {
  token?: string;
  guess?: { id?: string; title?: string; artists?: string[] };
  /** True when this request should reveal the answer regardless of correctness (gave up / out of stages). */
  reveal?: boolean;
}

function publicAnswer(answer: RoundAnswer) {
  return {
    trackId: answer.trackId,
    title: answer.title,
    artists: answer.artists,
    artUrl: answer.artUrl,
    year: answer.year,
    genre: answer.genre,
  };
}

export async function POST(req: Request): Promise<Response> {
  let body: GuessBody;
  try {
    body = (await req.json()) as GuessBody;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const answer = body.token ? decryptAnswer(body.token) : null;
  if (!answer) {
    return Response.json({ error: "Invalid round token" }, { status: 400 });
  }

  let correct = false;
  if (body.guess) {
    const { id, title, artists } = body.guess;
    correct =
      (id != null && id === answer.trackId) ||
      (title != null &&
        titlesMatch(title, answer.title) &&
        (artists == null || artists.length === 0 || artistsMatch(artists, answer.artists)));
  }

  const shouldReveal = correct || body.reveal === true;
  return Response.json({
    correct,
    answer: shouldReveal ? publicAnswer(answer) : undefined,
  });
}

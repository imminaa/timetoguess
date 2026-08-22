/** Shapes shared between API routes and client components. */

export interface RoundData {
  token: string;
  audioUrl: string;
}

export interface SearchResult {
  id: string;
  title: string;
  artists: string[];
  artUrl: string | null;
}

export interface PublicAnswer {
  trackId: string;
  title: string;
  artists: string[];
  artUrl: string | null;
  year: number | null;
  genre: string | null;
}

export interface GuessResponse {
  correct: boolean;
  answer?: PublicAnswer;
}

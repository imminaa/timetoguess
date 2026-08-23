/** Shapes shared between API routes and client components. */

import type { HintType } from "@/lib/hints";

export interface RoundData {
  token: string;
  audioUrl: string;
  /** Hint rungs this round can offer — reveals only which metadata fields exist. */
  hintTypes: HintType[];
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

/** The art hint carries no URL — the client requests `/api/hint?t=<token>` itself. */
export type HintPayload =
  | { type: Exclude<HintType, "art">; text: string }
  | { type: "art" };

export interface HintResponse {
  hint: HintPayload;
}

/** Canon songs surviving the genre/decade filter, per directly-drawn tier. */
export interface CatalogCounts {
  easy: number;
  medium: number;
  impossible: number;
}

export interface CatalogResponse {
  counts: CatalogCounts;
}

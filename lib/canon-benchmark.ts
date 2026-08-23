import type { AppleSong } from "@/lib/apple";
import { cleanTitle, normalizeArtist, normalizeTitle } from "@/lib/normalize";

/**
 * Songs that any reasonable player would name instantly.
 *
 * This is a fixed yardstick for the one thing the tier algorithm exists to get
 * right: if "the songs everybody knows" does not contain the songs everybody
 * knows, the ranking is wrong no matter how defensible its arithmetic looks.
 * Chosen to span the decades and genres the canon claims to cover, and kept
 * deliberately uncontroversial — every entry is a career-defining single.
 *
 * Used by lib/__tests__/canon-benchmark.test.ts as a regression gate and by
 * scripts/check-popularity.ts as a readout.
 */

export interface BenchmarkSong {
  title: string;
  artist: string;
  decade: number;
}

export const WIDELY_KNOWN: BenchmarkSong[] = [
  { title: "Johnny B. Goode", artist: "Chuck Berry", decade: 1950 },
  { title: "Jailhouse Rock", artist: "Elvis Presley", decade: 1950 },
  { title: "What'd I Say", artist: "Ray Charles", decade: 1950 },
  { title: "Satisfaction", artist: "The Rolling Stones", decade: 1960 },
  { title: "My Girl", artist: "The Temptations", decade: 1960 },
  { title: "Respect", artist: "Aretha Franklin", decade: 1960 },
  { title: "Good Vibrations", artist: "The Beach Boys", decade: 1960 },
  { title: "The Sound of Silence", artist: "Simon & Garfunkel", decade: 1960 },
  { title: "Dancing in the Street", artist: "Martha Reeves & The Vandellas", decade: 1960 },
  { title: "Bohemian Rhapsody", artist: "Queen", decade: 1970 },
  { title: "Stayin' Alive", artist: "Bee Gees", decade: 1970 },
  { title: "Dancing Queen", artist: "ABBA", decade: 1970 },
  { title: "Hotel California", artist: "Eagles", decade: 1970 },
  { title: "Imagine", artist: "John Lennon", decade: 1970 },
  { title: "September", artist: "Earth, Wind & Fire", decade: 1970 },
  { title: "Billie Jean", artist: "Michael Jackson", decade: 1980 },
  { title: "Take On Me", artist: "a-ha", decade: 1980 },
  { title: "Sweet Child O' Mine", artist: "Guns N' Roses", decade: 1980 },
  { title: "Like a Prayer", artist: "Madonna", decade: 1980 },
  { title: "Africa", artist: "TOTO", decade: 1980 },
  { title: "Don't Stop Believin'", artist: "Journey", decade: 1980 },
  { title: "Every Breath You Take", artist: "The Police", decade: 1980 },
  { title: "Smells Like Teen Spirit", artist: "Nirvana", decade: 1990 },
  { title: "Wonderwall", artist: "Oasis", decade: 1990 },
  { title: "...Baby One More Time", artist: "Britney Spears", decade: 1990 },
  { title: "I Will Always Love You", artist: "Whitney Houston", decade: 1990 },
  { title: "Wannabe", artist: "Spice Girls", decade: 1990 },
  { title: "Losing My Religion", artist: "R.E.M.", decade: 1990 },
  { title: "Mr. Brightside", artist: "The Killers", decade: 2000 },
  { title: "Hey Ya!", artist: "OutKast", decade: 2000 },
  { title: "Seven Nation Army", artist: "The White Stripes", decade: 2000 },
  { title: "Crazy In Love", artist: "Beyoncé", decade: 2000 },
  { title: "Lose Yourself", artist: "Eminem", decade: 2000 },
  { title: "Viva La Vida", artist: "Coldplay", decade: 2000 },
  { title: "Rolling in the Deep", artist: "Adele", decade: 2010 },
  { title: "Uptown Funk", artist: "Mark Ronson", decade: 2010 },
  { title: "Shape of You", artist: "Ed Sheeran", decade: 2010 },
  { title: "Get Lucky", artist: "Daft Punk", decade: 2010 },
  { title: "Blinding Lights", artist: "The Weeknd", decade: 2010 },
  { title: "As It Was", artist: "Harry Styles", decade: 2020 },
];

/**
 * Whether a catalog song is this benchmark entry.
 *
 * Artist comparison accepts the unsplit `primaryArtist` as well as the split
 * list, so "Earth, Wind & Fire" matches whether the benchmark names the band
 * or the catalog happens to have credited only part of it.
 */
export function matchesBenchmark(song: AppleSong, entry: BenchmarkSong): boolean {
  const wanted = normalizeTitle(cleanTitle(entry.title));
  const title = normalizeTitle(cleanTitle(song.title));
  if (!wanted || !title) return false;
  // "Satisfaction" vs "(I Can't Get No) Satisfaction" — one contains the other.
  if (title !== wanted && !title.includes(wanted) && !wanted.includes(title)) return false;
  const artist = normalizeArtist(entry.artist);
  const candidates = [song.primaryArtist, ...song.artists].map(normalizeArtist);
  return candidates.some((c) => c === artist || c.includes(artist) || artist.includes(c));
}

/** Index of the first benchmark entry this song satisfies, or -1. */
export function benchmarkIndex(song: AppleSong): number {
  return WIDELY_KNOWN.findIndex((entry) => matchesBenchmark(song, entry));
}

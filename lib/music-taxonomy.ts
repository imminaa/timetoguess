/**
 * Genre families and decade buckets — safe to import from both server and
 * client code.
 *
 * Apple tags every song with a leaf genre, and the canon carries 117 distinct
 * ones: "Hard Rock", "Urbano latino", "Vocal Jazz", "Christmas: Country".
 * Useful for a hint, useless as a filter — nobody wants to tick 117 boxes to
 * say "no country". These families collapse the leaves into the dozen buckets
 * people actually think in.
 *
 * Matching is by ordered regex rather than an enumerated list because Apple
 * adds leaves without warning; a rule that reads the words in the name places
 * "Afro House" and "Alternative Rap" correctly the day they first appear,
 * where a lookup table would silently drop them into Other.
 *
 * Order is the whole design. Every rule below is reachable only because the
 * ones above it already claimed their overlaps:
 *   "Pop Latino"     latin, not pop        (latin precedes pop)
 *   "Alternative Rap" hiphop, not rock     (hiphop precedes rock)
 *   "Modern Dancehall" world, not dance    (world precedes dance)
 *   "Christian Rock"  faith, not rock      (other precedes rock)
 *   "Christmas: Country" faith, not country (other precedes country)
 *   "Folk-Rock"       rock, but "Folk" pop (rock precedes pop)
 */

export type GenreFamilyId =
  | "pop"
  | "rock"
  | "hiphop"
  | "rnb"
  | "country"
  | "dance"
  | "latin"
  | "jazzblues"
  | "classical"
  | "world"
  | "asia"
  | "screen"
  | "other";

export interface GenreFamily {
  id: GenreFamilyId;
  label: string;
}

/** Display order for the settings chips — broadly most-populated first. */
export const GENRE_FAMILIES: readonly GenreFamily[] = [
  { id: "pop", label: "Pop" },
  { id: "rock", label: "Rock" },
  { id: "hiphop", label: "Hip-Hop / Rap" },
  { id: "rnb", label: "R&B / Soul" },
  { id: "country", label: "Country" },
  { id: "dance", label: "Dance / Electronic" },
  { id: "latin", label: "Latin" },
  { id: "jazzblues", label: "Jazz / Blues" },
  { id: "world", label: "Reggae / Afro / World" },
  { id: "asia", label: "Asian Pop" },
  { id: "classical", label: "Classical" },
  { id: "screen", label: "Soundtracks" },
  { id: "other", label: "Kids / Faith / Other" },
];

const FAMILY_RULES: readonly (readonly [GenreFamilyId, RegExp])[] = [
  ["hiphop", /\brap\b|hip[- ]?hop|\btrap\b|dirty south|drill/i],
  [
    "asia",
    /k-pop|j-pop|c-pop|mandopop|cantopop|bollywood|indian|tamil|punjabi|telugu|hindi|korean|anime|j-rock|desi|thai|vietnam/i,
  ],
  [
    "latin",
    /latino|latin|mexicana|mexicano|sertanejo|pagode|brazil|salsa|tropical|reggaeton|bossa|samba|cumbia|bachata|merengue|tango|ax[eé]|\bmpb\b|baile funk|flamenco|forr[oó]|norte[nñ]/i,
  ],
  [
    "world",
    /reggae|dancehall|soca|calypso|caribbean|afro|african|worldwide|worldbeat|\bska\b|celtic|amapiano|klezmer|turkish|dangdut|arabic|highlife|zouk/i,
  ],
  // Before country and rock, so "Christmas: Country" and "Christian Rock"
  // land here rather than in the family a parent is trying to keep.
  [
    "other",
    /children|christian|gospel|worship|gregorian|holiday|christmas|spoken word|lullab|devotional|comedy|karaoke|\bccm\b|sound effects/i,
  ],
  ["country", /country|bluegrass|honky|americana|cowboy|western swing/i],
  ["jazzblues", /jazz|blues|swing|bebop|big band|ragtime|dixieland|boogie[- ]woogie/i],
  [
    "classical",
    /classical|opera|orchestral|chamber|baroque|romantic era|new age|avant-garde|impressionist|minimalism|early music/i,
  ],
  ["screen", /soundtrack|musical|score|show tunes|broadway|anime score/i],
  ["rnb", /r&b|soul|motown|funk|disco|doo wop|quiet storm/i],
  [
    "rock",
    /rock|metal|punk|grunge|alternative|new wave|psychedelic|oldies|surf|british invasion|\bemo\b|hardcore|\bprog|shoegaze|goth/i,
  ],
  [
    "dance",
    /dance|electronic|house|techno|trance|ambient|downtempo|drum|dubstep|\bedm\b|garage|breakbeat|lounge|\bidm\b|jungle|\bclub\b|synth|industrial/i,
  ],
  ["pop", /pop|vocal|folk|singer|easy listening|adult contemporary|standards|chanson/i],
];

/**
 * Which family a raw Apple genre belongs to, or null when the song is
 * untagged. An unrecognized leaf falls to "other" rather than null: a filter
 * has to place every song somewhere, and a name none of the rules recognize is
 * by definition not one of the twelve families a player picked.
 */
export function genreFamily(genre: string | null | undefined): GenreFamilyId | null {
  if (!genre) return null;
  for (const [family, rule] of FAMILY_RULES) {
    if (rule.test(genre)) return family;
  }
  return "other";
}

export function isGenreFamilyId(value: string): value is GenreFamilyId {
  return GENRE_FAMILIES.some((f) => f.id === value);
}

export function genreFamilyLabel(id: GenreFamilyId): string {
  return GENRE_FAMILIES.find((f) => f.id === id)!.label;
}

/**
 * Selectable decades, oldest first. 1950 is a floor, not a bucket: the canon
 * holds 15 songs recorded before 1950 across four decades, too few to be worth
 * their own chips and too few to be silently unreachable.
 */
export const DECADES: readonly number[] = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export const OLDEST_DECADE = DECADES[0];

export function decadeLabel(decade: number): string {
  return decade === OLDEST_DECADE ? `${decade}s & older` : `${decade}s`;
}

/** The decade bucket a release year falls in, or null when the year is unknown. */
export function decadeOf(year: number | null | undefined): number | null {
  if (typeof year !== "number" || !Number.isFinite(year)) return null;
  return Math.max(OLDEST_DECADE, Math.floor(year / 10) * 10);
}

export function isDecade(value: number): boolean {
  return DECADES.includes(value);
}

/**
 * A restriction on which songs may be served.
 *
 * `null` on either axis means "no restriction", and is not the same as listing
 * every option: an unrestricted filter admits songs whose genre or year Apple
 * never supplied, where an explicit list cannot. Every producer of a filter
 * normalizes a full selection back to null (see `normalizeFilter`), so the
 * default settings leave the draw exactly as it was before filters existed.
 */
export interface CatalogFilter {
  genres: GenreFamilyId[] | null;
  decades: number[] | null;
}

export const NO_FILTER: CatalogFilter = { genres: null, decades: null };

export function isUnfiltered(filter: CatalogFilter): boolean {
  return filter.genres === null && filter.decades === null;
}

/** Drop unknown entries, and collapse a full selection to "no restriction". */
export function normalizeFilter(input: {
  genres?: readonly string[] | null;
  decades?: readonly number[] | null;
}): CatalogFilter {
  const genres = input.genres
    ? [...new Set(input.genres.filter(isGenreFamilyId))].sort()
    : null;
  const decades = input.decades
    ? [...new Set(input.decades.filter(isDecade))].sort((a, b) => a - b)
    : null;
  return {
    genres: !genres || genres.length === 0 || genres.length === GENRE_FAMILIES.length
      ? null
      : genres,
    decades: !decades || decades.length === 0 || decades.length === DECADES.length
      ? null
      : decades,
  };
}

export interface FilterableSong {
  year: number | null;
  genre: string | null;
}

/** Whether a song may be served under this filter. */
export function matchesFilter(song: FilterableSong, filter: CatalogFilter): boolean {
  if (filter.genres) {
    const family = genreFamily(song.genre);
    if (!family || !filter.genres.includes(family)) return false;
  }
  if (filter.decades) {
    const decade = decadeOf(song.year);
    if (decade === null || !filter.decades.includes(decade)) return false;
  }
  return true;
}

/**
 * Stable identity for a filter, used to key the per-tier candidate pools.
 * Empty for an unfiltered draw, so unfiltered play keeps sharing one pool.
 */
export function filterKey(filter: CatalogFilter): string {
  if (isUnfiltered(filter)) return "";
  return `g:${filter.genres?.join(",") ?? "*"}|d:${filter.decades?.join(",") ?? "*"}`;
}

/** Serialize onto a request URL. Omits an axis that carries no restriction. */
export function filterToParams(filter: CatalogFilter, params: URLSearchParams): void {
  if (filter.genres) params.set("genres", filter.genres.join(","));
  if (filter.decades) params.set("decades", filter.decades.join(","));
}

/** Read a filter off a request URL. Unparsable input reads as unrestricted. */
export function filterFromParams(params: URLSearchParams): CatalogFilter {
  const genres = params.get("genres");
  const decades = params.get("decades");
  return normalizeFilter({
    genres: genres === null ? null : genres.split(",").filter(Boolean),
    decades:
      decades === null
        ? null
        : decades
            .split(",")
            .map((d) => Number.parseInt(d, 10))
            .filter(Number.isFinite),
  });
}

/** Human-readable summary for an error the player has to act on. */
export function describeFilter(filter: CatalogFilter): string {
  const parts: string[] = [];
  if (filter.genres) {
    parts.push(filter.genres.map(genreFamilyLabel).join(", "));
  }
  if (filter.decades) {
    parts.push(filter.decades.map((d) => `${d}s`).join(", "));
  }
  return parts.join(" · ");
}

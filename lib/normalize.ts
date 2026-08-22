/**
 * Title/artist normalization so that guesses match across releases:
 * "HUMBLE." ≡ "Humble", "Africa - Single Version" ≡ "Africa (Remastered 2011)",
 * "Beyoncé" ≡ "Beyonce", etc.
 */

const NOISE_KEYWORDS = [
  "feat",
  "featuring",
  "ft.",
  "remaster",
  "remastered",
  "version",
  "edit",
  "mix",
  "mono",
  "stereo",
  "live",
  "bonus",
  "deluxe",
  "single",
  "radio",
  "explicit",
  "anniversary",
  "re-record",
  "rerecord",
  "taylor's",
  "soundtrack",
  "from the",
  "original motion picture",
];

const NOISE_RE = new RegExp(
  "\\b(?:" +
    NOISE_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") +
    ")\\b",
  "i"
);

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/** Remove bracketed segments — "(feat. X)", "[Remastered 2011]" — that contain noise keywords. */
function stripNoisyBrackets(value: string): string {
  return value.replace(/[([][^)\]]*[)\]]/g, (segment) =>
    NOISE_RE.test(segment) ? " " : segment
  );
}

/** Remove trailing " - ..." suffixes ("- Remastered 2011", "- Radio Edit") that contain noise keywords. */
function stripNoisySuffixes(value: string): string {
  let out = value;
  for (;;) {
    const next = out.replace(/\s+-\s+[^-]*$/u, (segment) =>
      NOISE_RE.test(segment) ? "" : segment
    );
    if (next === out) return out;
    out = next;
  }
}

export function normalizeTitle(title: string): string {
  let out = stripDiacritics(title.toLowerCase());
  out = stripNoisyBrackets(out);
  out = stripNoisySuffixes(out);
  // Loose "feat. X" without brackets at the end of the title.
  out = out.replace(/\s+(?:feat\.?|featuring|ft\.?)\s+.*$/i, "");
  // Apostrophes vanish ("don't" ≡ "dont") instead of splitting words.
  out = out.replace(/['’ʼ]/g, "");
  out = out.replace(/[^\p{L}\p{N}]+/gu, " ");
  return out.trim().replace(/\s+/g, " ");
}

export function normalizeArtist(artist: string): string {
  let out = stripDiacritics(artist.toLowerCase());
  out = out.replace(/['’ʼ]/g, "");
  out = out.replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  return out.replace(/^the\s+/, "");
}

export function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  return na.length > 0 && na === nb;
}

/** True when the two artist lists share at least one performer. */
export function artistsMatch(a: string[], b: string[]): boolean {
  const setA = new Set(a.map(normalizeArtist).filter(Boolean));
  return b.map(normalizeArtist).some((artist) => artist && setA.has(artist));
}

/**
 * Canonical site identity — the single source of truth for anything that has
 * to agree across <head> metadata, the sitemap, the manifest, the OG card and
 * the JSON-LD block. Duplicating a description between those is how they
 * silently drift apart.
 */

/**
 * Absolute origin, no trailing slash. Vercel injects VERCEL_PROJECT_PRODUCTION_URL
 * for every deploy, but it points at the .vercel.app host even once a custom
 * domain is attached — so an explicit NEXT_PUBLIC_SITE_URL wins. Canonical URLs
 * must name one host, or search engines split ranking signals across both.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://timetoguess.vercel.app")
).replace(/\/$/, "");

export const SITE_NAME = "TimeToGuess";

export const SITE_TAGLINE = "Name the song from a fraction of a second";

/**
 * ~155 characters: past that Google truncates the snippet mid-sentence. Leads
 * with the words people actually type ("song guessing game"), not the brand.
 */
export const SITE_DESCRIPTION =
  "A free song guessing game. Hear a clip just a tenth of a second long, then name the track. Every wrong guess buys you more audio. No sign-up, no subscription.";

export const OG_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;

/** Brand colours, mirrored from globals.css so the OG card cannot drift. */
export const BRAND = {
  bg: "#2a0e10",
  surface: "#3a1517",
  line: "#5a2220",
  ink: "#f6ecd8",
  dim: "#c9a99a",
  accent: "#f5c542",
} as const;

/**
 * The questions this game is actually asked, answered honestly. Rendered as
 * visible copy *and* as FAQPage JSON-LD from one array — Google penalises
 * structured data that describes content a visitor cannot see.
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "Is TimeToGuess free to play?",
    a: "Yes. It is completely free, there is nothing to install, and you do not need an account. Just open the page and press play.",
  },
  {
    q: "Do I need an Apple Music or Spotify subscription?",
    a: "No. The game plays the 30-second preview clips that Apple Music publishes for essentially every song, so no subscription or login is required to listen.",
  },
  {
    q: "How is this different from Heardle?",
    a: "Heardle was one daily song for everybody, starting from a one-second clip. TimeToGuess gives you unlimited rounds instead of a single daily puzzle, starts far shorter — a tenth of a second, or a hundredth if you enable it — and sorts songs into five difficulty tiers you climb by winning.",
  },
  {
    q: "How long is the first clip?",
    a: "A tenth of a second by default. Each wrong guess or skip unlocks a longer one: 0.1s, then 0.5s, 2s, 8s and finally 15s. A 0.01-second stage can be switched on in settings if you want it to be genuinely absurd.",
  },
  {
    q: "Is there a new song every day?",
    a: "There is no single daily song. Every round picks a fresh track at random from your current difficulty tier, so you can keep playing for as long as you like.",
  },
  {
    q: "Where do the songs come from?",
    a: "The catalogue is Apple Music's. Difficulty is ranked by global Last.fm listener counts across every decade from the 1950s onward, so the easy tiers are songs that were huge in any era — not just what is charting this week.",
  },
  {
    q: "Can I get a hint?",
    a: "Yes. Each round offers a ladder of hints — the decade, the genre, the album art, then the first letter of the title. A hint costs you a win pip toward your next promotion, but it can never demote you.",
  },
];

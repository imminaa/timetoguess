/**
 * Inspect how "popular" is being defined: which canon sources resolved, what
 * the Last.fm listener distribution looks like, and which songs each tier band
 * ends up drawing from.
 *   npm run check-popularity          # default sample
 *   npm run check-popularity -- 450   # score more of the canon
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { hasAppleCreds } from "@/lib/apple";
import { canonBreakdown, canonSongs } from "@/lib/canon";
import { hasLastfmCreds } from "@/lib/lastfm";
import { BANDS, popularitySnapshot, type ScoredSong } from "@/lib/popularity";

function decade(year: number | null): string {
  return year ? `${Math.floor(year / 10) * 10}s` : "????";
}

function line(s: ScoredSong): string {
  const listeners = s.listeners.toLocaleString("en-US").padStart(9);
  return `${listeners}  ${decade(s.song.year)}  ${s.song.title} — ${s.song.artists[0]}`;
}

async function main() {
  if (!hasAppleCreds()) {
    console.error("Missing Apple credentials — fill in .env.local first (see README).");
    process.exit(1);
  }

  console.log("=== Canon sources ===");
  const sources = await canonBreakdown();
  for (const s of sources) {
    const status = s.problem ? `FAILED — ${s.problem}` : `${s.songs.length} tracks`;
    console.log(`  ${s.label.padEnd(46)} ${status}`);
  }
  const all = await canonSongs();
  const byDecade = new Map<string, number>();
  for (const song of all) {
    const d = decade(song.year);
    byDecade.set(d, (byDecade.get(d) ?? 0) + 1);
  }
  console.log(`\n  ${all.length} distinct songs`);
  console.log(
    "  by decade: " +
      [...byDecade.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([d, n]) => `${d}:${n}`)
        .join("  ")
  );

  if (!hasLastfmCreds()) {
    console.error(
      "\nMissing LASTFM_API_KEY — canon membership is verified above, but the " +
        "popularity ranking cannot run.\nGet a free key at https://www.last.fm/api/account/create"
    );
    process.exit(1);
  }

  const want = Number(process.argv[2]) || undefined;
  console.log("\n=== Last.fm ranking ===");
  const scored = await popularitySnapshot(want);
  console.log(`  scored ${scored.length} of ${all.length} canon songs`);

  const at = (q: number) => scored[Math.min(scored.length - 1, Math.floor(scored.length * q))];
  for (const q of [0, 0.2, 0.5, 0.8, 0.99]) {
    console.log(`  p${String(Math.round(q * 100)).padStart(2)} listeners: ${at(q).listeners.toLocaleString("en-US")}`);
  }

  for (const [tier, band] of Object.entries(BANDS)) {
    const from = Math.floor(scored.length * band[0]);
    const to = Math.max(from + 1, Math.ceil(scored.length * band[1]));
    const slice = scored.slice(from, to);
    const eras = new Map<string, number>();
    for (const s of slice) eras.set(decade(s.song.year), (eras.get(decade(s.song.year)) ?? 0) + 1);
    console.log(`\n--- ${tier}  (${slice.length} songs, band ${band[0]}–${band[1]}) ---`);
    console.log(
      "  eras: " +
        [...eras.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, n]) => `${d}:${n}`).join("  ")
    );
    for (const s of slice.slice(0, 10)) console.log(`  ${line(s)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

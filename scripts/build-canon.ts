/**
 * Build the scored canon snapshot that the game serves from.
 *
 *   npm run build-canon              # full rebuild, ~20 minutes
 *   npm run build-canon -- --rescore # re-rank the existing snapshot, instantly
 *
 * Pulls every canon source including the per-artist Essentials playlists,
 * scores all of it against Last.fm, and writes data/canon.json. Takes a while
 * and a few thousand rate-limited API calls, which is exactly why it does not
 * happen on a request path — see lib/canon-snapshot.ts.
 *
 * `--rescore` exists because the snapshot stores each song's raw measurement
 * alongside its score, so changing the *ranking* never requires re-fetching
 * anything.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { hasAppleCreds } from "@/lib/apple";
import { benchmarkIndex, WIDELY_KNOWN } from "@/lib/canon-benchmark";
import { canonBreakdown, canonEntries } from "@/lib/canon";
import { loadSnapshot, writeSnapshot, type ScoredSong } from "@/lib/canon-snapshot";
import { hasLastfmCreds } from "@/lib/lastfm";
import { rankMeasurements, scoreCanon, TIER_BANDS, TIER_FLOORS } from "@/lib/popularity";

function decade(year: number | null): string {
  return year ? `${Math.floor(year / 10) * 10}s` : "????";
}

function tally<T>(items: readonly T[], key: (item: T) => string): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}:${n}`)
    .join("  ");
}

/** Re-rank the stored measurements in place, with no network at all. */
function rescore(): void {
  const snapshot = loadSnapshot();
  if (!snapshot) {
    console.error("No data/canon.json to rescore — run a full build first.");
    process.exit(1);
  }
  const songs = rankMeasurements(
    snapshot.songs.map((s: ScoredSong) => ({
      song: s.song,
      listeners: s.listeners,
      plays: s.plays,
      cohort: s.cohort,
      sources: s.sources,
      artistRank: s.artistRank,
    }))
  );
  writeSnapshot({ ...snapshot, songs });
  console.log(`Rescored ${songs.length} songs from the existing snapshot.`);
  report(songs);
}

function report(songs: ScoredSong[]): void {
  const median =
    [...songs].map((s) => s.listeners).sort((a, b) => a - b)[Math.floor(songs.length / 2)] || 1;
  console.log(`  median listeners: ${median.toLocaleString("en-US")}`);
  for (const [tier, band] of Object.entries(TIER_BANDS)) {
    const floor = TIER_FLOORS[tier as keyof typeof TIER_FLOORS] * median;
    const slice = songs
      .slice(Math.floor(songs.length * band[0]), Math.ceil(songs.length * band[1]))
      .filter((s) => s.listeners >= floor);
    const eras = new Map<string, number>();
    for (const s of slice) eras.set(decade(s.song.year), (eras.get(decade(s.song.year)) ?? 0) + 1);
    const biggest = Math.max(...eras.values(), 0);
    console.log(
      `  ${tier.padEnd(11)} ${String(slice.length).padStart(5)} songs ` +
        `(floor ${Math.round(floor).toLocaleString("en-US")}, ` +
        `largest decade ${Math.round((100 * biggest) / (slice.length || 1))}%)`
    );
  }
  const found = songs.filter((s) => benchmarkIndex(s.song) >= 0);
  console.log(
    `\n  benchmark: ${found.length}/${WIDELY_KNOWN.length} widely-known songs present in the canon`
  );
}

async function main() {
  if (process.argv.includes("--rescore")) {
    rescore();
    return;
  }
  if (!hasAppleCreds()) {
    console.error("Missing Apple credentials — fill in .env.local first (see README).");
    process.exit(1);
  }
  if (!hasLastfmCreds()) {
    console.error("Missing LASTFM_API_KEY — the canon cannot be ranked without it.");
    process.exit(1);
  }

  const started = Date.now();
  const sources = await canonBreakdown({ deep: true, onProgress: (m) => console.log(`  ${m}`) });
  const failed = sources.filter((s) => s.problem && s.songs.length === 0);
  const entries = await canonEntries({ deep: true });
  console.log(
    `\n${sources.length - failed.length} sources resolved (${failed.length} skipped), ` +
      `${entries.length} distinct songs`
  );
  console.log(`  by decade: ${tally(entries, (e) => decade(e.song.year))}`);
  console.log(`  multi-source songs: ${entries.filter((e) => e.sources > 1).length}`);

  console.log("\nScoring against Last.fm (one request per artist)…");
  let lastLogged = 0;
  const scored = await scoreCanon(entries, (done, total) => {
    if (done - lastLogged >= 500 || done === total) {
      lastLogged = done;
      process.stdout.write(`\r  ${done}/${total} measured`);
    }
  });
  const songs = scored.songs;
  process.stdout.write("\n");
  if (scored.failed > 0) {
    console.error(
      `\n  WARNING: ${scored.failed} songs lost to API failures, not obscurity ` +
        `(first: ${scored.firstError}).\n  The snapshot is incomplete — rerun the build.`
    );
  }

  writeSnapshot({
    builtAt: new Date().toISOString(),
    storefront: process.env.APPLE_STOREFRONT || "us",
    songs,
  });

  console.log(
    `\nWrote data/canon.json — ${songs.length} scored songs ` +
      `(${scored.missing} not on Last.fm, ${scored.failed} lost to API errors) ` +
      `in ${Math.round((Date.now() - started) / 1000)}s`
  );

  report(songs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

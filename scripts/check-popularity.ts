/**
 * Inspect how "popular" is being defined: which canon sources resolved, what
 * the listener distribution looks like, which songs each tier draws from, and
 * whether the songs everybody knows actually landed in the easy tier.
 *   npm run check-popularity          # uses data/canon.json when present
 *   npm run check-popularity -- live  # ignore the snapshot, score a sample
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { hasAppleCreds } from "@/lib/apple";
import { benchmarkIndex, WIDELY_KNOWN } from "@/lib/canon-benchmark";
import { canonBreakdown, canonEntries } from "@/lib/canon";
import { loadSnapshot, snapshotAge, type ScoredSong } from "@/lib/canon-snapshot";
import { hasLastfmCreds } from "@/lib/lastfm";
import {
  listenerFloor,
  popularitySnapshot,
  TIER_BANDS,
  tierSongs,
} from "@/lib/popularity";

function decade(year: number | null): string {
  return year ? `${Math.floor(year / 10) * 10}s` : "????";
}

function line(s: ScoredSong): string {
  const listeners = s.listeners.toLocaleString("en-US").padStart(9);
  return (
    `${s.score.toFixed(2).padStart(5)}x  ${listeners}  ${decade(s.song.year)}  ` +
    `${s.song.title} — ${s.song.primaryArtist}`
  );
}

function tally<T>(items: readonly T[], key: (item: T) => string): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}:${n}`)
    .join("  ");
}

async function main() {
  if (!hasAppleCreds()) {
    console.error("Missing Apple credentials — fill in .env.local first (see README).");
    process.exit(1);
  }
  if (!hasLastfmCreds()) {
    console.error("Missing LASTFM_API_KEY — the popularity ranking cannot run.");
    process.exit(1);
  }

  const snapshot = loadSnapshot();
  if (snapshot) {
    const age = snapshotAge(snapshot);
    console.log(
      `=== Snapshot ===\n  data/canon.json — ${snapshot.songs.length} scored songs, ` +
        `storefront ${snapshot.storefront}` +
        (age ? `, built ${age.days}d ago${age.stale ? " (STALE — run npm run build-canon)" : ""}` : "")
    );
  } else {
    console.log("=== Snapshot ===\n  none — scoring a live sample (run npm run build-canon)");
    console.log("\n=== Canon sources ===");
    const sources = await canonBreakdown();
    for (const s of sources) {
      console.log(`  ${s.label.padEnd(46)} ${s.problem ? `FAILED — ${s.problem}` : `${s.songs.length} tracks`}`);
    }
    const entries = await canonEntries();
    console.log(`\n  ${entries.length} distinct songs`);
    console.log(`  by decade: ${tally(entries, (e) => decade(e.song.year))}`);
  }

  console.log("\n=== Ranking ===");
  const scored = await popularitySnapshot();
  console.log(`  ${scored.length} scored songs`);
  console.log(`  by decade: ${tally(scored, (s) => decade(s.song.year))}`);
  const at = (q: number) => scored[Math.min(scored.length - 1, Math.floor(scored.length * q))];
  for (const q of [0, 0.1, 0.35, 0.7, 0.99]) {
    const s = at(q);
    console.log(
      `  p${String(Math.round(q * 100)).padStart(2)}  score ${s.score.toFixed(2).padStart(6)}  ` +
        `(${s.listeners.toLocaleString("en-US")} listeners, ${s.cohort}s, ${s.sources} sources)`
    );
  }

  for (const tier of Object.keys(TIER_BANDS) as (keyof typeof TIER_BANDS)[]) {
    const songs = await tierSongs(tier);
    const floor = await listenerFloor(tier);
    console.log(
      `\n--- ${tier}  (${songs.length} songs, band ${TIER_BANDS[tier][0]}–${TIER_BANDS[tier][1]}, ` +
        `floor ${Math.round(floor).toLocaleString("en-US")}) ---`
    );
    console.log(`  eras: ${tally(songs, (s) => decade(s.song.year))}`);
    for (const s of songs.slice(0, 10)) console.log(`  ${line(s)}`);
  }

  // The gate that matters: do the songs everybody knows land in easy?
  console.log("\n=== Widely-known benchmark ===");
  const easy = new Set((await tierSongs("easy")).map((s) => s.song.id));
  const medium = new Set((await tierSongs("medium")).map((s) => s.song.id));
  const placed = WIDELY_KNOWN.map((entry) => {
    const hit = scored.find((s) => benchmarkIndex(s.song) === WIDELY_KNOWN.indexOf(entry));
    if (!hit) return { entry, where: "absent from canon" };
    if (easy.has(hit.song.id)) return { entry, where: "easy", hit };
    if (medium.has(hit.song.id)) return { entry, where: "medium", hit };
    return { entry, where: "below medium", hit };
  });
  for (const group of ["easy", "medium", "below medium", "absent from canon"]) {
    const rows = placed.filter((p) => p.where === group);
    console.log(`  ${group.padEnd(18)} ${rows.length}/${WIDELY_KNOWN.length}`);
    if (group !== "easy") {
      for (const r of rows) console.log(`      ${r.entry.title} — ${r.entry.artist}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

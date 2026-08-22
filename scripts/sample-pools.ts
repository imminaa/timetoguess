/**
 * Eyeball what each difficulty tier actually serves:
 *   npm run sample-pools            # all tiers
 *   npm run sample-pools -- hard    # one tier
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { hasAppleCreds } from "@/lib/apple";
import { DIFFICULTIES, isDifficulty } from "@/lib/game-config";
import { sampleCandidates } from "@/lib/pool";

async function main() {
  if (!hasAppleCreds()) {
    console.error("Missing Apple credentials — fill in .env.local first (see README).");
    process.exit(1);
  }
  const arg = process.argv[2];
  const tiers = arg && isDifficulty(arg) ? [arg] : DIFFICULTIES.map((d) => d.id);

  for (const tier of tiers) {
    const meta = DIFFICULTIES.find((d) => d.id === tier)!;
    console.log(`\n=== ${meta.label} — ${meta.tagline} ===`);
    const tracks = await sampleCandidates(tier, 12);
    if (tracks.length === 0) {
      console.log("  (no candidates found — check credentials or rate limits)");
      continue;
    }
    for (const t of tracks) {
      console.log(
        `  ${t.title} — ${t.artists.join(", ")} (${t.year ?? "?"}, ${t.genre ?? "?"})`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

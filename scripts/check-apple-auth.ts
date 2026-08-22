/**
 * Diagnose Apple Music API auth: mints the developer token from .env.local,
 * prints its (redacted) claims, and calls the catalog directly.
 *   npm run check-apple
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { developerToken } from "@/lib/apple";

async function main() {
  const token = await developerToken();
  const [h, p] = token
    .split(".")
    .slice(0, 2)
    .map((s) => JSON.parse(Buffer.from(s, "base64url").toString()));
  console.log("header:", JSON.stringify(h));
  console.log(
    `claims: iss=${String(p.iss).slice(0, 2)}****** iat=${p.iat} exp=${p.exp} (now=${Math.floor(Date.now() / 1000)})`
  );
  const res = await fetch("https://api.music.apple.com/v1/catalog/us/songs/203709340", {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("Apple API status:", res.status);
  const body = await res.text();
  console.log("body:", body.slice(0, 300) || "(empty)");
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});

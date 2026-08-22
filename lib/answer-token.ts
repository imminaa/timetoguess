import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Round answers travel to the client as an opaque AES-256-GCM blob so the API
 * stays stateless without ever exposing the song in devtools.
 *
 * ANSWER_SECRET is optional: without it a random per-process secret is used,
 * which only matters if rounds must survive a server restart or span multiple
 * instances.
 */

export interface RoundAnswer {
  trackId: string;
  title: string;
  artists: string[];
  artUrl: string | null;
  previewUrl: string;
  year: number | null;
  genre: string | null;
}

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) {
    const secret = process.env.ANSWER_SECRET ?? randomBytes(32).toString("hex");
    cachedKey = createHash("sha256").update(secret).digest();
  }
  return cachedKey;
}

export function encryptAnswer(answer: RoundAnswer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(answer), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptAnswer(token: string): RoundAnswer | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(json.toString("utf8")) as RoundAnswer;
  } catch {
    return null;
  }
}

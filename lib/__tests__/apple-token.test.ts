import { generateKeyPairSync } from "node:crypto";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Verifies our MusicKit developer-token minting against a locally generated
 * ES256 key — the same key type Apple issues as .p8 files.
 */

function freshKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("Apple developer token", () => {
  beforeEach(() => {
    process.env.APPLE_TEAM_ID = "TEAMID1234";
    process.env.APPLE_KEY_ID = "KEYID56789";
    process.env.APPLE_PRIVATE_KEY = freshKeyPem();
    delete process.env.APPLE_PRIVATE_KEY_PATH;
  });

  it("mints a valid ES256 JWT with Apple's required claims", async () => {
    // Fresh module state so the token cache from other tests doesn't leak in.
    const { developerToken } = await import("@/lib/apple");
    const token = await developerToken();

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("KEYID56789");

    const claims = decodeJwt(token);
    expect(claims.iss).toBe("TEAMID1234");
    expect(claims.iat).toBeTypeOf("number");
    expect(claims.exp).toBeTypeOf("number");
    // Apple rejects tokens with a lifetime over ~6 months; ours is 12h.
    expect(claims.exp! - claims.iat!).toBeLessThanOrEqual(15_777_000);
    expect(claims.exp! - claims.iat!).toBeGreaterThan(0);
  });
});

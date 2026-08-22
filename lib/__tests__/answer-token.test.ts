import { describe, expect, it } from "vitest";
import { decryptAnswer, encryptAnswer, type RoundAnswer } from "@/lib/answer-token";

const answer: RoundAnswer = {
  trackId: "1558533900",
  title: "Never Gonna Give You Up",
  artists: ["Rick Astley"],
  artUrl: "https://is1-ssl.mzstatic.com/image/thumb/abc/300x300bb.jpg",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  year: 1987,
  genre: "Pop",
};

describe("answer token", () => {
  it("round-trips an answer", () => {
    const token = encryptAnswer(answer);
    expect(decryptAnswer(token)).toEqual(answer);
  });

  it("produces an opaque token (no plaintext leakage)", () => {
    const token = encryptAnswer(answer);
    expect(token).not.toContain("Rick");
    expect(token).not.toContain("Never");
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("Rick");
  });

  it("rejects tampered tokens", () => {
    const token = encryptAnswer(answer);
    const tampered = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(decryptAnswer(tampered)).toBeNull();
    expect(decryptAnswer("garbage")).toBeNull();
    expect(decryptAnswer("")).toBeNull();
  });
});

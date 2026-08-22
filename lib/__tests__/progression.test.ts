import { describe, expect, it } from "vitest";
import { applyResult, initialProgress, jumpTo, type Progress } from "@/lib/progression";

describe("progression ladder", () => {
  it("starts at easy", () => {
    expect(initialProgress()).toEqual({ tier: "easy", wins: 0, losses: 0 });
  });

  it("promotes after 2 wins", () => {
    const afterOne = applyResult(initialProgress(), true);
    expect(afterOne.progress).toEqual({ tier: "easy", wins: 1, losses: 0 });
    expect(afterOne.promoted).toBe(false);

    const afterTwo = applyResult(afterOne.progress, true);
    expect(afterTwo.progress.tier).toBe("medium");
    expect(afterTwo.promoted).toBe(true);
    expect(afterTwo.progress.wins).toBe(0);
  });

  it("demotes after 2 losses", () => {
    const atHard: Progress = { tier: "hard", wins: 1, losses: 0 };
    const afterOne = applyResult(atHard, false);
    expect(afterOne.progress).toEqual({ tier: "hard", wins: 0, losses: 1 });
    expect(afterOne.demoted).toBe(false);

    const afterTwo = applyResult(afterOne.progress, false);
    expect(afterTwo.progress.tier).toBe("medium");
    expect(afterTwo.demoted).toBe(true);
  });

  it("a win resets the loss counter and vice versa", () => {
    const oneLoss = applyResult(initialProgress(), false).progress;
    expect(oneLoss.losses).toBe(1);
    const thenWin = applyResult(oneLoss, true).progress;
    expect(thenWin.losses).toBe(0);
    expect(thenWin.wins).toBe(1);
  });

  it("never demotes below easy or promotes past impossible", () => {
    const bottom = applyResult(applyResult(initialProgress(), false).progress, false);
    expect(bottom.progress.tier).toBe("easy");
    expect(bottom.demoted).toBe(false);

    const top: Progress = { tier: "impossible", wins: 1, losses: 0 };
    const stillTop = applyResult(top, true);
    expect(stillTop.progress.tier).toBe("impossible");
    expect(stillTop.promoted).toBe(false);
  });

  it("manual jump resets counters", () => {
    expect(jumpTo("expert")).toEqual({ tier: "expert", wins: 0, losses: 0 });
  });
});

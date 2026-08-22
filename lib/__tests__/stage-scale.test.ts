import { describe, expect, it } from "vitest";
import { axisPos, segmentWidths, stageBoundaries } from "@/lib/stage-scale";
import { STAGES } from "@/lib/game-config";

const DEFAULT_STAGES = [0.1, 0.5, 2, 8, 15];
const ALL_COMBOS = [DEFAULT_STAGES, [...STAGES], [0.5, 2, 15], [8]];

describe("segmentWidths", () => {
  it("sums to 1 for every enabled-stage combination", () => {
    for (const stages of ALL_COMBOS) {
      expect(segmentWidths(stages).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it("keeps every segment readable — no stage collapses to a sliver", () => {
    // 6% of a 480px bar is ~29px: still legible and still tappable.
    for (const stages of [DEFAULT_STAGES, [...STAGES]]) {
      for (const w of segmentWidths(stages)) expect(w).toBeGreaterThan(0.06);
    }
  });

  it("still gives the big jumps the widest segments", () => {
    const widths = segmentWidths(DEFAULT_STAGES);
    expect(widths[3]).toBeGreaterThan(widths[0]); // 2→8s wider than 0→0.1s
  });

  it("degenerates gracefully", () => {
    expect(segmentWidths([15])).toEqual([1]);
    expect(segmentWidths([])).toEqual([]);
  });
});

describe("axisPos", () => {
  it("anchors both ends of the axis", () => {
    expect(axisPos(0, DEFAULT_STAGES)).toBe(0);
    expect(axisPos(15, DEFAULT_STAGES)).toBeCloseTo(1, 10);
  });

  it("lands exactly on the tick each stage is labelled with", () => {
    // The whole point of one shared axis: playhead, ticks and labels agree.
    for (const stages of ALL_COMBOS) {
      const bounds = stageBoundaries(stages);
      stages.forEach((seconds, i) => {
        expect(axisPos(seconds, stages)).toBeCloseTo(bounds[i], 10);
      });
    }
  });

  it("is monotonic as the clip plays", () => {
    let prev = -1;
    for (let t = 0; t <= 15; t += 0.05) {
      const pos = axisPos(t, DEFAULT_STAGES);
      expect(pos).toBeGreaterThanOrEqual(prev);
      prev = pos;
    }
  });

  it("clamps out-of-range input (the reveal plays past the last stage)", () => {
    expect(axisPos(-5, DEFAULT_STAGES)).toBe(0);
    expect(axisPos(30, DEFAULT_STAGES)).toBeCloseTo(1, 10);
  });

  it("lifts short stages off the floor a linear axis would leave them on", () => {
    // Linearly 0.1s is 0.7% of the bar — a sub-pixel hairline.
    expect(axisPos(0.1, DEFAULT_STAGES) / (0.1 / 15)).toBeGreaterThan(5);
  });

  it("interpolates linearly within a segment", () => {
    const [w0] = segmentWidths(DEFAULT_STAGES);
    expect(axisPos(0.05, DEFAULT_STAGES)).toBeCloseTo(w0 / 2, 10);
  });
});

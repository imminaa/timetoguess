/**
 * Layout scale for the stage bar.
 *
 * Stage lengths span three orders of magnitude (0.01s → 15s), so a linear
 * axis draws the early stages as invisible hairlines — and the early stages
 * are where most rounds are actually decided. A pure log axis fixes that but
 * flattens the 2→8→15 jumps until every step looks the same size. We blend
 * the two: log for the shape, a dash of uniform width so no stage ever
 * collapses below a readable (and tappable) sliver.
 *
 * `segmentWidths` defines the axis; `axisPos` interpolates inside it. Keeping
 * one source of truth is what lets the playhead, the tick marks and the labels
 * all land on the same pixel.
 */

/** Softening constant for the log axis — smaller spreads the bottom end wider. */
const LOG_SHIFT = 0.3;
/** How much uniform width to blend in. 0 = pure log, 1 = equal segments. */
const EQUAL_MIX = 0.4;

function logPos(seconds: number, max: number): number {
  return Math.log1p(seconds / LOG_SHIFT) / Math.log1p(max / LOG_SHIFT);
}

/**
 * Width of each stage's segment as a fraction of the bar. Sums to 1: both the
 * log deltas and the uniform term do, so the blend does too.
 */
export function segmentWidths(stages: readonly number[]): number[] {
  if (stages.length === 0) return [];
  const max = stages[stages.length - 1];
  if (max <= 0) return stages.map(() => 1 / stages.length);
  const equal = 1 / stages.length;
  let prev = 0;
  return stages.map((seconds) => {
    const pos = logPos(seconds, max);
    const raw = pos - prev;
    prev = pos;
    return EQUAL_MIX * equal + (1 - EQUAL_MIX) * raw;
  });
}

/** Axis position of each stage's right edge, ascending, ending at 1. */
export function stageBoundaries(stages: readonly number[]): number[] {
  let sum = 0;
  return segmentWidths(stages).map((w) => (sum += w));
}

/**
 * Position of `seconds` on the axis, as a 0..1 fraction of the bar. Linear
 * inside a segment, so the playhead sweeps at a steady rate between ticks and
 * still crosses each tick at the exact second that tick is labelled with.
 */
export function axisPos(seconds: number, stages: readonly number[]): number {
  if (stages.length === 0) return 0;
  const widths = segmentWidths(stages);
  const max = stages[stages.length - 1];
  const clamped = Math.min(Math.max(seconds, 0), max);
  let from = 0;
  let base = 0;
  for (let i = 0; i < stages.length; i++) {
    const to = stages[i];
    if (clamped <= to || i === stages.length - 1) {
      const span = to - from;
      return base + (span > 0 ? (clamped - from) / span : 1) * widths[i];
    }
    from = to;
    base += widths[i];
  }
  return 1;
}

"use client";
import StageBar from "@/components/StageBar";

const STAGES = [0.1, 0.5, 2, 8, 15];
const ALL = [0.01, 0.1, 0.5, 2, 8, 15];

export default function BarPreview() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8 px-6 py-12">
      {STAGES.map((s, i) => (
        <div key={s}>
          <p className="mb-2 text-xs text-dim">stage {i} — {s}s unlocked, idle</p>
          <StageBar stages={STAGES} currentIndex={i} elapsedSeconds={null} />
        </div>
      ))}
      <div>
        <p className="mb-2 text-xs text-dim">stage 3 (8s), playhead at 3.5s</p>
        <StageBar stages={STAGES} currentIndex={3} elapsedSeconds={3.5} />
      </div>
      <div>
        <p className="mb-2 text-xs text-dim">stage 4 (15s), playhead at 11s</p>
        <StageBar stages={STAGES} currentIndex={4} elapsedSeconds={11} />
      </div>
      <div>
        <p className="mb-2 text-xs text-dim">all 6 stages enabled, stage 2</p>
        <StageBar stages={ALL} currentIndex={2} elapsedSeconds={0.3} />
      </div>
    </div>
  );
}

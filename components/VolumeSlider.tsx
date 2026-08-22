"use client";

import { SpeakerHigh, SpeakerLow, SpeakerX } from "@phosphor-icons/react";

interface Props {
  volume: number;
  onChange: (v: number) => void;
}

export default function VolumeSlider({ volume, onChange }: Props) {
  const Icon = volume === 0 ? SpeakerX : volume < 0.5 ? SpeakerLow : SpeakerHigh;
  return (
    <label className="flex items-center gap-2 text-faint">
      <Icon size={16} aria-hidden />
      <input
        type="range"
        className="volume h-7 w-24 cursor-pointer"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        aria-label="Volume"
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
    </label>
  );
}

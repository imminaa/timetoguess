import type { Difficulty } from "@/lib/game-config";

/**
 * Static Tailwind class maps per difficulty (dynamic class names would be
 * purged, so every string here must appear verbatim).
 */

export interface TierStyle {
  text: string;
  dot: string;
  chip: string;
  cardHover: string;
}

export const TIER_STYLES: Record<Difficulty, TierStyle> = {
  easy: {
    text: "text-tier-easy",
    dot: "bg-tier-easy",
    chip: "border-tier-easy/30 bg-tier-easy/10 text-tier-easy",
    cardHover: "hover:border-tier-easy/50 focus-visible:border-tier-easy/50",
  },
  medium: {
    text: "text-tier-medium",
    dot: "bg-tier-medium",
    chip: "border-tier-medium/30 bg-tier-medium/10 text-tier-medium",
    cardHover: "hover:border-tier-medium/50 focus-visible:border-tier-medium/50",
  },
  hard: {
    text: "text-tier-hard",
    dot: "bg-tier-hard",
    chip: "border-tier-hard/30 bg-tier-hard/10 text-tier-hard",
    cardHover: "hover:border-tier-hard/50 focus-visible:border-tier-hard/50",
  },
  expert: {
    text: "text-tier-expert",
    dot: "bg-tier-expert",
    chip: "border-tier-expert/30 bg-tier-expert/10 text-tier-expert",
    cardHover: "hover:border-tier-expert/50 focus-visible:border-tier-expert/50",
  },
  impossible: {
    text: "text-tier-impossible",
    dot: "bg-tier-impossible",
    chip: "border-tier-impossible/30 bg-tier-impossible/10 text-tier-impossible",
    cardHover:
      "hover:border-tier-impossible/50 focus-visible:border-tier-impossible/50",
  },
};

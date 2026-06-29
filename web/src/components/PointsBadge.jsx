import { Chip } from "@heroui/react";
import { ptClass } from "@/lib/scoring.js";

// Points earned for a match, color-coded. Handles the regular 0–4 tiers plus joker
// outcomes (negative on a risk miss, 5/6/8 when a joker boosts a hit). Renders nothing
// until the match is scorable (tip + result both present).
export default function PointsBadge({ points }) {
  if (points === null || points === undefined) return null;
  return (
    <Chip
      size="sm"
      className={`inline-flex h-6 min-w-9 items-center justify-center rounded-md border-0 px-1.5 text-xs font-bold ${ptClass(points)}`}
    >
      {points} P
    </Chip>
  );
}

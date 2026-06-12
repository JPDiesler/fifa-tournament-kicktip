import { Chip } from "@heroui/react";
import { PT } from "../lib/scoring.js";

// Points earned for a match (3/2/1/0), color-coded. Renders nothing until the
// match is scorable (tip + result both present).
export default function PointsBadge({ points }) {
  if (points === null || points === undefined) return null;
  return (
    <Chip
      size="sm"
      className={`inline-flex h-6 min-w-9 items-center justify-center rounded-md border-0 px-1.5 text-xs font-bold ${PT[points]}`}
    >
      {points} P
    </Chip>
  );
}

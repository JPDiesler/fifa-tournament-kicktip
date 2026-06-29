import { Swords, Shield } from "lucide-react";

// Small badge for a tip's Joker — Zweischneidiges Schwert (risk) or Schutzschild (safe).
// Renders nothing without a joker (so it's safe to drop into any tip row).
const JOKER = {
  risk: { Icon: Swords, label: "Zweischneidiges Schwert", cls: "bg-amber-500/20 text-amber-500" },
  safe: { Icon: Shield, label: "Schutzschild", cls: "bg-sky-500/20 text-sky-400" },
};
export default function JokerBadge({ joker, className = "" }) {
  const j = JOKER[joker];
  if (!j) return null;
  const { Icon, label } = j;
  return (
    <span title={`Joker: ${label}`} className={`inline-flex size-4 shrink-0 items-center justify-center rounded ${j.cls} ${className}`}>
      <Icon size={11} />
    </span>
  );
}

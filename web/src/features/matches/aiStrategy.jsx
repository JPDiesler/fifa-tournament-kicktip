import { Rocket, Snowflake, Flame } from "lucide-react";

// The three v2 strategy modes an AI player can pick → label + icon + tint. Note: "Risiko"
// and "Aufholen" are the SAME model mode (variance_seeking) → one badge (flame); the
// rocket marks the neutral EV-maximising mode.
export const STRATEGY = {
  variance_averse: { label: "Sicher", title: "Sicher – Führung absichern", Icon: Snowflake, cls: "bg-sky-500/15 text-sky-400" },
  ev_neutral: { label: "Neutral", title: "Neutral – maximale Punkte-Erwartung", Icon: Rocket, cls: "bg-violet-500/15 text-violet-400" },
  variance_seeking: { label: "Risiko", title: "Risiko – aufholen, gegen das Feld tippen", Icon: Flame, cls: "bg-red-500/15 text-red-400" },
};

// Badge for an AI player's chosen strategy. Icon-only by default (compact, for tip lists);
// `withLabel` adds the German label (reasoning detail). Renders nothing for an absent /
// unknown strategy (e.g. older v1 predictions without the field).
export default function StrategyBadge({ strategy, withLabel = false, size = 12, className = "" }) {
  const s = STRATEGY[strategy];
  if (!s) return null;
  const { Icon } = s;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full ${withLabel ? "px-2" : "px-1"} py-0.5 text-[10px] font-semibold ${s.cls} ${className}`} title={s.title} aria-label={s.title}>
      <Icon size={size} />{withLabel && s.label}
    </span>
  );
}

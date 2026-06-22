import { Circle, X } from "lucide-react";

// Penalty-shootout indicators (lucide icons): ● green filled = scored · ✕ red = missed ·
// ○ faint outline = still to take. With `side` ("h"|"a") it renders ONE team's row (e.g. big,
// under that team's flag); without it, both rows stacked (home over away) for compact contexts.
// Per-kick data comes from `shootout` ({home:[{scored,player}],away:[…]}); falls back to the `pen`
// tally ({home,away}) showing only the scored (green) circles. Renders nothing when there's no shootout.
export default function PenaltyShootout({ shootout, pen, side = null, size = "md", className = "" }) {
  let home = shootout?.home, away = shootout?.away;
  if ((!home || !home.length) && (!away || !away.length)) {
    const ph = pen?.home != null ? Number(pen.home) || 0 : null;
    const pa = pen?.away != null ? Number(pen.away) || 0 : null;
    if (ph == null && pa == null) return null; // no shootout at all
    home = Array.from({ length: ph || 0 }, () => ({ scored: true }));
    away = Array.from({ length: pa || 0 }, () => ({ scored: true }));
  }
  home = home || []; away = away || [];
  const slots = Math.max(5, home.length, away.length); // 5 in regulation; grows in sudden death
  const px = size === "lg" ? 16 : size === "sm" ? 9 : 11;
  const gap = size === "lg" ? "gap-1.5" : "gap-0.5";
  const cell = (k, i) =>
    !k ? <Circle key={i} size={px} strokeWidth={2} className="shrink-0 opacity-40" aria-hidden />
      : k.scored ? <Circle key={i} size={px} strokeWidth={2} fill="currentColor" className="shrink-0 text-green-500"><title>{k.player || "Tor"}</title></Circle>
        : <X key={i} size={px} strokeWidth={3} className="shrink-0 text-red-500"><title>{k.player || "verschossen"}</title></X>;
  const row = (kicks) => <span className={`flex items-center justify-center ${gap}`}>{Array.from({ length: slots }, (_, i) => cell(kicks[i], i))}</span>;
  if (side) return <span className={`inline-flex text-muted ${className}`} role="img" aria-label="Elfmeterschießen">{row(side === "h" ? home : away)}</span>;
  const tally = `${home.filter((k) => k.scored).length}:${away.filter((k) => k.scored).length}`;
  return (
    <span className={`inline-flex flex-col gap-0.5 text-muted ${className}`} role="img" aria-label={`Elfmeterschießen ${tally}`}>
      {row(home)}{row(away)}
    </span>
  );
}

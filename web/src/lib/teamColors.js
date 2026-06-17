// Team colours from the api-football match kit (delivered with the lineups as
// team.colors = { player:{primary,number,border}, goalkeeper:{…} }). Used for the
// lineup dots and the home/away charts/bars. No flag-derived colours — when the kit
// isn't published yet, callers fall back to the neutral defaults below.
export const FALLBACK_HOME = "#22c55e"; // app-accent-ish green
export const FALLBACK_AWAY = "#64748b"; // slate grey

// Normalise an api-football colour ("RRGGBB" / "#RRGGBB" / "RGB") to "#rrggbb", else null.
export function hex(c) {
  const s = String(c || "").replace(/^#/, "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
  if (/^[0-9a-fA-F]{3}$/.test(s)) return `#${s.split("").map((x) => x + x).join("")}`;
  return null;
}

// Primary outfield kit colour for a team's lineup colours, or null.
export function kitColor(colors) {
  return hex(colors?.player?.primary);
}

// Readable text colour (near-black or white) for a given background hex.
export function textOn(h) {
  if (!h || h.length < 7) return "#fff";
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111827" : "#ffffff";
}

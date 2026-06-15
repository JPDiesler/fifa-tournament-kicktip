// Real interface icons for match events (replacing the old ⚽/🟨/🟥 emoji).
// Both use currentColor / theme colours so they scale and theme cleanly.

// Classic soccer ball (truncated-icosahedron front view): outer circle, a centre
// pentagon, five outer pentagons, and the seams linking them. All stroked (no fill)
// in currentColor so it themes + scales cleanly.
export function GoalIcon({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden
      fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.3" />
      <polygon points="12,8.6 15.23,10.95 14,14.75 10,14.75 8.77,10.95" />
      <polygon points="12,7.1 10.1,5.72 10.82,3.48 13.18,3.48 13.9,5.72" />
      <polygon points="16.66,10.49 17.38,8.25 19.74,8.25 20.46,10.49 18.56,11.87" />
      <polygon points="14.88,15.96 17.24,15.96 17.96,18.2 16.06,19.58 14.16,18.2" />
      <polygon points="9.12,15.96 9.84,18.2 7.94,19.58 6.04,18.2 6.76,15.96" />
      <polygon points="7.34,10.49 5.44,11.87 3.54,10.49 4.26,8.25 6.62,8.25" />
      <path d="M12,8.6 12,7.1 M15.23,10.95 16.66,10.49 M14,14.75 14.88,15.96 M10,14.75 9.12,15.96 M8.77,10.95 7.34,10.49" />
    </svg>
  );
}

// Booking card: a small rounded rectangle in the canonical yellow/red.
export function CardIcon({ red = false, className = "" }) {
  return (
    <span aria-hidden
      className={`inline-block h-[13px] w-[9px] shrink-0 rounded-[2px] ${red ? "bg-red-500" : "bg-yellow-400"} ${className}`} />
  );
}

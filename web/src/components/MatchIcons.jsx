// Real interface icons for match events (replacing the old ⚽/🟨/🟥 emoji).

// Soccer ball — classic black-and-white panels (white ball, black seams), so it
// reads clearly on any theme via its own outline.
export function GoalIcon({ size = 14, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g transform="translate(4.5, 4.5)">
        <circle cx="7.5" cy="7.5" r="7.5" fill="#FFFFFF" stroke="#000000" strokeWidth="1" />
        <g fill="#000000" fillOpacity="0.9">
          <polygon points="7.5 5 9.87764129 6.72745751 8.96946313 9.52254249 6.03053687 9.52254249 5.12235871 6.72745751" />
          <path d="M 9.683,0.343 L 8.969,2.522 L 6.031,2.522 L 5.317,0.343 A 7.5,7.5 0 0 1 9.683,0.343 Z" />
          <path d="M 1.731,12.285 L 3.5,11 L 5.877,12.727 L 5.312,14.467 A 7.5,7.5 0 0 1 1.731,12.285 Z" />
          <path d="M 13.300,12.307 L 11.5,11 L 9.122,12.727 L 9.750,14.639 A 7.5,7.5 0 0 0 13.300,12.307 Z" />
          <path d="M 9.683,0.343 L 8.969,2.522 L 6.031,2.522 L 5.317,0.343 A 7.5,7.5 0 0 1 9.683,0.343 Z" transform="rotate(-80 7.5 7.5)" />
          <path d="M 9.683,0.343 L 8.969,2.522 L 6.031,2.522 L 5.317,0.343 A 7.5,7.5 0 0 1 9.683,0.343 Z" transform="rotate(80 7.5 7.5)" />
        </g>
      </g>
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

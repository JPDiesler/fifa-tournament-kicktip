import Flag from "./Flag.jsx";

// The advancing-team suffix for a K.o. Remis tip — the side the tipper backed to go through
// (after extra time / penalties). Renders nothing unless the tip carries a winner pick (`w`),
// which only happens on a draw tip in a knockout match. `resolved` = st.resolved[matchN]
// (its home/away codes are already oriented to our static home/away, same as tip.w).
export default function WinnerFlag({ tip, resolved, arrow = true, className = "" }) {
  const code = tip?.w === "h" ? resolved?.homeCode : tip?.w === "a" ? resolved?.awayCode : null;
  if (!code) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-muted ${className}`} title="getippter Sieger">
      {arrow && "→"}<Flag code={code} sm />
    </span>
  );
}

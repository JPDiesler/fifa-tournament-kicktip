import { useState } from "react";

// Federation/association logo for a team (the DFB eagle, etc.) — NOT the flag.
// api-football's national-team "crest" is just the flag, so logos come from elsewhere:
// sources are tried in order — an admin upload (a URL passed as `logo`) → a build-bundled
// asset (web/src/assets/team-logos/<CODE>.svg|png, fetched from Wikipedia at build). The
// crest renders bare (no circle/background). Only the fallback — when no crest exists — is
// a circle in the team's jersey colour with the country code. The flag is shown separately.
const bundled = import.meta.glob("../assets/team-logos/*.{svg,png}", { eager: true, query: "?url", import: "default" });
const LOGOS = {};
for (const p in bundled) LOGOS[p.split("/").pop().replace(/\.(svg|png)$/, "")] = bundled[p];

export default function TeamLogo({ code, logo, name, className = "size-10", textClass = "text-xs", fallbackBg, fallbackFg }) {
  const sources = [logo, LOGOS[code]].filter(Boolean); // admin override → bundled default
  const [i, setI] = useState(0);
  const src = sources[i];
  if (src) return <img src={src} alt={name || code || ""} className={`${className} shrink-0 object-contain`} onError={() => setI((n) => n + 1)} />;
  const label = (code || name || "?").slice(0, 3).toUpperCase();
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full font-bold ${textClass}`} style={{ background: fallbackBg || "#52525b", color: fallbackFg || "#fff" }}>
      {label}
    </span>
  );
}

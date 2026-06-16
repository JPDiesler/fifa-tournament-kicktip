import { createContext, useContext } from "react";
import ProviderLogo from "./ProviderLogo.jsx";

// Players metadata map ({ kuerzel: { name, isAi, provider, logo } }) from /api/state,
// provided once at the app root so every player display can render an AI badge + logo
// without prop-drilling.
export const PlayersContext = createContext({});
export const usePlayers = () => useContext(PlayersContext);

// Consistent player identity everywhere: kürzel (or full name), plus — for AI players
// — the provider logo and a "KI" badge. `players` prop overrides the context if given.
export default function PlayerName({ kuerzel, players, showName = false, className = "" }) {
  const all = usePlayers();
  const meta = (players || all)?.[kuerzel] || {};
  const label = showName ? (meta.name || kuerzel) : kuerzel;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {meta.isAi && <ProviderLogo provider={meta.provider} logo={meta.logo} />}
      <span className="truncate">{label}</span>
      {meta.isAi && <span className="shrink-0 rounded bg-app-accent/15 px-1 text-[9px] font-bold uppercase leading-tight text-app-accent">KI</span>}
    </span>
  );
}

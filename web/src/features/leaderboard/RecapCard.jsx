import { Bot } from "lucide-react";

// AI matchday recap (st.recap = { day, text, no, total } | null), shown atop the standings.
// Clearly labelled as AI-generated; kept short by the prompt so no expand/collapse is needed.
export default function RecapCard({ recap }) {
  if (!recap?.text) return null;
  return (
    <div className="rounded-xl border border-app-accent/30 bg-app-accent/5 p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-app-accent">
        <span className="flex items-center gap-1.5"><Bot size={13} /> KI-Rückblick</span>
        {recap.no && <span className="font-semibold normal-case text-muted">Spieltag {recap.no}/{recap.total}</span>}
      </div>
      <p className="text-sm leading-snug">{recap.text}</p>
    </div>
  );
}

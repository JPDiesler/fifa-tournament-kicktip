import { Disclosure } from "@heroui/react";
import { MATCHES } from "@/data";
import { score, PHASES } from "@/lib/scoring.js";
import { kickoffMs } from "@/lib/matchtime.js";
import PointsBadge from "@/components/PointsBadge.jsx";
import WinnerFlag from "@/components/WinnerFlag.jsx";
import JokerBadge from "@/components/JokerBadge.jsx";

// Expandable per-match breakdown — "where do my points come from?". Lists every
// scored tip (tip + result both present) grouped by tournament phase, with a
// per-phase subtotal. Collapsed by default to keep the Persönlich view compact.
export default function PointsHistory({ me, st, teamLabel }) {
  const tips = st.tips?.[me] || {};
  const results = st.results || {};

  const scored = MATCHES
    .map((m) => ({ m, pt: score(tips[m.n], results[m.n], st.resolved?.[m.n]) }))
    .filter((x) => x.pt !== null);
  const byPhase = {};
  for (const x of scored) (byPhase[x.m.ph] ||= []).push(x);
  const total = scored.reduce((s, x) => s + x.pt, 0);

  return (
    <Disclosure defaultExpanded className="rounded-xl border border-border bg-surface">
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex w-full items-center justify-between gap-2 p-4 text-left">
          <span className="text-sm font-semibold">Punkte-Historie</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {scored.length} Spiele · {total} P
            <Disclosure.Indicator />
          </span>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        {scored.length === 0 ? (
          <p className="border-t border-border p-4 text-sm text-muted">Noch keine gewerteten Tipps.</p>
        ) : (
          <div className="border-t border-border px-4 pb-3">
            {PHASES.filter((ph) => byPhase[ph.code]?.length).map((ph) => {
              const items = [...byPhase[ph.code]].sort((a, b) => kickoffMs(b.m.dt) - kickoffMs(a.m.dt));
              const sub = items.reduce((s, x) => s + x.pt, 0);
              return (
                <div key={ph.code} className="pt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <span>{ph.label}</span>
                    <span className="tabular-nums">{sub} P</span>
                  </div>
                  <ul className="space-y-1">
                    {items.map(({ m, pt }) => {
                      const t = tips[m.n], r = results[m.n];
                      return (
                        <li key={m.n} className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{teamLabel(m, "h")} – {teamLabel(m, "a")}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">
                            dein {t.h}:{t.a}<WinnerFlag tip={t} resolved={st.resolved?.[m.n]} arrow={false} className="mx-1 align-middle" /> → <span className="text-foreground">{r.h}:{r.a}</span>
                          </span>
                          <JokerBadge joker={t.joker} />
                          <PointsBadge points={pt} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Disclosure.Content>
    </Disclosure>
  );
}

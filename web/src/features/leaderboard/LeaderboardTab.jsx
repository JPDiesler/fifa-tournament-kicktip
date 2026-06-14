import { useState } from "react";
import { Table } from "@heroui/react";
import { Check, X } from "lucide-react";
import { known } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";

// "Rangliste" tab: overall standings + a per-matchday breakdown ("Spieltage").
export default function LeaderboardTab({ totals, matchdays = [], me, teams, championActual }) {
  const [mode, setMode] = useState("gesamt");

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
        {[["gesamt", "Gesamt"], ["tage", "Spieltage"]].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)}
            className={`rounded-md px-3 py-1 transition ${mode === k ? "bg-accent font-semibold text-accent-foreground" : "text-muted"}`}>
            {l}
          </button>
        ))}
      </div>

      {mode === "gesamt" ? (
        <Table variant="primary" aria-label="Rangliste">
          <Table.ScrollContainer>
            <Table.Content aria-label="Rangliste">
              <Table.Header>
                <Table.Column isRowHeader>#</Table.Column>
                <Table.Column>Spieler</Table.Column>
                <Table.Column>Punkte</Table.Column>
                <Table.Column>Exakt</Table.Column>
                <Table.Column>WM-Tipp</Table.Column>
              </Table.Header>
              <Table.Body>
                {totals.map((t, i) => (
                  <Table.Row key={t.p} id={t.p} className={t.p === me ? "bg-accent/10" : ""}>
                    <Table.Cell className="font-bold text-muted">{i + 1}</Table.Cell>
                    <Table.Cell>
                      <div className="font-semibold">{t.name || t.p}</div>
                      {t.name && t.name !== t.p && <div className="text-xs text-muted">{t.p}</div>}
                    </Table.Cell>
                    <Table.Cell className="text-center text-base font-bold text-success">{t.sum}</Table.Cell>
                    <Table.Cell className="text-center text-muted">{t.exact}</Table.Cell>
                    <Table.Cell>
                      {t.champ ? (
                        <span className="inline-flex items-center gap-1.5">
                          {known(t.champ) && <Flag code={t.champ} sm />}
                          {teams[t.champ] ? teams[t.champ].name : t.champ}
                          {championActual && (t.champHit ? <Check size={14} className="text-success" /> : <X size={14} className="text-muted" />)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      ) : (
        <div className="space-y-2">
          {matchdays.length === 0 && <p className="p-6 text-center text-sm text-muted">Noch keine ausgewerteten Spieltage.</p>}
          {matchdays.map((d) => (
            <div key={d.day} className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">{d.label}</span>
                {d.rows[0] && (
                  <span className="text-xs text-muted">Tagessieger: <b className="text-app-accent">{d.rows[0].name || d.rows[0].p}</b> · {d.rows[0].pts} P</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.rows.map((r) => (
                  <span
                    key={r.p}
                    className={`rounded-md px-2 py-0.5 text-xs tabular-nums ${r.pts === d.top && d.top > 0 ? "bg-app-accent/15 font-semibold text-app-accent" : "bg-overlay text-foreground"} ${r.p === me ? "ring-1 ring-app-accent/50" : ""}`}
                  >
                    {r.p} {r.pts}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

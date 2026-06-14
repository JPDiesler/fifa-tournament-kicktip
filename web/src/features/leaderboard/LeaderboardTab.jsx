import { useState } from "react";
import { Table } from "@heroui/react";
import { Check, X } from "lucide-react";
import { known } from "@/lib/scoring.js";
import Flag from "@/components/Flag.jsx";
import ScoreTrend from "./ScoreTrend.jsx";

// "Rangliste" tab: overall standings + a cumulative score-over-time line chart ("Verlauf").
export default function LeaderboardTab({ totals, matchdays = [], me, teams, championActual }) {
  const [mode, setMode] = useState("gesamt");

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
        {[["gesamt", "Gesamt"], ["verlauf", "Verlauf"]].map(([k, l]) => (
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
        <ScoreTrend matchdays={matchdays} totals={totals} me={me} />
      )}
    </div>
  );
}

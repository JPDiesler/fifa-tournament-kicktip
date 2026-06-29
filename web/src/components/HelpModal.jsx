import { useState } from "react";
import { Modal } from "@heroui/react";
import { Swords, Shield } from "lucide-react";
import PointsBadge from "./PointsBadge.jsx";
import SubTabs from "./SubTabs.jsx";

const H = ({ children }) => <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{children}</h3>;
const Pt = ({ p, children }) => (
  <div className="flex items-center gap-2"><PointsBadge points={p} /><span>{children}</span></div>
);

// Help / rules overlay (opened from the "?" button in the navbar). Organised into category tabs
// (Wertung / Joker / Tippen / Ansichten) via the shared SubTabs strip so it stays scannable instead
// of one long scroll; the Joker tab only appears while the feature is enabled, Admin only for admins.
export default function HelpModal({ isOpen, onClose, champBonus, lockOffsetMin = 5, jokersEnabled, isAdmin }) {
  const [tab, setTab] = useState("wertung");
  const items = [
    ["wertung", "Wertung"],
    ...(jokersEnabled ? [["joker", "Joker"]] : []),
    ["tippen", "Tippen"],
    ["ansichten", "Ansichten"],
  ];
  const active = items.some(([k]) => k === tab) ? tab : "wertung";

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center" size="md" scroll="inside">
        <Modal.Dialog className="w-full max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>So funktioniert's</Modal.Heading></Modal.Header>
          <Modal.Body className="pb-6 text-sm">
            <SubTabs items={items} value={active} onChange={setTab} ariaLabel="Hilfe" />

            <div className="mt-4 h-[24rem] overflow-y-auto pr-1">
              {active === "wertung" && (
                <div className="flex flex-col gap-5">
                  <section>
                    <H>Punkte je Spiel</H>
                    <div className="flex flex-col gap-1.5">
                      <Pt p={3}>Exakter Endstand</Pt>
                      <Pt p={2}>Richtige Tordifferenz</Pt>
                      <Pt p={1}>Richtige Tendenz (Sieger / Unentschieden)</Pt>
                      <Pt p={0}>Daneben</Pt>
                    </div>
                    <p className="mt-2 text-muted">Weltmeister-Tipp: <b className="text-app-accent">+{champBonus} P</b>, wenn der echte Weltmeister stimmt.</p>
                  </section>

                  <section>
                    <H>K.o.-Phase</H>
                    <p className="mb-2 text-muted">In der K.o.-Phase gibt es kein Unentschieden im Endergebnis.</p>
                    <p className="mb-1"><b className="text-foreground">Kein Remis getippt:</b> <span className="text-muted">normales 3/2/1/0 gegen den Endstand (nach 90 bzw. 120 Minuten).</span></p>
                    <p className="mb-1.5"><b className="text-foreground">Remis getippt:</b> <span className="text-muted">leg zusätzlich fest, wer weiterkommt (nach Verlängerung/Elfmeter):</span></p>
                    <div className="flex flex-col gap-1.5">
                      <Pt p={4}>Exaktes Remis (90′) + Sieger richtig</Pt>
                      <Pt p={3}>Exaktes Remis (90′), Sieger falsch</Pt>
                      <Pt p={3}>Remis (90′), falsches Ergebnis, Sieger richtig</Pt>
                      <Pt p={2}>Remis (90′), falsches Ergebnis, Sieger falsch</Pt>
                      <Pt p={1}>Kein Remis (90′), aber Sieger richtig</Pt>
                      <Pt p={0}>Kein Remis (90′), Sieger falsch</Pt>
                    </div>
                  </section>
                </div>
              )}

              {active === "joker" && (
                <section>
                  <H>Joker · 1 pro Phase</H>
                  <p className="mb-3 text-muted">Pro Phase (je Gruppe, je K.-o.-Runde) darfst du auf <b className="text-foreground">ein</b> Spiel einen Joker legen. Liegt der Joker schon woanders, entfern ihn dort zuerst.</p>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500"><Swords size={15} /></span>
                      <div>
                        <div className="font-semibold">Zweischneidiges Schwert</div>
                        <p className="text-muted">Exakter Treffer zählt <b className="text-success">doppelt</b> (3→6, 4→8), sonst <b className="text-danger">−3</b> Punkte.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400"><Shield size={15} /></span>
                      <div>
                        <div className="font-semibold">Schutzschild</div>
                        <p className="text-muted">Exakter Treffer gibt <b className="text-success">+1</b> Punkt, sonst kein Abzug.</p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-muted">Den Joker wählst du beim Tippen direkt am Spiel; im Tipp erscheint er als kleines Badge.</p>
                </section>
              )}

              {active === "tippen" && (
                <div className="flex flex-col gap-5">
                  <section>
                    <H>Tippen</H>
                    <p className="text-muted">Tippe per Klick auf ein Spiel. Du kannst deinen Tipp jederzeit bis <b className="text-foreground">{lockOffsetMin} Minuten vor Anpfiff</b> ändern. Danach ist das Spiel gesperrt.</p>
                  </section>
                  <section>
                    <H>Weltmeister-Tipp</H>
                    <p className="text-muted">Oben über den Tabs. Gesperrt ab Beginn der K.o.-Phase – ab dann sieht man die Tipps der anderen.</p>
                  </section>
                </div>
              )}

              {active === "ansichten" && (
                <div className="flex flex-col gap-5">
                  <section>
                    <H>Ansichten</H>
                    <ul className="list-disc space-y-1 pl-5 text-muted">
                      <li><b className="text-foreground">Chronologisch</b> – laufende (<span className="font-semibold text-app-accent">läuft</span>) und kommende Spiele in Anpfiff-Reihenfolge</li>
                      <li><b className="text-foreground">Gruppenphase</b> – Tabelle + Spiele je Gruppe</li>
                      <li><b className="text-foreground">K.O.</b> – Turnierbaum; der Sieg-Pfad wird in der Akzentfarbe eingezeichnet</li>
                      <li><b className="text-foreground">Rangliste</b> – Gesamtwertung und Auswertung pro Spieltag</li>
                    </ul>
                  </section>
                  {isAdmin && (
                    <section>
                      <H>Admin</H>
                      <p className="text-muted">Das Schild-Icon öffnet die Verwaltung. Ergebnisse und der Weltmeister werden automatisch zu den Spielende-Zeiten geholt; der Sync-Button erzwingt nur eine sofortige Aktualisierung. Dazu die Benutzerverwaltung.</p>
                    </section>
                  )}
                </div>
              )}
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

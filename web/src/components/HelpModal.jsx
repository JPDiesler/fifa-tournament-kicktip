import { Modal } from "@heroui/react";
import PointsBadge from "./PointsBadge.jsx";

const H = ({ children }) => <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{children}</h3>;

// Help / rules overlay (opened from the "?" button in the navbar).
export default function HelpModal({ isOpen, onClose, champBonus, lockOffsetMin = 5, isAdmin }) {
  const Pt = ({ p, children }) => (
    <div className="flex items-center gap-2"><PointsBadge points={p} /><span>{children}</span></div>
  );
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center" size="md" scroll="inside">
        <Modal.Dialog className="w-full max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>So funktioniert's</Modal.Heading></Modal.Header>
          <Modal.Body className="flex flex-col gap-5 pb-6 text-sm">
            <section>
              <H>Punkte je Spiel</H>
              <div className="flex flex-col gap-1.5">
                <Pt p={3}>Exakter Endstand</Pt>
                <Pt p={2}>Richtige Tordifferenz</Pt>
                <Pt p={1}>Richtige Tendenz (Sieger / Unentschieden)</Pt>
                <Pt p={0}>Daneben</Pt>
              </div>
              <p className="mt-2 text-muted">
                Weltmeister-Tipp: <b className="text-app-accent">+{champBonus} P</b>, wenn der echte Weltmeister stimmt.
              </p>
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

            <section>
              <H>Tippen</H>
              <p className="text-muted">
                Tippe per Klick auf ein Spiel. Du kannst deinen Tipp jederzeit bis <b className="text-foreground">{lockOffsetMin} Minuten vor Anpfiff</b> ändern.
                Danach ist das Spiel gesperrt.
              </p>
            </section>

            <section>
              <H>Weltmeister-Tipp</H>
              <p className="text-muted">Oben über den Tabs. Gesperrt ab Beginn der K.o.-Phase – ab dann sieht man die Tipps der anderen.</p>
            </section>

            <section>
              <H>Ansichten</H>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li><b className="text-foreground">Anstehend</b> – laufende (<span className="font-semibold text-app-accent">läuft</span>) und kommende Spiele</li>
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
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

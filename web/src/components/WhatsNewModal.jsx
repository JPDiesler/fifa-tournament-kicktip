import { Modal, Button } from "@heroui/react";
import { Sparkles } from "lucide-react";
import PointsBadge from "./PointsBadge.jsx";

// Bump this whenever there's a new feature to announce → the modal re-shows once per user
// (gated in App.jsx via localStorage["whatsNewSeen"]).
export const WHATS_NEW_VERSION = "2026-06-ko";

const H = ({ children }) => <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">{children}</h3>;

// One-time "what's new" overlay. Shown once per WHATS_NEW_VERSION after login; the "?" Hilfe
// always carries the full rules.
export default function WhatsNewModal({ isOpen, onClose }) {
  const Pt = ({ p, children }) => (
    <div className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><PointsBadge points={p} /></span><span>{children}</span></div>
  );
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center" size="md" scroll="inside">
        <Modal.Dialog className="w-full max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="flex items-center gap-2"><Sparkles size={18} className="text-app-accent" /> Neu im Tippspiel</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-5 pb-2 text-sm">
            <section>
              <H>K.o.-Phase: Remis-Tipps mit Sieger</H>
              <p className="text-muted">
                In der K.o.-Phase gibt es kein Unentschieden im Endergebnis. Tippst du jetzt ein <b className="text-foreground">Remis</b>,
                legst du zusätzlich fest, <b className="text-foreground">wer weiterkommt</b> (nach Verlängerung/Elfmeter). Tippst du kein
                Remis, zählt dein Tipp wie gewohnt gegen den Endstand.
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Pt p={4}>Exaktes Remis (90′) <b className="text-foreground">und</b> Sieger richtig</Pt>
                <Pt p={3}>Exaktes Remis (90′), Sieger falsch · oder Remis (90′) mit falschem Ergebnis + Sieger richtig</Pt>
                <Pt p={2}>Remis (90′), falsches Ergebnis, Sieger falsch</Pt>
                <Pt p={1}>Kein Remis (90′), aber Sieger richtig</Pt>
              </div>
              <p className="mt-2 text-[11px] text-muted">Die Sieger-Auswahl erscheint beim Tippen automatisch, sobald du ein Remis eingibst.</p>
            </section>

            <section>
              <H>Frischeres, einheitlicheres UI</H>
              <p className="text-muted">Tab-Umschalter, Tabellen, Auswahlfelder und Buttons wurden vereinheitlicht — konsistenter und stabiler in Hell- und Dunkelmodus.</p>
            </section>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="primary" onPress={onClose} className="w-full">Alles klar, los geht's</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

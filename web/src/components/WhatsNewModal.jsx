import { useEffect, useState } from "react";
import { Modal, Button } from "@heroui/react";
import { Sparkles, Swords, Shield } from "lucide-react";
import PointsBadge from "./PointsBadge.jsx";

const H = ({ children }) => <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">{children}</h3>;
const Pt = ({ p, children }) => (
  <div className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><PointsBadge points={p} /></span><span>{children}</span></div>
);

// Version-driven changelog. Each release is one step in the modal; `when(ctx)` hides a release
// until its feature is live (e.g. the Joker only once the admin enabled it). Add a new entry on
// top-down chronological order to announce a feature — no need to bump a single global version.
const RELEASES = [
  {
    version: "2026-06-ko",
    body: (
      <>
        <section>
          <H>K.o.-Phase: Remis-Tipps mit Sieger</H>
          <p className="text-muted">
            In der K.o.-Phase gibt es kein Unentschieden im Endergebnis. Tippst du ein <b className="text-foreground">Remis</b>,
            legst du zusätzlich fest, <b className="text-foreground">wer weiterkommt</b> (nach Verlängerung/Elfmeter). Tippst du
            kein Remis, zählt dein Tipp wie gewohnt gegen den Endstand.
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
      </>
    ),
  },
  {
    version: "2026-06-joker",
    when: (ctx) => !!ctx.jokersEnabled,
    body: (
      <section>
        <H>Joker — ein Trumpf pro Phase</H>
        <p className="text-muted">
          Pro Phase (je Gruppe, je K.-o.-Runde) darfst du auf <b className="text-foreground">ein</b> Spiel einen Joker legen:
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-amber-500/20 text-amber-500"><Swords size={13} /></span>
            <span><b className="text-foreground">Zweischneidiges Schwert</b> <span className="text-muted">— exakter Treffer zählt doppelt (3→6, 4→8), sonst −3 Punkte.</span></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-sky-500/20 text-sky-400"><Shield size={13} /></span>
            <span><b className="text-foreground">Schutzschild</b> <span className="text-muted">— exakter Treffer gibt +1 Punkt, ganz ohne Risiko.</span></span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">Den Joker wählst du beim Tippen direkt am Spiel. Im Tipp erscheint er als kleines Badge.</p>
      </section>
    ),
  },
];

const SEEN_KEY = "whatsNewSeen";
// localStorage holds the set of acknowledged release versions (JSON array). Legacy value was a single
// version string ("seen everything up to and incl. it") → migrate it to the equivalent set.
function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    if (raw[0] === "[") return new Set(JSON.parse(raw));
    const idx = RELEASES.findIndex((r) => r.version === raw);
    return new Set(idx < 0 ? [] : RELEASES.slice(0, idx + 1).map((r) => r.version));
  } catch { return new Set(); }
}

// Releases the user hasn't acknowledged yet that are currently live (passes `when`). App calls this
// once state is loaded to decide whether to open the modal (and with which steps).
export function pendingReleases(ctx = {}) {
  const seen = loadSeen();
  return RELEASES.filter((r) => (!r.when || r.when(ctx)) && !seen.has(r.version));
}
function markSeen(releases) {
  try {
    const seen = loadSeen();
    for (const r of releases || []) seen.add(r.version);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch { /* ignore */ }
}

// One-time "Neu im Tippspiel" overlay, now a stepper over the unseen releases (`releases`, in
// chronological order). Any close (finish, X, backdrop) marks the whole batch seen. The "?" Hilfe
// always carries the full, current rules.
export default function WhatsNewModal({ isOpen, releases, onClose }) {
  const list = releases || [];
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [releases]); // restart the stepper when a fresh batch arrives
  if (!list.length) return null;

  const step = Math.min(i, list.length - 1);
  const last = step >= list.length - 1;
  const finish = () => { markSeen(list); onClose(); };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && finish()}>
      <Modal.Container placement="center" size="md" scroll="inside">
        <Modal.Dialog className="w-full max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="flex items-center gap-2"><Sparkles size={18} className="text-app-accent" /> Neu im Tippspiel</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-5 pb-2 text-sm">
            {list[step].body}
          </Modal.Body>
          <Modal.Footer>
            <div className="flex w-full flex-col gap-3">
              {list.length > 1 && (
                <div className="flex items-center justify-center gap-1.5">
                  {list.map((_, k) => <span key={k} className={`size-1.5 rounded-full transition-colors ${k === step ? "bg-app-accent" : "bg-border"}`} />)}
                </div>
              )}
              <div className="flex w-full gap-2">
                {step > 0 && <Button variant="tertiary" onPress={() => setI(step - 1)}>Zurück</Button>}
                <Button variant="primary" className="flex-1" onPress={() => (last ? finish() : setI(step + 1))}>
                  {last ? "Alles klar, los geht's" : "Weiter"}
                </Button>
              </div>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

import { Modal, Button } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import TeamSelect from "./TeamSelect.jsx";
import AdminUsersTab from "./AdminUsersTab.jsx";

// All admin functionality in one modal: result sync, actual champion, user management.
export default function AdminModal({ isOpen, onClose, teams, championActual, onSetChampActual, onSync, syncMsg, lastSync, entra, meId, onFlash, autoOpenEntra }) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center" size="lg" scroll="inside">
        <Modal.Dialog className="w-full max-w-2xl">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>Administration</Modal.Heading></Modal.Header>
          <Modal.Body className="flex flex-col gap-6 pb-6">
            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Ergebnisse</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onPress={onSync}>
                  <RefreshCw size={15} /> Ergebnisse synchronisieren
                </Button>
                <span className="text-xs text-muted">
                  {syncMsg} {lastSync ? "· " + new Date(lastSync).toLocaleString("de-DE") : ""}
                </span>
              </div>
            </section>

            <section>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Tatsächlicher Weltmeister</h3>
              <TeamSelect label="Tatsächlicher Weltmeister" placeholder="— offen —" value={championActual} onChange={onSetChampActual} teams={teams} />
            </section>

            <section>
              <AdminUsersTab entra={entra} meId={meId} onFlash={onFlash} autoOpenEntra={autoOpenEntra} />
            </section>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

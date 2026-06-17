import { useEffect, useState } from "react";
import { Modal, Tabs } from "@heroui/react";
import { Database, Users, Bot } from "lucide-react";
import AdminUsersTab from "./AdminUsersTab.jsx";
import AiAdminTab from "./AiAdminTab.jsx";
import SourcePanel from "./SourcePanel.jsx";

// Admin in two tabs: "API & Ergebnisse" (result source, token, capabilities,
// manual sync) and "Nutzer" (user management). Results and the actual champion
// are set automatically, so there is no manual result entry.
export default function AdminModal({ isOpen, onClose, onSync, entra, meId, onFlash, autoOpenEntra }) {
  const [tab, setTab] = useState("api");
  // Resuming the Entra picker after an MSAL redirect → jump to the Nutzer tab.
  useEffect(() => { if (autoOpenEntra) setTab("users"); }, [autoOpenEntra]);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center" size="lg" scroll="inside">
        <Modal.Dialog className="w-full max-w-2xl">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>Administration</Modal.Heading></Modal.Header>
          <Modal.Body className="pb-6">
            <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="Administration" className="w-full">
                  <Tabs.Tab id="api" className="flex flex-1 items-center justify-center gap-1.5">
                    <Database size={15} /> API &amp; Ergebnisse <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="users" className="flex flex-1 items-center justify-center gap-1.5">
                    <Users size={15} /> Nutzer <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="ai" className="flex flex-1 items-center justify-center gap-1.5">
                    <Bot size={15} /> KI <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              {/* Both panels share one fixed height + internal scroll so switching
                  tabs never resizes the modal (no jump between the differing heights). */}
              <Tabs.Panel id="api" className="h-[26rem] overflow-y-auto pr-1 pt-4">
                {isOpen && <SourcePanel onFlash={onFlash} onSync={onSync} />}
              </Tabs.Panel>
              <Tabs.Panel id="users" className="h-[26rem] overflow-y-auto pr-1 pt-4">
                <AdminUsersTab entra={entra} meId={meId} onFlash={onFlash} autoOpenEntra={autoOpenEntra} />
              </Tabs.Panel>
              <Tabs.Panel id="ai" className="h-[26rem] overflow-y-auto pr-1 pt-4">
                {isOpen && <AiAdminTab onFlash={onFlash} />}
              </Tabs.Panel>
            </Tabs>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

import { Drawer } from "@heroui/react";
import BroadcastButtons from "./BroadcastButtons.jsx";

// Bottom drawer opened from a card's broadcast pill: the services as link buttons.
export default function BroadcastDrawer({ isOpen, onClose, keys, title }) {
  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content placement="bottom">
        <Drawer.Dialog className="mx-auto w-full max-w-md">
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading className="text-sm">Wo zu sehen?{title ? ` · ${title}` : ""}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="pb-8">
            <BroadcastButtons keys={keys} />
            <p className="mt-3 text-center text-[11px] text-muted">In Deutschland · Klick öffnet den Dienst</p>
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

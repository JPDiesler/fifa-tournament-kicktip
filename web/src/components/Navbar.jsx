import { ShieldCheck, LogOut, HelpCircle } from "lucide-react";
import { Button, Chip } from "@heroui/react";
import Logo from "./Logo.jsx";

// Sticky top bar: brand lockup + logged-in identity, help, admin button (opens
// the admin modal), logout.
export default function Navbar({ user, onLogout, isAdmin, onOpenAdmin, onOpenHelp }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-3">
        <Logo size="h-8" />
        <div className="flex-1" />
        <Chip size="sm" variant="soft" className="max-w-[8rem] shrink-0 truncate">
          {user?.kuerzel || user?.name || "—"}
        </Chip>
        <Button aria-label="Hilfe" variant="tertiary" size="sm" isIconOnly onPress={onOpenHelp} className="shrink-0">
          <HelpCircle size={16} />
        </Button>
        {isAdmin && (
          <Button aria-label="Administration" variant="tertiary" size="sm" isIconOnly onPress={onOpenAdmin} className="shrink-0">
            <ShieldCheck size={16} />
          </Button>
        )}
        <Button aria-label="Abmelden" variant="tertiary" size="sm" isIconOnly onPress={onLogout} className="shrink-0">
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
}

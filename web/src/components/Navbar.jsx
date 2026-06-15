import { useState } from "react";
import { ShieldCheck, LogOut, HelpCircle, Sun, Moon } from "lucide-react";
import { Button, Chip } from "@heroui/react";
import Logo from "./Logo.jsx";
import NotificationsButton from "@/features/notifications/NotificationsButton.jsx";
import { getTheme, toggleTheme } from "@/lib/theme.js";

// Sticky top bar: brand lockup + logged-in identity, notifications, theme, help,
// admin button (opens the admin modal), logout.
export default function Navbar({ user, onLogout, isAdmin, onOpenAdmin, onOpenHelp, onFlash }) {
  const [theme, setTheme] = useState(getTheme());
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-3">
        <Logo h={36} />
        <div className="flex-1" />
        <Chip size="sm" variant="soft" className="max-w-[8rem] shrink-0 truncate">
          {user?.kuerzel || user?.name || "—"}
        </Chip>
        <NotificationsButton onFlash={onFlash} />
        <Button aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"} variant="tertiary" size="sm" isIconOnly onPress={() => setTheme(toggleTheme())} className="shrink-0">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
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

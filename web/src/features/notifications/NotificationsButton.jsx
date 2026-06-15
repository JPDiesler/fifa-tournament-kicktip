import { useEffect, useState } from "react";
import { Button, Popover, Switch, Label, Spinner } from "@heroui/react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { pushSupported, permission, currentSubscription, enablePush, disablePush, getPrefs, setPrefs, sendTest } from "@/lib/push.js";

// The six opt-in categories (keys match the server's EVENTS). Order = display order.
const EVENT_META = [
  ["kickoff", "Anpfiff", "Wenn ein Spiel startet (mit Sender)."],
  ["goal", "Tore", "Bei jedem Tor (ca. 3 Min verzögert)."],
  ["fulltime", "Endstand & Punkte", "Endergebnis + deine erzielten Punkte."],
  ["tipReminder", "Tipp-Erinnerung", "Wenn ein Spiel bald startet und du noch nicht getippt hast."],
  ["champReminder", "Weltmeister-Tipp", "Erinnerung kurz vor der Sperre."],
  ["dailySummary", "Tages-Auswertung", "Abends: deine Tagespunkte + Platzierung."],
];

// Navbar bell → a popover to enable push on THIS device and toggle each category.
export default function NotificationsButton({ onFlash }) {
  const supported = pushSupported();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);      // subscribed on this device?
  const [prefs, setPrefsState] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setOn(!!(await currentSubscription()));
    try { setPrefsState((await getPrefs()).prefs || {}); } catch { /* not critical */ }
    setLoaded(true);
  };
  useEffect(() => { if (open && !loaded && supported) refresh(); }, [open]); // eslint-disable-line

  const enable = async () => {
    setBusy(true);
    try { setPrefsState((await enablePush()).prefs || {}); setOn(true); onFlash?.("Benachrichtigungen aktiviert"); }
    catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try { await disablePush(); setOn(false); onFlash?.("Auf diesem Gerät deaktiviert"); }
    catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };
  const toggle = async (key, val) => {
    const next = { ...prefs, [key]: val };
    setPrefsState(next);
    try { await setPrefs(next); } catch (e) { onFlash?.(e.message); }
  };
  const test = () => sendTest().then(() => onFlash?.("Test gesendet")).catch((e) => onFlash?.(e.message));

  const denied = supported && permission() === "denied";

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button aria-label="Benachrichtigungen" variant="tertiary" size="sm" isIconOnly className="shrink-0">
        {on ? <BellRing size={16} className="text-app-accent" /> : <Bell size={16} />}
      </Button>
      <Popover.Content className="w-80" placement="bottom">
        <Popover.Dialog>
          <Popover.Arrow />
          <Popover.Heading>Benachrichtigungen</Popover.Heading>

          {!supported ? (
            <p className="mt-2 text-sm text-muted">
              Dieses Gerät/dieser Browser unterstützt keine Push-Nachrichten. Auf dem iPhone: über „Teilen → Zum Home-Bildschirm" installieren, dann hier aktivieren.
            </p>
          ) : denied ? (
            <p className="mt-2 text-sm text-muted">
              Benachrichtigungen sind im Browser blockiert. Bitte in den Seiteneinstellungen erlauben und erneut versuchen.
            </p>
          ) : !loaded ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted"><Spinner size="sm" /> Lade …</div>
          ) : !on ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm text-muted">Aktiviere Push auf diesem Gerät, um Anpfiff, Tore, Endstände und Erinnerungen zu erhalten.</p>
              <Button variant="primary" size="sm" isDisabled={busy} onPress={enable}><Bell size={14} /> Auf diesem Gerät aktivieren</Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-2.5">
                {EVENT_META.map(([key, label, desc]) => (
                  <Switch key={key} size="sm" isSelected={prefs[key] !== false} onChange={(v) => toggle(key, v)}>
                    <Switch.Control><Switch.Thumb /></Switch.Control>
                    <Switch.Content>
                      <Label className="text-sm">{label}</Label>
                      <span className="text-xs text-muted">{desc}</span>
                    </Switch.Content>
                  </Switch>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <Button variant="tertiary" size="sm" isDisabled={busy} onPress={test}>Test senden</Button>
                <Button variant="tertiary" size="sm" isDisabled={busy} onPress={disable}><BellOff size={14} /> Deaktivieren</Button>
              </div>
            </div>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

import { useEffect, useState } from "react";
import { Button, Popover, Switch, Spinner } from "@heroui/react";
import { Bell, BellOff, BellRing, Play, Goal, Timer, Flag, TrendingDown, Medal, Bot, AlarmClock, Trophy, BarChart3 } from "lucide-react";
import { pushSupported, permission, currentSubscription, enablePush, disablePush, getPrefs, setPrefs, sendTest } from "@/lib/push.js";

// Opt-in categories (keys match the server's EVENTS), grouped + iconised for a compact,
// scannable list. One row = icon + label + toggle (whole row tappable).
const GROUPS = [
  { title: "Live-Spiel", items: [
    { key: "kickoff", label: "Anpfiff", Icon: Play },
    { key: "goal", label: "Tore", Icon: Goal },
    { key: "phaseChanged", label: "Spielphase", Icon: Timer },
    { key: "fulltime", label: "Endstand & Punkte", Icon: Flag },
  ] },
  { title: "Wertung", items: [
    { key: "overtaken", label: "Überholt", Icon: TrendingDown },
    { key: "achievement", label: "Erfolge", Icon: Medal },
    { key: "recap", label: "KI-Rückblick", Icon: Bot },
  ] },
  { title: "Erinnerungen", items: [
    { key: "tipReminder", label: "Tipp-Erinnerung", Icon: AlarmClock },
    { key: "champReminder", label: "Weltmeister-Tipp", Icon: Trophy },
    { key: "dailySummary", label: "Tages-Auswertung", Icon: BarChart3 },
  ] },
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
  const test = () => sendTest()
    .then((r) => onFlash?.(`Test gesendet (${r.sent} Gerät${r.sent === 1 ? "" : "e"})`))
    .catch((e) => onFlash?.(e.message));

  const denied = supported && permission() === "denied";

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button aria-label="Benachrichtigungen" variant="tertiary" size="sm" isIconOnly className="shrink-0">
        {on ? <BellRing size={16} className="text-app-accent" /> : <Bell size={16} />}
      </Button>
      <Popover.Content className="w-72" placement="bottom">
        <Popover.Dialog className="p-0" aria-label="Benachrichtigungen">
          <Popover.Arrow />

          {!supported ? (
            <p className="p-4 text-sm text-muted">
              Dieses Gerät/dieser Browser unterstützt keine Push-Nachrichten. Auf dem iPhone: über „Teilen → Zum Home-Bildschirm" installieren, dann hier aktivieren.
            </p>
          ) : denied ? (
            <p className="p-4 text-sm text-muted">
              Benachrichtigungen sind im Browser blockiert. Bitte in den Seiteneinstellungen erlauben und erneut versuchen.
            </p>
          ) : !loaded ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted"><Spinner size="sm" /> Lade …</div>
          ) : !on ? (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><Bell size={15} /> Benachrichtigungen</div>
              <p className="text-sm text-muted">Aktiviere Push auf diesem Gerät für Anpfiff, Tore, Endstände und Erinnerungen.</p>
              <Button variant="primary" size="sm" isDisabled={busy} onPress={enable}><Bell size={14} /> Auf diesem Gerät aktivieren</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 pb-1 pt-3 text-sm font-semibold">
                <BellRing size={15} className="text-app-accent" /> Benachrichtigungen
              </div>
              <div className="flex flex-col gap-2.5 px-3 py-2">
                {GROUPS.map(({ title, items }) => (
                  <div key={title}>
                    <div className="mb-0.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted/60">{title}</div>
                    <div className="flex flex-col">
                      {items.map(({ key, label, Icon }) => (
                        <Switch key={key} aria-label={label} size="sm" className="w-full py-1"
                          isSelected={prefs[key] !== false} onChange={(v) => toggle(key, v)}>
                          <Switch.Content className="flex w-full items-center gap-2.5">
                            <Icon size={15} className="shrink-0 text-muted" />
                            <span className="text-sm">{label}</span>
                            <Switch.Control className="ml-auto shrink-0"><Switch.Thumb /></Switch.Control>
                          </Switch.Content>
                        </Switch>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                <Button variant="tertiary" size="sm" isDisabled={busy} onPress={test}>Test senden</Button>
                <Button variant="tertiary" size="sm" isDisabled={busy} onPress={disable}><BellOff size={14} /> Deaktivieren</Button>
              </div>
            </>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

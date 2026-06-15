import { useEffect, useState } from "react";
import { Button, TextField, Label, Input, Spinner, Tooltip } from "@heroui/react";
import { Plug, Check, X, Minus, Clock, RefreshCw } from "lucide-react";
import { getSource, setSourceToken, testSource } from "./admin.js";

// Last-poll traffic-light, as a coloured status pill.
const STATE_PILL = {
  ok:           { c: "bg-green-500/15 text-green-400 ring-green-500/30", label: "OK" },
  error:        { c: "bg-red-500/15 text-red-400 ring-red-500/30", label: "Fehler" },
  unconfigured: { c: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30", label: "Kein Token" },
  idle:         { c: "bg-amber-500/15 text-amber-400 ring-amber-500/30", label: "Noch kein Sync" },
};

// The capability pills, in display order.
const PILLS = [
  ["liveScore", "Live-Score"],
  ["liveMinute", "Live-Spielminute"],
  ["scorers", "Torschützen"],
  ["cards", "Karten"],
  ["phase", "Spielphase"],
  ["results", "Ergebnisse"],
];
const PILL_UI = {
  green:   { c: "bg-green-500/15 text-green-400 ring-green-500/30", Icon: Check },
  yellow:  { c: "bg-amber-500/15 text-amber-400 ring-amber-500/30", Icon: Clock },
  red:     { c: "bg-red-500/15 text-red-400 ring-red-500/30", Icon: X },
  unknown: { c: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30", Icon: Minus },
};
const tri = (v) => (v === true ? "green" : v === false ? "red" : "unknown");
// Map a capability key → traffic-light state. Live-Score is green only with
// real-time data, otherwise amber ("verzögert"); the rest are green/red/grey.
function capState(key, caps) {
  if (!caps) return "unknown";
  if (key === "liveScore") return caps.realtime ? "green" : "yellow";
  return tri(caps[key]);
}
// What each capability is, and what its colour means — shown as a tooltip.
const CAP_DESC = {
  liveScore:  "Spielstand während des laufenden Spiels.",
  liveMinute: "Aktuelle Spielminute im Live-Spiel.",
  scorers:    "Torschützen je Spiel.",
  cards:      "Gelbe/Rote Karten je Spiel.",
  phase:      "Spielphase: Halbzeit, Verlängerung, Elfmeterschießen.",
  results:    "Endergebnisse der Spiele.",
};
const STATE_MEANING = {
  green:   "verfügbar",
  yellow:  "verfügbar, aber verzögert (Free-Tier)",
  red:     "nicht im aktuellen Plan",
  unknown: "aktuell nicht getestet",
};

function CapPill({ capKey, state, label }) {
  const { c, Icon } = PILL_UI[state] || PILL_UI.unknown;
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger aria-label={`${label}: ${STATE_MEANING[state]}`}>
        <span className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${c}`}>
          <Icon size={12} className="shrink-0" /> {label}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow className="max-w-56">
        <Tooltip.Arrow />
        <p className="font-semibold">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{CAP_DESC[capKey]} — {STATE_MEANING[state]}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
function InfoPill({ children }) {
  return <span className="inline-flex items-center rounded-full bg-overlay px-2 py-0.5 text-[11px] text-muted ring-1 ring-border">{children}</span>;
}

// One self-contained "API & Ergebnisse" area: manual sync + last-poll status,
// budget/plan info, detected capabilities (pills) and runtime token management
// for football-data.org.
export default function SourcePanel({ onFlash, onSync }) {
  const [src, setSrc] = useState(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState(null);

  const load = async () => { try { setSrc(await getSource()); } catch (e) { onFlash?.(e.message); } };
  useEffect(() => { load(); }, []);

  const runSync = async () => { setBusy(true); try { await onSync?.(); await load(); } finally { setBusy(false); } };
  const save = async () => {
    setBusy(true);
    try { const s = await setSourceToken(token.trim()); setSrc(s); setToken(""); onFlash?.("Token gespeichert"); setProbe(await testSource()); await load(); }
    catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };
  const test = async () => { setBusy(true); try { setProbe(await testSource()); await load(); } catch (e) { onFlash?.(e.message); } finally { setBusy(false); } };
  const reset = async () => { setBusy(true); try { setSrc(await setSourceToken("")); setProbe(null); onFlash?.("Token auf .env zurückgesetzt"); } catch (e) { onFlash?.(e.message); } finally { setBusy(false); } };

  if (!src) return <div className="flex items-center gap-2 text-xs text-muted"><Spinner size="sm" /> Lade …</div>;

  const st = STATE_PILL[src.state] || STATE_PILL.idle;
  const planHint = src.rateLimitPerMin <= 10 ? "Free" : "Paid";
  const caps = probe?.caps || src.capabilities || null; // freshest probe wins, else last stored

  return (
    <div className="flex flex-col gap-4">
      {/* Sync + status */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" isDisabled={busy} onPress={runSync}><RefreshCw size={15} /> Synchronisieren</Button>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${st.c}`}>
            <span className="inline-block size-1.5 rounded-full bg-current" /> {src.name} · {st.label}
          </span>
        </div>
        <div className="text-xs text-muted">
          Letzter Poll: <span className="text-foreground">{src.lastSync ? new Date(src.lastSync).toLocaleString("de-DE") : "—"}</span>
          {src.lastSyncMsg && <> · {src.lastSyncMsg}</>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <InfoPill>Rate-Limit: {src.rateLimitPerMin}/min</InfoPill>
          <InfoPill>Tageslimit: {src.dailyLimit ?? "keins"}</InfoPill>
          <InfoPill>Plan (geschätzt): {planHint}</InfoPill>
          {caps?.client && <InfoPill>Konto: {caps.client}</InfoPill>}
        </div>
      </div>

      {/* Capabilities */}
      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Capabilities</div>
        <div className="flex flex-wrap gap-1.5">
          {PILLS.map(([key, label]) => <CapPill key={key} capKey={key} state={capState(key, caps)} label={label} />)}
        </div>
        <p className="mt-1.5 text-[10px] text-muted">
          Für Details über eine Pille fahren.
          {caps?.checkedAt ? ` · geprüft: ${new Date(caps.checkedAt).toLocaleString("de-DE")}` : " · Testen für aktuelle Werte"}
        </p>
      </div>

      {/* Token */}
      {src.tokenEditable ? (
        <div className="rounded-lg border border-border bg-overlay p-2.5">
          <div className="mb-1.5 text-xs text-muted">
            Token: <span className="tabular-nums text-foreground">{src.tokenMasked || "—"}</span>
            {src.tokenSource === "env" && " · aus .env"}
            {src.tokenSource === "db" && " · im Web gesetzt"}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <TextField aria-label="football-data.org Token" type="password" value={token} onChange={setToken} autoComplete="off" className="min-w-48 flex-1">
              <Label className="text-xs text-muted">Neuer Token</Label>
              <Input placeholder="football-data.org Token einfügen …" />
            </TextField>
            <Button variant="primary" size="sm" isDisabled={busy || !token.trim()} onPress={save}>Speichern</Button>
            <Button variant="secondary" size="sm" isDisabled={busy} onPress={test}><Plug size={14} /> Testen</Button>
            {src.tokenSource === "db" && <Button variant="secondary" size="sm" isDisabled={busy} onPress={reset}>Auf .env zurück</Button>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">Token-Verwaltung im Web nur für football-data.org (aktuelle Quelle: {src.name}).</p>
      )}

      {/* Test result */}
      {probe && (
        <div className={`rounded-lg border p-2.5 text-xs ${probe.ok ? "border-green-600/40 bg-green-500/10 text-green-400" : "border-red-600/40 bg-red-500/10 text-red-400"}`}>
          {probe.ok ? (
            <>✓ Verbindung OK
              {probe.client ? ` · Konto: ${probe.client}` : ""}
              {Number.isFinite(probe.availableMinute) ? ` · ${probe.availableMinute} Requests übrig diese Minute` : ""}
              {Number.isFinite(probe.resetSeconds) ? ` (Reset in ${probe.resetSeconds}s)` : ""}
            </>
          ) : (
            <>✗ {probe.error || "Fehler"}{probe.status ? ` (HTTP ${probe.status})` : ""}</>
          )}
        </div>
      )}
    </div>
  );
}

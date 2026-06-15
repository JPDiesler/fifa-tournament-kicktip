import { useEffect, useState } from "react";
import { Button, TextField, Label, Input, Spinner, Switch, Tooltip } from "@heroui/react";
import { Plug, Check, X, Minus, Clock, RefreshCw } from "lucide-react";
import { getSources, setProviderToken, testProvider, saveRouting } from "./admin.js";

// Capability pills (per provider), in display order.
const PILLS = [
  ["liveScore", "Live-Score"], ["liveMinute", "Live-Spielminute"], ["scorers", "Torschützen"],
  ["cards", "Karten"], ["phase", "Spielphase"], ["results", "Ergebnisse"],
];
const PILL_UI = {
  green: { c: "bg-green-500/15 text-green-400 ring-green-500/30", Icon: Check },
  yellow: { c: "bg-amber-500/15 text-amber-400 ring-amber-500/30", Icon: Clock },
  red: { c: "bg-red-500/15 text-red-400 ring-red-500/30", Icon: X },
  unknown: { c: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30", Icon: Minus },
};
const tri = (v) => (v === true ? "green" : v === false ? "red" : "unknown");
function capState(key, caps) {
  if (!caps) return "unknown";
  if (key === "liveScore") return caps.realtime ? "green" : "yellow";
  return tri(caps[key]);
}
const CAP_DESC = {
  liveScore: "Spielstand während des laufenden Spiels.", liveMinute: "Aktuelle Spielminute im Live-Spiel.",
  scorers: "Torschützen je Spiel.", cards: "Gelbe/Rote Karten je Spiel.",
  phase: "Spielphase: Halbzeit, Verlängerung, Elfmeterschießen.", results: "Endergebnisse der Spiele.",
};
const STATE_MEANING = { green: "verfügbar", yellow: "verfügbar, aber verzögert", red: "nicht im Plan", unknown: "nicht getestet" };
const STATE_PILL = {
  ok: "bg-green-500/15 text-green-400 ring-green-500/30", idle: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  unconfigured: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30", error: "bg-red-500/15 text-red-400 ring-red-500/30",
};
const STATE_LABEL = { ok: "getestet", idle: "konfiguriert", unconfigured: "kein Token", error: "Fehler" };
const FEATURE_LABEL = { results: "Ergebnisse", liveScore: "Live-Score", liveMinute: "Live-Spielminute", phase: "Spielphase", scorers: "Torschützen", cards: "Karten" };

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

const numInput = "rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-foreground";

// One provider card: status, capability pills, token + rate-limit management, test.
function ProviderCard({ src, onChanged, onSaveLimits, onFlash }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState(null);
  const [rate, setRate] = useState(String(src.rateLimitPerMin ?? ""));
  const [daily, setDaily] = useState(src.dailyLimit == null ? "" : String(src.dailyLimit));
  const [delay, setDelay] = useState(String(src.delaySeconds ?? ""));
  const caps = probe?.caps || src.caps || null;
  const perMin = src.rateLimitPerMin;
  const perSec = perMin != null ? (perMin / 60).toFixed(perMin < 60 ? 2 : 1) : "—";

  const saveLimits = async () => {
    setBusy(true);
    try {
      await onSaveLimits({ rateLimit: rate === "" ? undefined : Number(rate), dailyLimit: daily === "" ? null : Number(daily), delaySeconds: delay === "" ? undefined : Number(delay) });
      onFlash?.("Limits gespeichert");
    } catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try { await setProviderToken(src.id, token.trim()); setToken(""); onFlash?.("Token gespeichert"); setProbe(await testProvider(src.id)); await onChanged(); }
    catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };
  const test = async () => { setBusy(true); try { setProbe(await testProvider(src.id)); await onChanged(); } catch (e) { onFlash?.(e.message); } finally { setBusy(false); } };
  const reset = async () => { setBusy(true); try { await setProviderToken(src.id, ""); onFlash?.("Token zurückgesetzt"); setProbe(null); await onChanged(); } catch (e) { onFlash?.(e.message); } finally { setBusy(false); } };

  return (
    <div className="rounded-lg border border-border bg-overlay p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{src.name}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATE_PILL[src.state] || STATE_PILL.idle}`}>
          <span className="inline-block size-1.5 rounded-full bg-current" /> {STATE_LABEL[src.state] || src.state}
        </span>
        {src.feeds?.length > 0 && (
          <span className="ml-auto flex flex-wrap justify-end gap-1">
            {src.feeds.map((f) => <span key={f} className="rounded bg-overlay px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-border">{FEATURE_LABEL[f] || f}</span>)}
          </span>
        )}
      </div>
      <div className="mb-2 text-[11px] text-muted">
        Budget: <span className="text-foreground">{perMin}/min</span> (≈ {perSec}/s · {perMin * 60}/h)
        {src.dailyLimit != null ? <> · <span className="text-foreground">{src.dailyLimit}/Tag</span></> : " · kein Tageslimit"}
        {" · heute "}<span className="text-foreground">{src.usedToday}{src.dailyLimit != null ? `/${src.dailyLimit}` : ""}</span>
        {" · ~"}{src.delaySeconds}s Verzug
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PILLS.map(([key, label]) => <CapPill key={key} capKey={key} state={capState(key, caps)} label={label} />)}
      </div>
      <div className="mb-1.5 text-xs text-muted">
        Token: <span className="tabular-nums text-foreground">{src.tokenMasked || "—"}</span>
        {src.tokenSource === "env" && " · aus .env"}{src.tokenSource === "db" && " · im Web gesetzt"}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <TextField aria-label={`${src.name} Token`} type="password" value={token} onChange={setToken} autoComplete="off" className="min-w-44 flex-1">
          <Label className="text-xs text-muted">Neuer Token / Key</Label>
          <Input placeholder="API-Token einfügen …" />
        </TextField>
        <Button variant="primary" size="sm" isDisabled={busy || !token.trim()} onPress={save}>Speichern</Button>
        <Button variant="secondary" size="sm" isDisabled={busy} onPress={test}><Plug size={14} /> Testen</Button>
        {src.tokenSource === "db" && <Button variant="tertiary" size="sm" isDisabled={busy} onPress={reset}>Zurücksetzen</Button>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted">Rate/min <input type="number" min="1" value={rate} onChange={(e) => setRate(e.target.value)} className={`ml-0.5 w-16 ${numInput}`} /></label>
        <label className="text-[11px] text-muted">Tageslimit <input type="number" min="0" placeholder="kein" value={daily} onChange={(e) => setDaily(e.target.value)} className={`ml-0.5 w-20 ${numInput}`} /></label>
        <label className="text-[11px] text-muted">Verzug/s <input type="number" min="0" value={delay} onChange={(e) => setDelay(e.target.value)} className={`ml-0.5 w-16 ${numInput}`} /></label>
        <Button variant="tertiary" size="sm" isDisabled={busy} onPress={saveLimits}>Limits speichern</Button>
      </div>
      {probe && (
        <div className={`mt-2 rounded-md border p-2 text-xs ${probe.ok ? "border-green-600/40 bg-green-500/10 text-green-400" : "border-red-600/40 bg-red-500/10 text-red-400"}`}>
          {probe.ok ? <>✓ Verbindung OK{probe.client ? ` · Konto: ${probe.client}` : ""}{Number.isFinite(probe.availableMinute) ? ` · ${probe.availableMinute} Requests übrig` : ""}</>
            : <>✗ {probe.error || "Fehler"}{probe.status ? ` (HTTP ${probe.status})` : ""}</>}
        </div>
      )}
    </div>
  );
}

// Feature → primary provider (+ optional fallback to the others).
function RoutingMatrix({ data, onSave, onFlash }) {
  const { sources, features, routing } = data;
  const opts = sources; // all providers selectable (unconfigured ones simply won't deliver)
  const others = (primary) => opts.filter((s) => s.id !== primary).map((s) => s.id);

  const setPrimary = (feat, p) => {
    const fallback = (routing[feat] || []).length > 1;
    update(feat, fallback ? [p, ...others(p)] : [p]);
  };
  const setFallback = (feat, on) => {
    const p = (routing[feat] || [opts[0]?.id])[0];
    update(feat, on ? [p, ...others(p)] : [p]);
  };
  const update = async (feat, list) => {
    try { await onSave({ ...routing, [feat]: list }); } catch (e) { onFlash?.(e.message); }
  };

  return (
    <div className="rounded-lg border border-border">
      {features.map((feat, i) => {
        const list = routing[feat] || [];
        const primary = list[0] || "";
        const fallback = list.length > 1;
        return (
          <div key={feat} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${i ? "border-t border-border" : ""}`}>
            <span className="min-w-28 flex-1 font-medium">{FEATURE_LABEL[feat] || feat}</span>
            <select value={primary} onChange={(e) => setPrimary(feat, e.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground">
              {opts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {opts.length > 1 && (
              <Switch size="sm" aria-label="Fallback" isSelected={fallback} onChange={(v) => setFallback(feat, v)}>
                <Switch.Control><Switch.Thumb /></Switch.Control>
                <Switch.Content><Label className="text-[11px] text-muted">Fallback</Label></Switch.Content>
              </Switch>
            )}
          </div>
        );
      })}
    </div>
  );
}

// "API & Ergebnisse" admin area: manual sync, per-provider token + capabilities,
// and the feature-routing matrix (which provider feeds which feature).
export default function SourcePanel({ onFlash, onSync }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => { try { setData(await getSources()); } catch (e) { onFlash?.(e.message); } };
  useEffect(() => { load(); }, []);

  const runSync = async () => { setBusy(true); try { await onSync?.(); await load(); } finally { setBusy(false); } };
  const onSaveRouting = async (routing) => { await saveRouting({ routing }); await load(); onFlash?.("Routing gespeichert"); };
  const saveProvider = async (id, patch) => {
    const providers = { ...(data.providers || {}) };
    providers[id] = { ...(providers[id] || {}), ...patch };
    await saveRouting({ providers }); await load();
  };
  const savePoll = async (n) => { await saveRouting({ pollSeconds: n }); await load(); onFlash?.("Live-Intervall gespeichert"); };

  if (!data) return <div className="flex items-center gap-2 text-xs text-muted"><Spinner size="sm" /> Lade …</div>;

  const multi = data.sources.length > 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" isDisabled={busy} onPress={runSync}><RefreshCw size={15} /> Synchronisieren</Button>
          <label className="ml-auto text-[11px] text-muted">
            Live-Abruf alle
            <input type="number" min="10" max="600" defaultValue={data.pollSeconds}
              onBlur={(e) => Number(e.target.value) !== data.pollSeconds && savePoll(e.target.value)}
              className={`mx-1 w-16 ${numInput}`} /> Sek
          </label>
        </div>
        {data.effectivePollSeconds != null && data.effectivePollSeconds !== data.pollSeconds && (
          <div className="text-[11px] text-muted">Aktuell dynamisch: ~{data.effectivePollSeconds}s (aus Tagesbudget + Spielplan berechnet)</div>
        )}
        <div className="text-xs text-muted">
          Letzter Poll: <span className="text-foreground">{data.lastSync ? new Date(data.lastSync).toLocaleString("de-DE") : "—"}</span>
          {data.lastSyncMsg && <> · {data.lastSyncMsg}</>}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Datenquellen</div>
        <div className="flex flex-col gap-2">
          {data.sources.map((src) => <ProviderCard key={src.id} src={src} onChanged={load} onSaveLimits={(patch) => saveProvider(src.id, patch)} onFlash={onFlash} />)}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Feature-Routing</div>
        {multi ? (
          <RoutingMatrix data={data} onSave={onSaveRouting} onFlash={onFlash} />
        ) : (
          <p className="rounded-lg border border-border bg-overlay p-3 text-xs text-muted">
            Mit nur einer konfigurierten Quelle liefert sie alle Features. Sobald ein zweiter Provider einen Token hat, kannst du hier pro Feature wählen, welche Quelle es liefert (mit Fallback).
          </p>
        )}
      </div>
    </div>
  );
}

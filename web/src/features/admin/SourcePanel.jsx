import { useRef, useState, useEffect } from "react";
import { Button, TextField, Label, Input, Spinner, Chip, Meter, Disclosure, NumberField, toast } from "@heroui/react";
import { Plug, RefreshCw, RotateCcw } from "lucide-react";
import { getSources, setProviderToken, testProvider, saveSourceConfig, refreshDetails, getRefreshStatus } from "./admin.js";

// Connection state → dot colour + label (single provider, so no capability matrix).
const STATE = {
  ok: { label: "verbunden", dot: "bg-success", text: "text-success" },
  idle: { label: "konfiguriert · ungetestet", dot: "bg-warning", text: "text-warning" },
  unconfigured: { label: "kein API-Key", dot: "bg-muted/50", text: "text-muted" },
  error: { label: "Fehler beim letzten Poll", dot: "bg-danger", text: "text-danger" },
};
const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString("de-DE") : "—");

// The one api-football card: connection status, a daily-budget meter (live quota once
// probed, otherwise our own call counter), and key + rate/daily limits behind "Ändern".
function ProviderCard({ provider, onChanged, onFlash }) {
  const [token, setToken] = useState("");
  const [open, setOpen] = useState(provider.state === "unconfigured"); // expand the key section if none yet
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState(null);
  const [rate, setRate] = useState(String(provider.rateLimitPerMin ?? ""));
  const [daily, setDaily] = useState(provider.dailyLimit == null ? "" : String(provider.dailyLimit));

  const quota = probe?.quota || provider.quota || null;
  const client = probe?.client || provider.client || null;
  const plan = probe?.plan || provider.plan || null;
  const st = STATE[provider.state] || STATE.idle;

  // Daily budget: the API's live quota when we have it (authoritative), else our local
  // per-day call counter vs the configured cap (resets on restart, counts only our calls).
  const liveDay = quota && Number.isFinite(quota.dayLimit);
  const dayLimit = liveDay ? quota.dayLimit : provider.dailyLimit;
  const dayUsed = liveDay
    ? (Number.isFinite(quota.dayUsed) ? quota.dayUsed : Math.max(0, quota.dayLimit - (quota.dayRemaining ?? quota.dayLimit)))
    : provider.usedToday;
  const hasDayCap = Number.isFinite(dayLimit) && dayLimit > 0;
  const pct = hasDayCap ? Math.min(100, Math.round((dayUsed / dayLimit) * 100)) : 0;
  const col = pct >= 90 ? "danger" : pct >= 70 ? "warning" : "success";
  const minLimit = quota?.minuteLimit ?? provider.rateLimitPerMin;
  const minRem = quota?.minuteRemaining;

  const save = async () => {
    setBusy(true);
    try { await setProviderToken(provider.id, token.trim()); setToken(""); const r = await testProvider(provider.id); setProbe(r); onFlash?.(r.ok ? "API-Key gespeichert · verbunden" : "API-Key gespeichert"); await onChanged(); }
    catch (e) { toast.danger(e.message); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const r = await testProvider(provider.id); setProbe(r); toast[r.ok ? "success" : "danger"](r.ok ? `Verbunden${r.client ? ` · ${r.client}` : ""}` : `${r.error || "Fehler"}${r.status ? ` (HTTP ${r.status})` : ""}`); await onChanged(); }
    catch (e) { toast.danger(e.message); } finally { setBusy(false); }
  };
  const reset = async () => { setBusy(true); try { await setProviderToken(provider.id, ""); setProbe(null); onFlash?.("API-Key zurückgesetzt"); await onChanged(); } catch (e) { toast.danger(e.message); } finally { setBusy(false); } };
  const saveLimits = async () => {
    setBusy(true);
    try { await saveSourceConfig({ providers: { [provider.id]: { rateLimit: rate === "" ? undefined : Number(rate), dailyLimit: daily === "" ? null : Number(daily) } } }); onFlash?.("Budget gespeichert"); await onChanged(); }
    catch (e) { toast.danger(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-border bg-overlay p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${st.dot}`} />
        <span className="font-semibold">{provider.name}</span>
        <span className={`text-xs font-medium ${st.text}`}>{st.label}</span>
        {plan && <Chip size="sm" variant="soft">{plan}</Chip>}
        <Button className="ml-auto" variant="secondary" size="sm" isDisabled={busy || !provider.tokenMasked} onPress={test}><Plug size={13} /> Testen</Button>
      </div>
      {client && <div className="mt-0.5 text-[11px] text-muted">Konto: {client}</div>}

      <div className="mt-3">
        {hasDayCap ? (
          <Meter aria-label="Tagesbudget" className="w-full gap-1" value={dayUsed} maxValue={dayLimit} color={col} valueLabel={`${fmtNum(dayUsed)} / ${fmtNum(dayLimit)}`}>
            <div className="flex items-center justify-between text-xs">
              <Label className="text-muted">Tagesbudget{liveDay ? "" : " (lokal gezählt)"}</Label>
              <Meter.Output className="tabular-nums text-foreground" />
            </div>
            <Meter.Track><Meter.Fill /></Meter.Track>
          </Meter>
        ) : (
          <div className="text-xs text-muted">Tagesbudget: <span className="text-foreground">kein Limit</span> · heute {fmtNum(provider.usedToday)}</div>
        )}
        <div className="mt-1 text-[11px] text-muted">
          {Number.isFinite(minRem) ? <>{fmtNum(minRem)}/{fmtNum(minLimit)} Anfragen pro Minute übrig</> : <>{fmtNum(minLimit)} Anfragen/Minute</>}
          {!quota && <> · „Testen" zeigt das Live-Kontingent der API</>}
        </div>
      </div>

      <Disclosure isExpanded={open} onExpandedChange={setOpen} className="mt-3 border-t border-border pt-2">
        <Disclosure.Heading>
          <Disclosure.Trigger className="flex w-full items-center gap-1.5 text-xs text-muted hover:text-foreground">
            <Disclosure.Indicator />
            <span>API-Key {provider.tokenMasked ? <span className="tabular-nums text-foreground">{provider.tokenMasked}</span> : "—"}{provider.tokenSource === "env" ? " · aus .env" : provider.tokenSource === "db" ? " · im Web gesetzt" : ""}</span>
            <span className="ml-auto">{open ? "schließen" : "ändern"}</span>
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <TextField aria-label={`${provider.name} API-Key`} type="password" value={token} onChange={setToken} autoComplete="off" className="min-w-44 flex-1">
                <Label className="text-xs text-muted">Neuer API-Key</Label>
                <Input placeholder="API-Key einfügen …" />
              </TextField>
              <Button variant="primary" size="sm" isDisabled={busy || !token.trim()} onPress={save}>Speichern</Button>
              {provider.tokenSource === "db" && <Button variant="tertiary" size="sm" isDisabled={busy} onPress={reset}>Zurücksetzen</Button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-muted">Rate/min
                <NumberField aria-label="Anfragen pro Minute" minValue={1} value={rate === "" ? NaN : Number(rate)} onChange={(n) => setRate(Number.isNaN(n) ? "" : String(n))} className="w-16">
                  <NumberField.Group><NumberField.Input /></NumberField.Group>
                </NumberField>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted">Tageslimit
                <NumberField aria-label="Tageslimit" minValue={0} value={daily === "" ? NaN : Number(daily)} onChange={(n) => setDaily(Number.isNaN(n) ? "" : String(n))} className="w-24">
                  <NumberField.Group><NumberField.Input placeholder="kein" /></NumberField.Group>
                </NumberField>
              </span>
              <Button variant="tertiary" size="sm" isDisabled={busy} onPress={saveLimits}>Budget speichern</Button>
              <span className="text-[10px] text-muted">steuert den Live-Poll-Takt</span>
            </div>
          </div>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

// "API & Ergebnisse": manual sync, the api-football card (status, budget, key) and a
// background "Details neu laden" with a dismissable, self-updating progress toast.
export default function SourcePanel({ onFlash, onSync }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const reloadingRef = useRef(false);

  const load = async () => { try { setData(await getSources()); } catch (e) { onFlash?.(e.message); } };
  useEffect(() => { load(); }, []);

  const runSync = async () => { setBusy(true); try { await onSync?.(); await load(); } finally { setBusy(false); } };

  // Force re-fetch all finished matches' details in the background, then poll the
  // backend's progress and surface it in one dismissable, self-updating toast.
  const reloadDetails = async () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true; setReloading(true);
    try {
      try { await refreshDetails(); } catch (e) { toast.danger(e?.message || "Neu laden fehlgeschlagen"); return; }
      let id = null, last = "", stop = false;
      const show = (label) => {
        if (label === last) return; last = label;
        if (id) toast.close(id);
        id = toast("Details werden neu geladen …", {
          description: label, isLoading: true, timeout: 0,
          actionProps: { children: "Ausblenden", variant: "tertiary", onPress: () => { stop = true; if (id) toast.close(id); } },
        });
      };
      show("startet …");
      for (let i = 0; i < 600 && !stop; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        let stt; try { stt = await getRefreshStatus(); } catch { continue; }
        if (!stt.running) {
          if (id) toast.close(id);
          toast.success(`Details neu geladen — ${stt.fetched ?? 0} Spiele aktualisiert`);
          await load();
          break;
        }
        show(stt.total ? `${stt.done}/${stt.total} Spiele` : `${stt.fetched ?? 0} Spiele aktualisiert …`);
      }
    } finally { reloadingRef.current = false; setReloading(false); }
  };

  const savePoll = async (n) => { await saveSourceConfig({ pollSeconds: n }); await load(); onFlash?.("Live-Intervall gespeichert"); };

  if (!data) return <div className="flex items-center gap-2 text-xs text-muted"><Spinner size="sm" /> Lade …</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" isDisabled={busy} onPress={runSync}><RefreshCw size={15} /> Synchronisieren</Button>
        <Button variant="tertiary" size="sm" isPending={reloading} isDisabled={reloading} onPress={reloadDetails}><RotateCcw size={15} /> {reloading ? "lädt …" : "Details neu laden"}</Button>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted">
          Live-Abruf alle
          <NumberField aria-label="Live-Abruf-Intervall in Sekunden" minValue={1} maxValue={600} defaultValue={data.pollSeconds} className="w-16">
            <NumberField.Group>
              <NumberField.Input onBlur={(e) => Number(e.target.value) !== data.pollSeconds && savePoll(Number(e.target.value))} />
            </NumberField.Group>
          </NumberField>
          Sek
        </span>
      </div>

      <ProviderCard provider={data.provider} onChanged={load} onFlash={onFlash} />

      <div className="text-[11px] text-muted">
        Letzter Poll: <span className="text-foreground">{data.lastSync ? new Date(data.lastSync).toLocaleString("de-DE") : "—"}</span>
        {data.lastSyncMsg && <> · {data.lastSyncMsg}</>}
        {data.effectivePollSeconds != null && data.effectivePollSeconds !== data.pollSeconds && <> · dynamisch ~{data.effectivePollSeconds}s</>}
        {data.inplayOdds === false && <> · In-Play-Quoten aus</>}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Modal, Button, Spinner } from "@heroui/react";
import { KeyRound, RotateCcw, Plug, AlertTriangle } from "lucide-react";
import ProviderLogo from "@/components/ProviderLogo.jsx";
import Notice from "@/components/Notice.jsx";
import { getAiProviders, setAiProviderKey, testAiProvider, getAiProviderErrors } from "./admin.js";

// ≈ USD per 1M tokens (blended) — a rough cost signal only; edit as prices change.
const PRICES = { anthropic: 9, openai: 6, gemini: 5, mistral: 4 };
const estCost = (provider, tokens) => (PRICES[provider] && tokens ? `≈ $${((tokens / 1e6) * PRICES[provider]).toFixed(2)}` : "—");
const fmtTokens = (t) => (t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(t || 0));
const Stat = ({ label, value, danger }) => (
  <div className="rounded-lg bg-overlay p-1.5 text-center"><div className={`font-bold tabular-nums ${danger ? "text-danger" : ""}`}>{value}</div><div className="text-[10px] text-muted">{label}</div></div>
);

function ProviderCard({ p, onChanged, onFlash, onErrors }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const saveKey = async () => { setBusy(true); try { await setAiProviderKey(p.id, key); setKey(""); onFlash?.(`${p.name}: Key gespeichert`); onChanged(); } catch (e) { onFlash?.(e.message); } finally { setBusy(false); } };
  const clearKey = async () => { try { await setAiProviderKey(p.id, ""); onFlash?.(`${p.name}: Key entfernt`); onChanged(); } catch (e) { onFlash?.(e.message); } };
  const test = async () => { setTesting(true); try { const r = await testAiProvider(p.id); onFlash?.(r.ok ? `${p.name}: Verbindung ok` : `${p.name}: ${r.error || "Fehler"}`); onChanged(); } catch (e) { onFlash?.(e.message); } finally { setTesting(false); } };
  const dot = p.testOk === true ? "bg-success" : p.testOk === false ? "bg-danger" : "bg-muted/40";

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <ProviderLogo provider={p.id} size={22} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-semibold">{p.name}<span className={`size-2 rounded-full ${dot}`} title={p.testOk === true ? "Verbindung ok" : p.testOk === false ? "Verbindung fehlgeschlagen" : "ungetestet"} /></div>
          <div className="truncate text-[11px] text-muted">{p.hasKey ? `Key ${p.masked}` : "kein Key"} · Default {p.defaultModel}</div>
        </div>
        <span className="shrink-0 text-[11px] text-muted">{p.players} Spieler</span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1 text-[11px]">
        <Stat label="Anfragen" value={p.requests} />
        <Stat label="Token" value={fmtTokens(p.tokens)} />
        <Stat label="≈ Kosten" value={estCost(p.id, p.tokens)} />
        <button type="button" onClick={() => onErrors(p)} className="rounded-lg bg-overlay p-1.5 text-center transition hover:ring-1 hover:ring-border">
          <div className={`font-bold tabular-nums ${p.errors ? "text-danger" : ""}`}>{p.errors}</div><div className="text-[10px] text-muted">Fehler</div>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.hasKey ? "neuen Key setzen …" : "API-Key …"}
          className="min-w-[6rem] flex-1 rounded-md border border-border bg-field px-2 py-1 text-xs outline-none transition focus:border-accent" />
        <Button size="sm" variant="secondary" onPress={saveKey} isPending={busy} isDisabled={!key.trim()}><KeyRound size={13} /> Speichern</Button>
        <Button size="sm" variant="secondary" onPress={test} isPending={testing} isDisabled={!p.hasKey}><Plug size={13} /> Testen</Button>
        {p.hasKey && <Button size="sm" variant="ghost" onPress={clearKey} aria-label="Key entfernen"><RotateCcw size={13} /></Button>}
      </div>
    </div>
  );
}

// "Provider" sub-tab: one API key per LLM provider + connection status, usage, est. cost
// and an error log. All AI players of a provider share its key.
export default function ProvidersPanel({ onFlash }) {
  const [providers, setProviders] = useState(null);
  const [err, setErr] = useState("");
  const [errorsFor, setErrorsFor] = useState(null);
  const [errs, setErrs] = useState(null);
  const load = () => getAiProviders().then((d) => { setProviders(d.providers); setErr(""); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const openErrors = async (p) => { setErrorsFor(p); setErrs(null); try { const d = await getAiProviderErrors(p.id); setErrs(d.errors || []); } catch { setErrs([]); } };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">Ein API-Key pro Provider — alle KI-Spieler dieses Providers nutzen denselben Key (verschlüsselt gespeichert).</p>
      <Notice>{err}</Notice>
      {!providers ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {providers.map((p) => <ProviderCard key={p.id} p={p} onChanged={load} onFlash={onFlash} onErrors={openErrors} />)}
        </div>
      )}

      {errorsFor && (
        <Modal.Backdrop isOpen onOpenChange={(o) => !o && setErrorsFor(null)}>
          <Modal.Container placement="center"><Modal.Dialog className="w-full sm:max-w-[520px]">
            <Modal.CloseTrigger />
            <Modal.Header><Modal.Heading className="flex items-center gap-2"><AlertTriangle size={15} /> Fehler · {errorsFor.name}</Modal.Heading></Modal.Header>
            <Modal.Body className="pb-6">
              {errs === null ? <div className="flex justify-center py-6"><Spinner /></div>
                : errs.length === 0 ? <p className="py-4 text-center text-xs text-muted">Keine Fehler protokolliert.</p>
                  : (
                    <ul className="max-h-80 divide-y divide-border overflow-y-auto text-xs">
                      {errs.map((e, i) => (
                        <li key={i} className="py-1.5">
                          <div className="flex justify-between gap-2 text-muted"><span>{e.kuerzel || "—"} · Spiel {e.match_n}{e.model ? ` · ${e.model}` : ""}</span><span className="shrink-0">{new Date(String(e.attempted_at).replace(" ", "T") + "Z").toLocaleString("de-DE")}</span></div>
                          <div className="text-danger">{e.error}</div>
                        </li>
                      ))}
                    </ul>
                  )}
            </Modal.Body>
          </Modal.Dialog></Modal.Container>
        </Modal.Backdrop>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Modal, Button, TextField, Input, Label, Spinner } from "@heroui/react";
import { Pencil, Plug, RotateCcw, AlertTriangle } from "lucide-react";
import ProviderLogo from "@/components/ProviderLogo.jsx";
import DataTable from "@/components/DataTable.jsx";
import Notice from "@/components/Notice.jsx";
import { getAiProviders, setAiProviderKey, testAiProvider, getAiProviderErrors } from "./admin.js";

// ≈ USD per 1M tokens (blended) — a rough cost signal only; edit as prices change.
const PRICES = { anthropic: 9, openai: 6, gemini: 5, mistral: 4 };
const estCost = (provider, tokens) => (PRICES[provider] && tokens ? `≈ $${((tokens / 1e6) * PRICES[provider]).toFixed(2)}` : "—");
const fmtTokens = (t) => (t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : t >= 1e3 ? `${(t / 1e3).toFixed(1)}k` : String(t || 0));
const dotCls = (p) => (p.testOk === true ? "bg-success" : p.testOk === false ? "bg-danger" : "bg-muted/40");

// Set / replace / clear a provider's API key + run a connection test.
function ProviderEditModal({ p, onSaved, onFlash, onClose }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const save = async () => { setBusy(true); try { await setAiProviderKey(p.id, key); onFlash?.(`${p.name}: Key gespeichert`); onSaved(); onClose(); } catch (e) { onFlash?.(e.message); } finally { setBusy(false); } };
  const clear = async () => { try { await setAiProviderKey(p.id, ""); onFlash?.(`${p.name}: Key entfernt`); onSaved(); onClose(); } catch (e) { onFlash?.(e.message); } };
  const test = async () => { setTesting(true); try { const r = await testAiProvider(p.id); onFlash?.(r.ok ? `${p.name}: Verbindung ok` : `${p.name}: ${r.error || "Fehler"}`); onSaved(); } catch (e) { onFlash?.(e.message); } finally { setTesting(false); } };
  return (
    <Modal.Backdrop isOpen onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center"><Modal.Dialog className="w-full sm:max-w-[420px]">
        <Modal.CloseTrigger />
        <Modal.Header><Modal.Heading className="flex items-center gap-2"><ProviderLogo provider={p.id} size={18} /> {p.name}</Modal.Heading></Modal.Header>
        <Modal.Body className="space-y-3 pb-6">
          <div className="text-xs text-muted">{p.hasKey ? `Aktueller Key ${p.masked}` : "Noch kein Key gesetzt"} · Default-Modell {p.defaultModel}</div>
          <TextField value={key} onChange={setKey}>
            <Label className="text-xs text-muted">API-Key {p.hasKey ? "(neuer Key ersetzt den alten)" : "(verschlüsselt gespeichert)"}</Label>
            <Input type="password" placeholder="sk-…" />
          </TextField>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onPress={test} isPending={testing} isDisabled={!p.hasKey}><Plug size={13} /> Verbindung testen</Button>
            {p.hasKey && <Button variant="ghost" size="sm" onPress={clear}><RotateCcw size={13} /> Key entfernen</Button>}
            <div className="ml-auto flex gap-2">
              <Button variant="tertiary" onPress={onClose}>Schließen</Button>
              <Button variant="primary" onPress={save} isPending={busy} isDisabled={!key.trim()}>Speichern</Button>
            </div>
          </div>
        </Modal.Body>
      </Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
  );
}

// "Provider" sub-tab: a table of LLM providers — one API key each, connection status,
// usage, est. cost and an error log. Edit/test per row; tap the error count for details.
export default function ProvidersPanel({ onFlash }) {
  const [providers, setProviders] = useState(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const [errorsFor, setErrorsFor] = useState(null);
  const [errs, setErrs] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const load = () => getAiProviders().then((d) => { setProviders(d.providers); setErr(""); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const openErrors = async (p) => { setErrorsFor(p); setErrs(null); try { const d = await getAiProviderErrors(p.id); setErrs(d.errors || []); } catch { setErrs([]); } };
  const test = async (p) => { setTestingId(p.id); try { const r = await testAiProvider(p.id); onFlash?.(r.ok ? `${p.name}: Verbindung ok` : `${p.name}: ${r.error || "Fehler"}`); load(); } catch (e) { onFlash?.(e.message); } finally { setTestingId(null); } };

  const columns = [
    { key: "provider", header: "Provider", isRowHeader: true, sortable: true, sort: (p) => p.name, render: (p) => <span className="flex items-center gap-2"><ProviderLogo provider={p.id} size={18} /><span className="font-semibold">{p.name}</span><span className="text-[10px] text-muted">{p.defaultModel}</span></span> },
    { key: "status", header: "Status / Key", sortable: true, sort: (p) => (p.testOk === true ? 2 : p.testOk === false ? 0 : 1), render: (p) => <span className="flex items-center gap-1.5 text-xs"><span className={`size-2 shrink-0 rounded-full ${dotCls(p)}`} title={p.testOk === true ? "Verbindung ok" : p.testOk === false ? "Verbindung fehlgeschlagen" : "ungetestet"} />{p.hasKey ? <span className="tabular-nums text-muted">{p.masked}</span> : <span className="text-danger">kein Key</span>}</span> },
    { key: "requests", header: "Anfragen", sortable: true, sort: (p) => p.requests, render: (p) => <span className="tabular-nums">{p.requests}</span> },
    { key: "tokens", header: "Token", sortable: true, sort: (p) => p.tokens, render: (p) => <span className="tabular-nums">{fmtTokens(p.tokens)}</span> },
    { key: "cost", header: "≈ Kosten", sortable: true, sort: (p) => p.tokens, render: (p) => <span className="tabular-nums">{estCost(p.id, p.tokens)}</span> },
    { key: "errors", header: "Fehler", sortable: true, sort: (p) => p.errors, render: (p) => <button type="button" onClick={() => openErrors(p)} className={`tabular-nums underline-offset-2 hover:underline ${p.errors ? "text-danger" : "text-muted"}`}>{p.errors}</button> },
    { key: "players", header: "Spieler", sortable: true, sort: (p) => p.players, render: (p) => <span className="tabular-nums text-muted">{p.players}</span> },
    {
      key: "actions", header: "", render: (p) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="tertiary" isIconOnly aria-label="Bearbeiten" onPress={() => setEditing(p)}><Pencil size={14} /></Button>
          <Button size="sm" variant="tertiary" isIconOnly aria-label="Testen" isPending={testingId === p.id} isDisabled={!p.hasKey} onPress={() => test(p)}><Plug size={14} /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">Ein API-Key pro Provider — alle KI-Spieler dieses Providers nutzen denselben Key (verschlüsselt gespeichert). „Bearbeiten" setzt den Key, die Fehler-Zahl öffnet das Log.</p>
      <Notice>{err}</Notice>
      {!providers ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <DataTable columns={columns} rows={providers} rowKey={(p) => p.id} search={(p) => `${p.name} ${p.id}`} searchPlaceholder="Provider suchen …" ariaLabel="KI-Provider" empty="Keine Provider." />
      )}

      {editing && <ProviderEditModal p={editing} onSaved={load} onFlash={onFlash} onClose={() => setEditing(null)} />}

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

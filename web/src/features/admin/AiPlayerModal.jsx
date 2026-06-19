import { useEffect, useState } from "react";
import { Modal, Button, TextField, Input, Label, Select, ListBox, ComboBox, toast } from "@heroui/react";
import { Play, RotateCcw, Trash2 } from "lucide-react";
import Notice from "@/components/Notice.jsx";
import { createAiPlayer, patchAiPlayer, testAiTip, listAiPredictions, tipNow, resetAiPrediction, fetchAiModels } from "./admin.js";

// ≈ USD per 1M tokens (blended in+out), rough — only a cost signal, edit as prices change.
const PRICES = { anthropic: 9, openai: 6, gemini: 5, mistral: 4 };
const estCost = (provider, avgTokens) => (PRICES[provider] && avgTokens ? `≈ $${((avgTokens / 1e6) * PRICES[provider]).toFixed(4)}/Tipp` : "—");

function Field({ label, ...props }) {
  return (
    <TextField {...props}>
      <Label className="text-xs text-muted">{label}</Label>
      <Input />
    </TextField>
  );
}

// Create OR edit an AI player (same form). `player` set = edit mode (shows diagnostics).
export default function AiPlayerModal({ open, onOpenChange, providers, player, onSaved }) {
  const editing = !!player;
  const [kuerzel, setKuerzel] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState(null);   // null | "testing" | { ok, error, match, tip, prediction }
  const [preds, setPreds] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [models, setModels] = useState([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsErr, setModelsErr] = useState("");

  const refreshPreds = () => { if (player) listAiPredictions(player.id).then((d) => setPreds(d.predictions || [])).catch(() => setPreds([])); };
  useEffect(() => {
    if (!open) return;
    setErr(""); setTip(null); setPreds(null); setModels([]); setModelsErr("");
    if (player) {
      setKuerzel(player.kuerzel || ""); setName(player.name || "");
      setProvider(player.provider || providers?.[0]?.id || ""); setModel(player.model || "");
      refreshPreds();
    } else {
      const first = providers?.[0];
      setKuerzel(""); setName(""); setProvider(first?.id || ""); setModel(first?.defaultModel || "");
    }
  }, [open, player, providers]);

  const id = player?.id || 0;
  const body = { provider, model }; // the API key is per provider (set in the Provider tab)
  const canTest = !!provider;
  const onProvider = (pid) => { setProvider(pid); setModel(providers?.find((x) => x.id === pid)?.defaultModel || ""); setTip(null); setModels([]); setModelsErr(""); };
  const loadModels = async () => {
    setModelsBusy(true); setModelsErr("");
    try { const d = await fetchAiModels(id, body); setModels(d.models || []); }
    catch (e) { setModelsErr(e.message); }
    finally { setModelsBusy(false); }
  };
  const doTip = async () => { setTip("testing"); setErr(""); try { setTip(await testAiTip(id, body)); } catch (e) { setTip({ ok: false, error: e.message }); } };
  const doTipNow = async (matchN) => {
    setDiagBusy(true); setErr("");
    try {
      await toast.promise(tipNow(player.id, matchN), {
        loading: "KI tippt …",
        success: (r) => { const t = r?.prediction; return t?.status === "done" ? `Spiel ${r.matchN}: ${t.tip_h}:${t.tip_a}` : `Spiel ${r.matchN}: kein Tipp${t?.error ? ` (${t.error})` : ""}`; },
        error: (e) => e?.message || "Tippen fehlgeschlagen",
      });
      refreshPreds(); onSaved?.();
    } catch { /* error toast shown */ } finally { setDiagBusy(false); }
  };
  const doReset = async (matchN) => {
    setDiagBusy(true); setErr("");
    try { await resetAiPrediction(player.id, matchN); toast("Versuch zurückgesetzt", { variant: "success" }); refreshPreds(); onSaved?.(); }
    catch (e) { setErr(e.message); } finally { setDiagBusy(false); }
  };
  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (editing) await patchAiPlayer(id, { kuerzel, name, provider, model });
      else await createAiPlayer({ kuerzel, name, provider, model });
      toast(editing ? "KI-Spieler aktualisiert" : "KI-Spieler angelegt", { variant: "success" });
      onSaved?.(); onOpenChange(false);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container placement="center">
        <Modal.Dialog className="w-full sm:max-w-[440px]">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>{editing ? "KI-Spieler bearbeiten" : "KI-Spieler hinzufügen"}</Modal.Heading></Modal.Header>
          <Modal.Body>
            <div className="flex flex-col gap-3">
              <Field label="Kürzel (z. B. CLD) *" value={kuerzel} onChange={setKuerzel} />
              <Field label="Anzeigename" value={name} onChange={setName} />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">Provider *</span>
                <Select aria-label="Provider" placeholder="Provider wählen" value={provider} onChange={(v) => onProvider(String(v))}>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {(providers || []).map((p) => (
                        <ListBox.Item key={p.id} id={p.id} textValue={p.name}>{p.name}<ListBox.ItemIndicator /></ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">Modell</span>
                <div className="flex items-center gap-2">
                  <ComboBox allowsCustomValue allowsEmptyCollection menuTrigger="focus" className="min-w-0 flex-1"
                    inputValue={model} onInputChange={setModel}
                    onSelectionChange={(key) => { if (key != null) setModel(String(key)); }}>
                    <ComboBox.InputGroup>
                      <Input placeholder="wählen oder eingeben …" />
                      <ComboBox.Trigger />
                    </ComboBox.InputGroup>
                    <ComboBox.Popover>
                      <ListBox>
                        {models.map((m) => (
                          <ListBox.Item key={m.id} id={m.id} textValue={m.id}>
                            <span className="flex w-full items-center justify-between gap-2">
                              <span className="min-w-0 truncate">{m.id}</span>
                              <span className="shrink-0 text-[10px] text-muted">{m.contextLimit ? `${Math.round(m.contextLimit / 1000)}k` : ""}</span>
                            </span>
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </ComboBox.Popover>
                  </ComboBox>
                  <Button variant="secondary" size="sm" onPress={loadModels} isDisabled={!canTest || modelsBusy}>
                    {modelsBusy ? "lädt …" : "Modelle laden"}
                  </Button>
                </div>
                {modelsErr ? <span className="text-[11px] text-danger">{modelsErr}</span>
                  : models.length > 0 ? <span className="text-[11px] text-muted">{models.length} Modelle · Pfeil-Button öffnet die Liste</span> : null}
              </div>
              <p className="text-[11px] text-muted">Der API-Key wird pro Provider im Tab „Provider" gesetzt — hier wählst du nur Provider + Modell.</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onPress={doTip} isDisabled={!canTest || tip === "testing"}>
                  {tip === "testing" ? "Tippt …" : "Echter Test (nächstes Spiel)"}
                </Button>
              </div>
              {tip && tip !== "testing" && (tip.ok ? (
                <div className="rounded-lg border border-border bg-overlay p-2 text-xs">
                  <div className="font-semibold">Spiel {tip.match?.n}: {tip.match?.home?.name} – {tip.match?.away?.name}
                    <span className="ml-1 tabular-nums text-app-accent">{tip.tip?.h}:{tip.tip?.a}</span></div>
                  {tip.prediction?.reasoning && <div className="mt-1 text-muted">{tip.prediction.reasoning}</div>}
                </div>
              ) : <div className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-danger">✗ {tip.error || "Test fehlgeschlagen"}</div>)}
              {editing && (
                <div className="rounded-lg border border-border bg-overlay p-2 text-xs">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">Diagnose</span>
                    <span className="text-muted">Tipps {player.done}/{player.total}</span>
                    <span className="text-muted">Ø {player.avgTokens || 0} Tok</span>
                    <span className="text-muted">Ø {player.avgLatency || 0} ms</span>
                    <span className="text-muted">{estCost(provider, player.avgTokens)}</span>
                    <Button variant="secondary" size="sm" className="ml-auto" onPress={() => doTipNow()} isDisabled={diagBusy}>
                      <Play size={12} /> Jetzt tippen
                    </Button>
                  </div>
                  {player.lastError && <div className="mb-2 truncate text-danger" title={player.lastError}>Letzter Fehler (Spiel {player.lastErrorMatch}): {player.lastError}</div>}
                  {preds === null ? <div className="text-muted">lädt …</div>
                    : preds.length === 0 ? <div className="text-muted">Noch keine Tipps.</div>
                    : (
                      <ul className="max-h-40 divide-y divide-border overflow-y-auto">
                        {preds.map((p) => (
                          <li key={p.match_n} className="flex items-center gap-2 py-1">
                            <span className="w-10 shrink-0 text-muted">Sp {p.match_n}</span>
                            <span className={`shrink-0 tabular-nums ${p.status === "done" ? "text-success" : p.status === "failed" ? "text-danger" : "text-muted"}`}>
                              {p.status === "done" ? `${p.tip_h}:${p.tip_a}` : p.status === "failed" ? "Fehler" : "offen"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-muted" title={p.error || ""}>{p.error || ""}</span>
                            <Button aria-label="Neu tippen" variant="tertiary" size="sm" isIconOnly isDisabled={diagBusy} onPress={() => doTipNow(p.match_n)}><RotateCcw size={12} /></Button>
                            <Button aria-label="Zurücksetzen" variant="tertiary" size="sm" isIconOnly isDisabled={diagBusy} onPress={() => doReset(p.match_n)}><Trash2 size={12} /></Button>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
              <Notice>{err}</Notice>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">Abbrechen</Button>
            <Button variant="primary" onPress={submit} isPending={busy} isDisabled={!kuerzel || !provider}>{editing ? "Speichern" : "Anlegen"}</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

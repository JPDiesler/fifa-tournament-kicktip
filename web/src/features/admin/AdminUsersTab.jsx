import { useEffect, useState } from "react";
import { Table, Button, Switch, Chip, Modal, TextField, Input, Label, Spinner } from "@heroui/react";
import { UserPlus, Users as UsersIcon, FileDown, KeyRound, Trash2, Pencil, Bot, Play, RotateCcw } from "lucide-react";
import { listUsers, createBasic, createEntra, patchUser, resetPassword, deleteUser, downloadCredentialsPdf, listAiPlayers, createAiPlayer, patchAiPlayer, testAiPlayer, testAiTip, listAiPredictions, tipNow, resetAiPrediction, setAiConfig } from "./admin.js";
import ProviderLogo from "@/components/ProviderLogo.jsx";
import { fetchEntraUsers } from "@/features/auth/msal.js";

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

// --- create a basic user (auto password → credentials PDF) ---
function BasicModal({ open, onOpenChange, onCreated }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [kuerzel, setKuerzel] = useState("");
  const [created, setCreated] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setUsername(""); setName(""); setKuerzel(""); setCreated(null); setErr(""); setBusy(false); };
  const submit = async () => {
    setErr(""); setBusy(true);
    try { const res = await createBasic({ username, name, kuerzel }); setCreated(res); onCreated?.(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <Modal.Container placement="center">
        <Modal.Dialog className="w-full sm:max-w-[420px]">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>Basic-Nutzer anlegen</Modal.Heading></Modal.Header>
          <Modal.Body>
            {created ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-muted">Zugangsdaten erstellt. Das Passwort ist nur jetzt sichtbar:</p>
                <div className="rounded-lg border border-border bg-overlay p-3 font-mono text-sm">
                  <div>Benutzer: <b>{created.user.username}</b></div>
                  <div>Passwort: <b>{created.password}</b></div>
                  {created.user.kuerzel && <div>Kürzel: <b>{created.user.kuerzel}</b></div>}
                </div>
                <Button variant="primary" onPress={() => downloadCredentialsPdf(created.user.id, created.user.username)}>
                  <FileDown size={16} /> Zugangsdaten-PDF herunterladen
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Field label="Benutzername *" value={username} onChange={setUsername} />
                <Field label="Name" value={name} onChange={setName} />
                <Field label="Kürzel (z. B. JP)" value={kuerzel} onChange={setKuerzel} />
                {err && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            {created ? (
              <Button slot="close" variant="primary">Fertig</Button>
            ) : (
              <>
                <Button slot="close" variant="secondary">Abbrechen</Button>
                <Button variant="primary" onPress={submit} isPending={busy} isDisabled={!username}>Anlegen</Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

// --- pick a user from the Entra directory (delegated Graph, no secret) ---
function EntraModal({ open, onOpenChange, onCreated }) {
  const [people, setPeople] = useState(null); // null = loading
  const [redirecting, setRedirecting] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [kuerzel, setKuerzel] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPeople(null); setRedirecting(false); setSelected(null); setKuerzel(""); setErr(""); setFilter("");
    fetchEntraUsers()
      .then((u) => { if (u === null) setRedirecting(true); else setPeople(u); }) // null = redirecting to Microsoft
      .catch((e) => { setErr(e.message); setPeople([]); });
  }, [open]);

  const list = (people || []).filter((p) => {
    const q = filter.toLowerCase();
    return !q || (p.displayName || "").toLowerCase().includes(q) || (p.userPrincipalName || "").toLowerCase().includes(q);
  });

  const submit = async () => {
    if (!selected) return;
    setErr(""); setBusy(true);
    try {
      await createEntra({ oid: selected.id, upn: selected.userPrincipalName, name: selected.displayName, kuerzel });
      onCreated?.(); onOpenChange(false);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container placement="center">
        <Modal.Dialog className="w-full sm:max-w-[460px]">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>Aus Entra-Verzeichnis wählen</Modal.Heading></Modal.Header>
          <Modal.Body>
            {redirecting ? (
              <div className="flex flex-col items-center gap-2 py-6 text-muted">
                <Spinner /> <span className="text-xs">Weiterleitung zur Microsoft-Anmeldung …</span>
              </div>
            ) : people === null ? (
              <div className="flex flex-col items-center gap-2 py-6 text-muted">
                <Spinner /> <span className="text-xs">Verzeichnis wird geladen …</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Field label="Suche" value={filter} onChange={setFilter} />
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                  {list.length === 0 && <div className="p-3 text-xs text-muted">Keine Nutzer gefunden.</div>}
                  {list.slice(0, 200).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setSelected(p); if (!kuerzel) setKuerzel((p.displayName || "").slice(0, 3).toUpperCase()); }}
                      className={`block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface ${selected?.id === p.id ? "bg-accent/10" : ""}`}
                    >
                      <div className="font-semibold">{p.displayName}</div>
                      <div className="text-xs text-muted">{p.userPrincipalName || p.mail}</div>
                    </button>
                  ))}
                </div>
                {selected && <Field label="Kürzel" value={kuerzel} onChange={setKuerzel} />}
                {err && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">Abbrechen</Button>
            <Button variant="primary" onPress={submit} isPending={busy} isDisabled={!selected}>Anlegen</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function EditModal({ user, onOpenChange, onSaved }) {
  const [name, setName] = useState(user?.name || "");
  const [kuerzel, setKuerzel] = useState(user?.kuerzel || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(user?.name || ""); setKuerzel(user?.kuerzel || ""); setErr(""); }, [user]);
  const submit = async () => {
    setErr(""); setBusy(true);
    try { await patchUser(user.id, { name, kuerzel }); onSaved?.(); onOpenChange(false); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal.Backdrop isOpen={!!user} onOpenChange={onOpenChange}>
      <Modal.Container placement="center">
        <Modal.Dialog className="w-full sm:max-w-[380px]">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>Nutzer bearbeiten</Modal.Heading></Modal.Header>
          <Modal.Body>
            <div className="flex flex-col gap-3">
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Kürzel" value={kuerzel} onChange={setKuerzel} />
              {err && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">Abbrechen</Button>
            <Button variant="primary" onPress={submit} isPending={busy}>Speichern</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

// --- create OR edit an AI player (same form). `player` set = edit mode. ---
function AiPlayerModal({ open, onOpenChange, providers, player, onSaved }) {
  const editing = !!player;
  const [kuerzel, setKuerzel] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState(null); // null | "testing" | { ok, error }
  const [tip, setTip] = useState(null);   // null | "testing" | { ok, error, match, tip, prediction }
  const [preds, setPreds] = useState(null);
  const [diagBusy, setDiagBusy] = useState(false);

  const refreshPreds = () => { if (player) listAiPredictions(player.id).then((d) => setPreds(d.predictions || [])).catch(() => setPreds([])); };
  useEffect(() => {
    if (!open) return;
    setErr(""); setConn(null); setTip(null); setApiKey(""); setPreds(null);
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
  const body = { provider, model, apiKey }; // apiKey "" in edit → server uses the stored key
  const canTest = !!provider && (editing || !!apiKey);
  const onProvider = (pid) => { setProvider(pid); setModel(providers?.find((x) => x.id === pid)?.defaultModel || ""); setConn(null); setTip(null); };
  const doConn = async () => { setConn("testing"); setErr(""); try { setConn(await testAiPlayer(id, body)); } catch (e) { setConn({ ok: false, error: e.message }); } };
  const doTip = async () => { setTip("testing"); setErr(""); try { setTip(await testAiTip(id, body)); } catch (e) { setTip({ ok: false, error: e.message }); } };
  const doTipNow = async (matchN) => { setDiagBusy(true); setErr(""); try { await tipNow(player.id, matchN); refreshPreds(); onSaved?.(); } catch (e) { setErr(e.message); } finally { setDiagBusy(false); } };
  const doReset = async (matchN) => { setDiagBusy(true); setErr(""); try { await resetAiPrediction(player.id, matchN); refreshPreds(); onSaved?.(); } catch (e) { setErr(e.message); } finally { setDiagBusy(false); } };
  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (editing) await patchAiPlayer(id, { kuerzel, name, provider, model, ...(apiKey ? { apiKey } : {}) });
      else await createAiPlayer({ kuerzel, name, provider, model, apiKey });
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
                <select value={provider} onChange={(e) => onProvider(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                  {(providers || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <Field label="Modell" value={model} onChange={setModel} />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">API-Key {editing ? "(leer lassen = unverändert)" : "* (verschlüsselt, nie wieder sichtbar)"}</span>
                <TextField value={apiKey} onChange={setApiKey}><Input type="password" placeholder={editing ? "••••••••" : "sk-…"} /></TextField>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onPress={doConn} isDisabled={!canTest || conn === "testing"}>
                  {conn === "testing" ? "Teste …" : "Verbindung testen"}
                </Button>
                <Button variant="secondary" size="sm" onPress={doTip} isDisabled={!canTest || tip === "testing"}>
                  {tip === "testing" ? "Tippt …" : "Echter Test (nächstes Spiel)"}
                </Button>
                {conn && conn !== "testing" && (conn.ok
                  ? <span className="text-xs text-success">✓ Verbindung ok</span>
                  : <span className="min-w-0 truncate text-xs text-danger">✗ {conn.error || "Fehler"}</span>)}
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
              {err && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">Abbrechen</Button>
            <Button variant="primary" onPress={submit} isPending={busy} isDisabled={!kuerzel || !provider || (!editing && !apiKey)}>{editing ? "Speichern" : "Anlegen"}</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export default function AdminUsersTab({ entra, meId, onFlash, autoOpenEntra }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState("");
  const [basicOpen, setBasicOpen] = useState(false);
  const [entraOpen, setEntraOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState(undefined); // undefined=closed | null=create | player=edit
  const [providers, setProviders] = useState([]);
  const [aiInfo, setAiInfo] = useState({}); // id → { testOk, done, total, … }
  const [reasoningMode, setReasoningMode] = useState("kickoff");
  const [edit, setEdit] = useState(null);

  const reload = async () => { try { setUsers(await listUsers()); setErr(""); } catch (e) { setErr(e.message); } };
  const loadAi = async () => {
    try {
      const d = await listAiPlayers();
      setProviders(d.providers || []);
      setAiInfo(Object.fromEntries((d.players || []).map((p) => [p.id, p])));
      setReasoningMode(d.config?.reasoningVisibleAfter || "kickoff");
    } catch { /* admin-only, ignore */ }
  };
  useEffect(() => { reload(); loadAi(); }, []);
  // Resume the Entra picker after a Microsoft redirect round-trip.
  useEffect(() => { if (autoOpenEntra) setEntraOpen(true); }, [autoOpenEntra]);

  const flash = (m) => onFlash?.(m);
  const toggle = async (u, field, val) => { try { await patchUser(u.id, { [field]: val }); reload(); } catch (e) { setErr(e.message); reload(); } };
  const onDelete = async (u) => {
    if (!window.confirm(`Nutzer „${u.kuerzel || u.username || u.upn}" wirklich löschen?`)) return;
    try { await deleteUser(u.id); flash("Nutzer gelöscht"); reload(); } catch (e) { setErr(e.message); }
  };
  const onReset = async (u) => {
    try { await resetPassword(u.id); await downloadCredentialsPdf(u.id, u.username); flash("Neues Passwort – PDF geladen"); }
    catch (e) { setErr(e.message); }
  };
  const onPdf = async (u) => { try { await downloadCredentialsPdf(u.id, u.username); } catch (e) { setErr(e.message); } };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-bold uppercase tracking-wider text-muted">Benutzerverwaltung</h2>
        <Button variant="primary" size="sm" onPress={() => setBasicOpen(true)}><UserPlus size={15} /> Basic anlegen</Button>
        {entra && <Button variant="secondary" size="sm" onPress={() => setEntraOpen(true)}><UsersIcon size={15} /> Aus Entra wählen</Button>}
        <Button variant="secondary" size="sm" onPress={() => setAiTarget(null)}><Bot size={15} /> KI-Spieler</Button>
        <label className="flex items-center gap-1 text-xs text-muted">
          KI-Begründung ab
          <select value={reasoningMode}
            onChange={async (e) => { const v = e.target.value; setReasoningMode(v); try { await setAiConfig({ reasoningVisibleAfter: v }); } catch (err) { setErr(err.message); } }}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
            <option value="kickoff">Anpfiff</option>
            <option value="lock">Tipp-Sperre</option>
          </select>
        </label>
      </div>

      {err && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}

      {users === null ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <Table variant="primary" aria-label="Benutzer">
          <Table.ScrollContainer>
            <Table.Content aria-label="Benutzer">
              <Table.Header>
                <Table.Column isRowHeader>Kürzel</Table.Column>
                <Table.Column>Name / Login</Table.Column>
                <Table.Column>Typ</Table.Column>
                <Table.Column>Admin</Table.Column>
                <Table.Column>Aktiv</Table.Column>
                <Table.Column>Aktionen</Table.Column>
              </Table.Header>
              <Table.Body>
                {users.map((u) => (
                  <Table.Row key={u.id} id={String(u.id)}>
                    <Table.Cell>
                      {u.kuerzel ? <Chip size="sm" variant="soft">{u.kuerzel}</Chip> : <span className="text-muted">—</span>}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="font-semibold">{u.name || "—"}</div>
                      <div className="text-xs text-muted">{u.username || u.upn}</div>
                    </Table.Cell>
                    <Table.Cell>
                      {u.isAi ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="flex items-center gap-1 text-muted"><ProviderLogo provider={u.aiProvider} size={12} /> {u.aiProvider || "?"}</span>
                          {aiInfo[u.id] && (
                            <span className="flex items-center gap-1.5" title={aiInfo[u.id].testOk === true ? "Verbindung ok" : aiInfo[u.id].testOk === false ? "Verbindung fehlgeschlagen" : "ungetestet"}>
                              <span className={`size-2 rounded-full ${aiInfo[u.id].testOk === true ? "bg-success" : aiInfo[u.id].testOk === false ? "bg-danger" : "bg-muted/40"}`} />
                              <span className="tabular-nums text-muted">{aiInfo[u.id].done}/{aiInfo[u.id].total}</span>
                            </span>
                          )}
                        </div>
                      ) : <span className="text-xs text-muted">{u.kind === "entra" ? "Entra" : "Basic"}</span>}
                    </Table.Cell>
                    <Table.Cell>
                      <Switch size="sm" aria-label="Admin" isSelected={u.isAdmin} isDisabled={u.id === meId} onChange={(v) => toggle(u, "is_admin", v)}>
                        <Switch.Control><Switch.Thumb /></Switch.Control>
                      </Switch>
                    </Table.Cell>
                    <Table.Cell>
                      <Switch size="sm" aria-label="Aktiv" isSelected={u.isActive} isDisabled={u.id === meId} onChange={(v) => toggle(u, "is_active", v)}>
                        <Switch.Control><Switch.Thumb /></Switch.Control>
                      </Switch>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-1">
                        <Button aria-label="Bearbeiten" variant="tertiary" size="sm" isIconOnly
                          onPress={() => (u.isAi ? setAiTarget(aiInfo[u.id] || { id: u.id, kuerzel: u.kuerzel, name: u.name, provider: u.aiProvider, model: u.aiModel }) : setEdit(u))}><Pencil size={14} /></Button>
                        {u.kind === "basic" && (
                          <>
                            <Button aria-label="PDF" variant="tertiary" size="sm" isIconOnly onPress={() => onPdf(u)}><FileDown size={14} /></Button>
                            <Button aria-label="Passwort zurücksetzen" variant="tertiary" size="sm" isIconOnly onPress={() => onReset(u)}><KeyRound size={14} /></Button>
                          </>
                        )}
                        <Button aria-label="Löschen" variant="tertiary" size="sm" isIconOnly isDisabled={u.id === meId} onPress={() => onDelete(u)}><Trash2 size={14} /></Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      <BasicModal open={basicOpen} onOpenChange={setBasicOpen} onCreated={reload} />
      {entra && <EntraModal open={entraOpen} onOpenChange={setEntraOpen} onCreated={reload} />}
      <AiPlayerModal open={aiTarget !== undefined} player={aiTarget || null} providers={providers}
        onOpenChange={(o) => !o && setAiTarget(undefined)} onSaved={() => { reload(); loadAi(); }} />
      <EditModal user={edit} onOpenChange={(o) => !o && setEdit(null)} onSaved={reload} />
    </div>
  );
}

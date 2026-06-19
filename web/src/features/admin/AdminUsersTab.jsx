import { useEffect, useState } from "react";
import { Button, Switch, Chip, Modal, TextField, Input, Label, Spinner, AlertDialog } from "@heroui/react";
import { UserPlus, Users as UsersIcon, FileDown, KeyRound, Trash2, Pencil } from "lucide-react";
import Notice from "@/components/Notice.jsx";
import DataTable from "@/components/DataTable.jsx";
import { listUsers, createBasic, createEntra, patchUser, resetPassword, deleteUser, downloadCredentialsPdf } from "./admin.js";
import { fetchEntraUsers } from "@/features/auth/msal.js";

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
                <Notice>{err}</Notice>
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
                <Notice>{err}</Notice>
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
              <Notice>{err}</Notice>
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

// Human user management (Basic + Entra). AI players are managed in the "KI" tab.
export default function AdminUsersTab({ entra, meId, onFlash, autoOpenEntra }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState("");
  const [basicOpen, setBasicOpen] = useState(false);
  const [entraOpen, setEntraOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const reload = async () => { try { setUsers(await listUsers()); setErr(""); } catch (e) { setErr(e.message); } };
  useEffect(() => { reload(); }, []);
  // Resume the Entra picker after a Microsoft redirect round-trip.
  useEffect(() => { if (autoOpenEntra) setEntraOpen(true); }, [autoOpenEntra]);

  const flash = (m) => onFlash?.(m);
  const toggle = async (u, field, val) => { try { await patchUser(u.id, { [field]: val }); reload(); } catch (e) { setErr(e.message); reload(); } };
  const doDelete = async (u) => { try { await deleteUser(u.id); flash("Nutzer gelöscht"); reload(); } catch (e) { setErr(e.message); } };
  const onReset = async (u) => {
    try { await resetPassword(u.id); await downloadCredentialsPdf(u.id, u.username); flash("Neues Passwort – PDF geladen"); }
    catch (e) { setErr(e.message); }
  };
  const onPdf = async (u) => { try { await downloadCredentialsPdf(u.id, u.username); } catch (e) { setErr(e.message); } };

  const humans = (users || []).filter((u) => !u.isAi); // AI players live in the "KI" tab

  const columns = [
    { key: "kuerzel", header: "Kürzel", sortable: true, sort: (u) => u.kuerzel || "", render: (u) => (u.kuerzel ? <Chip size="sm" variant="soft">{u.kuerzel}</Chip> : <span className="text-muted">—</span>) },
    { key: "name", header: "Name / Login", isRowHeader: true, sortable: true, sort: (u) => u.name || u.username || u.upn || "", render: (u) => (<div><div className="font-semibold">{u.name || "—"}</div><div className="text-xs text-muted">{u.username || u.upn}</div></div>) },
    {
      key: "kind", header: "Typ", sortable: true, sort: (u) => u.kind,
      filter: { label: "Typ", options: [{ value: "basic", label: "Basic" }, { value: "entra", label: "Entra" }], match: (u, v) => u.kind === v },
      render: (u) => <span className="text-xs text-muted">{u.kind === "entra" ? "Entra" : "Basic"}</span>,
    },
    { key: "admin", header: "Admin", render: (u) => <Switch size="sm" aria-label="Admin" isSelected={u.isAdmin} isDisabled={u.id === meId} onChange={(v) => toggle(u, "is_admin", v)}><Switch.Control><Switch.Thumb /></Switch.Control></Switch> },
    { key: "active", header: "Aktiv", render: (u) => <Switch size="sm" aria-label="Aktiv" isSelected={u.isActive} isDisabled={u.id === meId} onChange={(v) => toggle(u, "is_active", v)}><Switch.Control><Switch.Thumb /></Switch.Control></Switch> },
    {
      key: "actions", header: "Aktionen", render: (u) => (
        <div className="flex items-center gap-1">
          <Button aria-label="Bearbeiten" variant="tertiary" size="sm" isIconOnly onPress={() => setEdit(u)}><Pencil size={14} /></Button>
          {u.kind === "basic" && (
            <>
              <Button aria-label="PDF" variant="tertiary" size="sm" isIconOnly onPress={() => onPdf(u)}><FileDown size={14} /></Button>
              <Button aria-label="Passwort zurücksetzen" variant="tertiary" size="sm" isIconOnly onPress={() => onReset(u)}><KeyRound size={14} /></Button>
            </>
          )}
          <AlertDialog>
            <Button aria-label="Löschen" variant="tertiary" size="sm" isIconOnly isDisabled={u.id === meId}><Trash2 size={14} /></Button>
            <AlertDialog.Backdrop>
              <AlertDialog.Container>
                <AlertDialog.Dialog className="sm:max-w-[400px]">
                  <AlertDialog.CloseTrigger />
                  <AlertDialog.Header>
                    <AlertDialog.Icon status="danger" />
                    <AlertDialog.Heading>Nutzer löschen?</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body>
                    <p>„{u.kuerzel || u.username || u.upn}" wird dauerhaft gelöscht (inkl. aller Tipps). Das lässt sich nicht rückgängig machen.</p>
                  </AlertDialog.Body>
                  <AlertDialog.Footer>
                    <Button slot="close" variant="tertiary">Abbrechen</Button>
                    <Button slot="close" variant="danger" onPress={() => doDelete(u)}>Löschen</Button>
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-bold uppercase tracking-wider text-muted">Benutzerverwaltung</h2>
        <Button variant="primary" size="sm" onPress={() => setBasicOpen(true)}><UserPlus size={15} /> Basic anlegen</Button>
        {entra && <Button variant="secondary" size="sm" onPress={() => setEntraOpen(true)}><UsersIcon size={15} /> Aus Entra wählen</Button>}
      </div>

      <Notice>{err}</Notice>

      {users === null ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <DataTable columns={columns} rows={humans} rowKey={(u) => String(u.id)}
          search={(u) => `${u.kuerzel || ""} ${u.name || ""} ${u.username || ""} ${u.upn || ""}`}
          searchPlaceholder="Nutzer suchen …" ariaLabel="Benutzer" empty="Keine Nutzer." />
      )}

      <BasicModal open={basicOpen} onOpenChange={setBasicOpen} onCreated={reload} />
      {entra && <EntraModal open={entraOpen} onOpenChange={setEntraOpen} onCreated={reload} />}
      <EditModal user={edit} onOpenChange={(o) => !o && setEdit(null)} onSaved={reload} />
    </div>
  );
}

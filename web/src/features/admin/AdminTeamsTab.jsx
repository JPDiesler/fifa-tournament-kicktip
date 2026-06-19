import { useEffect, useRef, useState } from "react";
import { Modal, Button, TextField, Input, Label } from "@heroui/react";
import { Upload, RotateCcw, Pencil } from "lucide-react";
import { TEAMS } from "@/data";
import Flag from "@/components/Flag.jsx";
import TeamLogo from "@/components/TeamLogo.jsx";
import DataTable from "@/components/DataTable.jsx";
import { NICKNAMES } from "@/lib/teamNicknames.js";
import { getTeamOverrides, setTeamOverride } from "./admin.js";

const MAX = 500 * 1024; // 500 KB
const OK = /^image\/(svg\+xml|png|jpeg|webp)$/;

// Edit one team: upload/reset the federation logo (click or drag & drop) + edit the
// nickname. Logo changes apply immediately; the nickname saves on "Speichern".
function TeamEditModal({ team, onSaved, onFlash, onClose }) {
  const fileRef = useRef(null);
  const [nick, setNick] = useState(team.override?.nickname || "");
  const [hasLogo, setHasLogo] = useState(!!team.override?.hasLogo);
  const [nonce, setNonce] = useState(0); // bust the logo preview after an upload
  const [busy, setBusy] = useState(false);
  const logoUrl = hasLogo ? `/api/team-logo/${team.code}?v=${nonce}` : undefined;

  const upload = async (file) => {
    if (!file) return;
    if (!OK.test(file.type)) return onFlash?.("Nur PNG / SVG / WEBP");
    if (file.size > MAX) return onFlash?.("Logo zu groß (max 500 KB)");
    setBusy(true);
    try {
      const uri = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await setTeamOverride(team.code, { logo: uri });
      onSaved(r.overrides); setHasLogo(true); setNonce((n) => n + 1); onFlash?.(`${team.name}: Logo gespeichert`);
    } catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };
  const clearLogo = async () => { try { const r = await setTeamOverride(team.code, { logo: null }); onSaved(r.overrides); setHasLogo(false); onFlash?.(`${team.name}: Logo zurückgesetzt`); } catch (e) { onFlash?.(e.message); } };
  const save = async () => {
    const v = nick.trim();
    if ((v || null) !== (team.override?.nickname || null)) {
      try { const r = await setTeamOverride(team.code, { nickname: v }); onSaved(r.overrides); onFlash?.(`${team.name}: gespeichert`); }
      catch (e) { return onFlash?.(e.message); }
    }
    onClose();
  };

  return (
    <Modal.Backdrop isOpen onOpenChange={(o) => !o && onClose()}>
      <Modal.Container placement="center">
        <Modal.Dialog className="w-full sm:max-w-[420px]">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading className="flex items-center gap-2"><Flag code={team.code} sm /> {team.name} <span className="text-xs font-normal text-muted">{team.code}</span></Modal.Heading></Modal.Header>
          <Modal.Body className="space-y-4 pb-6">
            <div className="flex items-center gap-3">
              <button type="button" title="Logo hochladen (Klick oder Drag & Drop)" onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
                className="relative shrink-0 rounded-xl p-1.5 ring-1 ring-border transition hover:ring-app-accent">
                <TeamLogo key={logoUrl || team.code} code={team.code} logo={logoUrl} name={team.name} className="size-16" />
                <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-app-accent text-accent-foreground"><Upload size={11} /></span>
                {busy && <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-overlay/70">…</span>}
              </button>
              <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">Verbandslogo</div>
                <div className="text-xs text-muted">Klick oder Drag &amp; Drop · PNG/SVG/WEBP, max 500 KB</div>
                {hasLogo && <Button size="sm" variant="ghost" className="mt-1" onPress={clearLogo}><RotateCcw size={13} /> Zurücksetzen</Button>}
              </div>
            </div>

            <TextField value={nick} onChange={setNick}>
              <Label className="text-xs text-muted">Spitzname</Label>
              <Input placeholder={NICKNAMES[team.code] || "Spitzname"} maxLength={60} />
            </TextField>

            <div className="flex justify-end gap-2">
              <Button variant="tertiary" onPress={onClose}>Abbrechen</Button>
              <Button variant="primary" onPress={save}>Speichern</Button>
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

// Admin "Mannschaften" tab: a table of all teams; edit nickname + federation-logo
// override (resettable to the build-seeded default) via a per-row edit dialog.
export default function AdminTeamsTab({ onFlash }) {
  const [overrides, setOverrides] = useState({});
  const [bust, setBust] = useState(0);
  const [editing, setEditing] = useState(null); // team row being edited, or null
  useEffect(() => { getTeamOverrides().then((o) => { setOverrides(o); setBust(1); }).catch((e) => onFlash?.(e.message)); }, [onFlash]);
  const onSaved = (o) => { setOverrides(o || {}); setBust((b) => b + 1); };

  const rows = Object.entries(TEAMS).map(([code, t]) => ({ code, name: t.name, override: overrides[code], nickname: overrides[code]?.nickname || NICKNAMES[code] || "" }));

  const columns = [
    { key: "logo", header: "Logo", render: (row) => <TeamLogo key={`${row.code}-${bust}-${row.override?.hasLogo}`} code={row.code} logo={row.override?.hasLogo ? `/api/team-logo/${row.code}?v=${bust}` : undefined} name={row.name} className="size-9" /> },
    {
      key: "team", header: "Mannschaft", isRowHeader: true, sortable: true, sort: (row) => row.name,
      filter: {
        label: "Status",
        options: [{ value: "override", label: "mit Override" }, { value: "logo", label: "eigenes Logo" }, { value: "plain", label: "ohne Override" }],
        match: (row, v) => v === "logo" ? !!row.override?.hasLogo : v === "override" ? !!(row.override?.nickname || row.override?.hasLogo) : !(row.override?.nickname || row.override?.hasLogo),
      },
      render: (row) => <span className="flex items-center gap-2"><Flag code={row.code} sm /><span className="truncate font-semibold">{row.name}</span><span className="text-xs text-muted">{row.code}</span></span>,
    },
    { key: "nick", header: "Spitzname", sortable: true, sort: (row) => row.nickname, render: (row) => <span className={row.override?.nickname ? "" : "text-muted"}>{row.nickname || "—"}</span> },
    { key: "actions", header: "", render: (row) => <Button size="sm" variant="ghost" onPress={() => setEditing(row)} aria-label={`${row.name} bearbeiten`}><Pencil size={13} /> Bearbeiten</Button> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Mannschaften</h2>
        <span className="text-xs text-muted">Spitzname + Verbandslogo je Team überschreiben das Default.</span>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.code} search={(r) => `${r.name} ${r.code} ${r.nickname}`}
        searchPlaceholder="Mannschaft suchen …" ariaLabel="Mannschaften" empty="Keine Mannschaften." />
      {editing && <TeamEditModal team={editing} onSaved={onSaved} onFlash={onFlash} onClose={() => setEditing(null)} />}
    </div>
  );
}

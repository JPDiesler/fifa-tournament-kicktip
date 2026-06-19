import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Upload, RotateCcw } from "lucide-react";
import { TEAMS } from "@/data";
import Flag from "@/components/Flag.jsx";
import TeamLogo from "@/components/TeamLogo.jsx";
import DataTable from "@/components/DataTable.jsx";
import { NICKNAMES } from "@/lib/teamNicknames.js";
import { getTeamOverrides, setTeamOverride } from "./admin.js";

const MAX = 500 * 1024; // 500 KB
const OK = /^image\/(svg\+xml|png|jpeg|webp)$/;

// Effective logo preview (override → bundled crest → initials) that doubles as the upload
// target (click or drag & drop).
function LogoCell({ row, bust, onSaved, onFlash }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const logoUrl = row.override?.hasLogo ? `/api/team-logo/${row.code}?v=${bust}` : undefined;
  const upload = async (file) => {
    if (!file) return;
    if (!OK.test(file.type)) return onFlash?.("Nur PNG / SVG / WEBP");
    if (file.size > MAX) return onFlash?.("Logo zu groß (max 500 KB)");
    setBusy(true);
    try {
      const uri = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await setTeamOverride(row.code, { logo: uri });
      onSaved(r.overrides); onFlash?.(`${row.name}: Logo gespeichert`);
    } catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" title="Logo hochladen (Klick oder Drag & Drop)" onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
        className="relative shrink-0 rounded-lg p-1 ring-1 ring-border transition hover:ring-app-accent">
        <TeamLogo key={logoUrl || row.code} code={row.code} logo={logoUrl} name={row.name} className="size-10" />
        <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-app-accent text-accent-foreground"><Upload size={9} /></span>
        {busy && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-overlay/70 text-[10px]">…</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}

// Inline nickname editor (placeholder = the seeded default). Saves on blur / Enter.
function NickCell({ row, onSaved, onFlash }) {
  const [nick, setNick] = useState(row.override?.nickname || "");
  const save = async () => {
    const v = nick.trim();
    if ((v || null) === (row.override?.nickname || null)) return;
    try { const r = await setTeamOverride(row.code, { nickname: v }); onSaved(r.overrides); onFlash?.(`${row.name}: Spitzname gespeichert`); }
    catch (e) { onFlash?.(e.message); }
  };
  return (
    <input value={nick} onChange={(e) => setNick(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      placeholder={NICKNAMES[row.code] || "Spitzname"} maxLength={60}
      className="w-full max-w-[12rem] rounded-md border border-border bg-field px-2 py-1 text-xs outline-none transition focus:border-accent" />
  );
}

// Admin "Mannschaften" tab: override the build-seeded nickname + federation logo per team.
export default function AdminTeamsTab({ onFlash }) {
  const [overrides, setOverrides] = useState({});
  const [bust, setBust] = useState(0);
  useEffect(() => { getTeamOverrides().then((o) => { setOverrides(o); setBust(1); }).catch((e) => onFlash?.(e.message)); }, [onFlash]);
  const onSaved = (o) => { setOverrides(o || {}); setBust((b) => b + 1); };
  const clearLogo = async (code, name) => { try { const r = await setTeamOverride(code, { logo: null }); onSaved(r.overrides); onFlash?.(`${name}: Logo zurückgesetzt`); } catch (e) { onFlash?.(e.message); } };

  const rows = Object.entries(TEAMS).map(([code, t]) => ({ code, name: t.name, override: overrides[code], nickname: overrides[code]?.nickname || NICKNAMES[code] || "" }));

  const columns = [
    { key: "logo", header: "Logo", render: (row) => <LogoCell row={row} bust={bust} onSaved={onSaved} onFlash={onFlash} /> },
    {
      key: "team", header: "Mannschaft", isRowHeader: true, sortable: true, sort: (row) => row.name,
      filter: {
        label: "Status",
        options: [{ value: "override", label: "mit Override" }, { value: "logo", label: "eigenes Logo" }, { value: "plain", label: "ohne Override" }],
        match: (row, v) => v === "logo" ? !!row.override?.hasLogo : v === "override" ? !!(row.override?.nickname || row.override?.hasLogo) : !(row.override?.nickname || row.override?.hasLogo),
      },
      render: (row) => (
        <span className="flex items-center gap-2"><Flag code={row.code} sm /><span className="truncate font-semibold">{row.name}</span><span className="text-xs text-muted">{row.code}</span></span>
      ),
    },
    { key: "nick", header: "Spitzname", sortable: true, sort: (row) => row.nickname, render: (row) => <NickCell row={row} onSaved={onSaved} onFlash={onFlash} /> },
    {
      key: "actions", header: "", render: (row) => (row.override?.hasLogo
        ? <Button size="sm" variant="ghost" onPress={() => clearLogo(row.code, row.name)} aria-label="Logo zurücksetzen"><RotateCcw size={13} /> Logo</Button>
        : null),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Mannschaften</h2>
        <span className="text-xs text-muted">Logo (Klick / Drag &amp; Drop) und Spitzname je Team überschreiben das Default.</span>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.code} search={(r) => `${r.name} ${r.code} ${r.nickname}`}
        searchPlaceholder="Mannschaft suchen …" ariaLabel="Mannschaften" empty="Keine Mannschaften." />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Upload, RotateCcw } from "lucide-react";
import { TEAMS } from "@/data";
import Flag from "@/components/Flag.jsx";
import TeamLogo from "@/components/TeamLogo.jsx";
import { NICKNAMES } from "@/lib/teamNicknames.js";
import { getTeamOverrides, setTeamOverride } from "./admin.js";

const MAX = 500 * 1024; // 500 KB
const OK = /^image\/(svg\+xml|png|jpeg|webp)$/;

// One editable team row: effective logo preview (admin override → build-bundled crest →
// initials) that doubles as the upload target (click or drag & drop), plus a nickname
// field. Saving overrides the build-seeded default; "zurücksetzen" clears the override.
function TeamRow({ code, name, override, bust, onSaved, onFlash }) {
  const fileRef = useRef(null);
  const [nick, setNick] = useState(override?.nickname || "");
  const [busy, setBusy] = useState(false);
  const def = NICKNAMES[code] || "";
  const logoUrl = override?.hasLogo ? `/api/team-logo/${code}?v=${bust}` : undefined;

  const saveNick = async () => {
    const v = nick.trim();
    if ((v || null) === (override?.nickname || null)) return; // unchanged
    try { const r = await setTeamOverride(code, { nickname: v }); onSaved(r.overrides); onFlash?.(`${name}: Spitzname gespeichert`); }
    catch (e) { onFlash?.(e.message); }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!OK.test(file.type)) return onFlash?.("Nur PNG / SVG / WEBP");
    if (file.size > MAX) return onFlash?.("Logo zu groß (max 500 KB)");
    setBusy(true);
    try {
      const uri = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const r = await setTeamOverride(code, { logo: uri });
      onSaved(r.overrides); onFlash?.(`${name}: Logo gespeichert`);
    } catch (e) { onFlash?.(e.message); } finally { setBusy(false); }
  };
  const clearLogo = async () => { try { const r = await setTeamOverride(code, { logo: null }); onSaved(r.overrides); onFlash?.(`${name}: Logo zurückgesetzt`); } catch (e) { onFlash?.(e.message); } };

  return (
    <div className="flex items-center gap-3 border-t border-border py-2 first:border-t-0">
      <button type="button" title="Logo hochladen (Klick oder Drag & Drop)" onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
        className="relative shrink-0 rounded-lg p-1 ring-1 ring-border transition hover:ring-app-accent">
        <TeamLogo key={logoUrl || code} code={code} logo={logoUrl} name={name} className="size-11" />
        <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-app-accent text-accent-foreground"><Upload size={9} /></span>
        {busy && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-overlay/70 text-[10px]">…</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Flag code={code} sm />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name} <span className="text-xs font-normal text-muted">{code}</span></div>
          <input value={nick} onChange={(e) => setNick(e.target.value)} onBlur={saveNick} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder={def || "Spitzname"} maxLength={60}
            className="mt-0.5 w-full max-w-[14rem] rounded-md border border-border bg-field px-2 py-0.5 text-xs outline-none transition focus:border-accent" />
        </div>
      </div>

      {override?.hasLogo && <Button size="sm" variant="ghost" onPress={clearLogo} aria-label="Logo zurücksetzen"><RotateCcw size={13} /></Button>}
    </div>
  );
}

// Admin "Mannschaften" tab: override the build-seeded nickname + federation logo per team.
export default function AdminTeamsTab({ onFlash }) {
  const [overrides, setOverrides] = useState({});
  const [bust, setBust] = useState(0);
  useEffect(() => { getTeamOverrides().then((o) => { setOverrides(o); setBust(1); }).catch((e) => onFlash?.(e.message)); }, [onFlash]);
  const onSaved = (o) => { setOverrides(o || {}); setBust((b) => b + 1); };
  const teams = Object.entries(TEAMS).map(([code, t]) => ({ code, name: t.name })).sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Mannschaften</h2>
        <span className="text-xs text-muted">Logo (Klick / Drag &amp; Drop) und Spitzname je Team überschreiben das Default.</span>
      </div>
      <div>
        {teams.map((t) => <TeamRow key={t.code} code={t.code} name={t.name} override={overrides[t.code]} bust={bust} onSaved={onSaved} onFlash={onFlash} />)}
      </div>
    </div>
  );
}

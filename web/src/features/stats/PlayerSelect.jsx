import { useState } from "react";
import { Popover, Button } from "@heroui/react";
import { ChevronDown, Search } from "lucide-react";

// Compact searchable single-player picker (Popover + filter). `players` = [{ p, name }].
export default function PlayerSelect({ players, value, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sel = players.find((p) => p.p === value);
  const list = players.filter((p) => `${p.name} ${p.p}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Popover isOpen={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <Button variant="secondary" size="sm" aria-label={ariaLabel} className="w-full justify-between gap-1">
        <span className="truncate">{sel ? sel.name : "Spieler …"}</span>
        <ChevronDown size={14} className="shrink-0" />
      </Button>
      <Popover.Content className="w-56">
        <Popover.Dialog className="p-1.5">
          <div className="mb-1 flex items-center gap-1.5 rounded-md border border-border bg-overlay px-2">
            <Search size={13} className="shrink-0 text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Spieler suchen …"
              className="w-full bg-transparent py-1.5 text-sm outline-none" />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {list.map((p) => (
              <li key={p.p}>
                <button onClick={() => { onChange(p.p); setOpen(false); setQ(""); }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-overlay ${value === p.p ? "bg-accent/15 font-semibold" : ""}`}>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 text-[10px] text-muted">{p.p}</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="px-2 py-1.5 text-xs text-muted">Keine Treffer</li>}
          </ul>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

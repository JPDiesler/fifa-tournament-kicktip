import { broadcasterFor, orderServices } from "./broadcasters.js";

// Compact, centred row of broadcaster logo chips — shown under the score in the match
// header. Logo-only, tappable (opens the service in a new tab). For the full-size
// buttons (drawer page) see BroadcastButtons.
export default function BroadcastChips({ keys }) {
  const list = orderServices(keys);
  if (!list.length) return null;
  const cls = "flex h-7 items-center justify-center rounded-md px-2.5 ring-1 ring-white/15 transition hover:brightness-110";
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
      {list.map((k) => {
        const b = broadcasterFor(k);
        const content = b.logo
          ? <img src={b.logo} alt={b.label} title={b.label} loading="lazy" className="max-h-3.5 w-auto" style={b.invert ? { filter: "brightness(0) invert(1)" } : undefined} />
          : <span className="text-[11px] font-bold leading-none text-white">{b.label}</span>;
        return b.url ? (
          <a key={k} href={b.url} target="_blank" rel="noopener noreferrer" title={b.label} className={cls} style={{ background: b.brand }}>{content}</a>
        ) : (
          <div key={k} className={cls} style={{ background: b.brand }} title={b.label}>{content}</div>
        );
      })}
    </div>
  );
}

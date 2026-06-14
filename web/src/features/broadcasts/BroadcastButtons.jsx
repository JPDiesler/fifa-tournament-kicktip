import { broadcasterFor, orderServices } from "./broadcasters.js";

// The services as clickable brand-colour buttons with the logo in white (CI
// "logo on brand colour" lockup), no label. Opens the service in a new tab.
// Used in the broadcast drawer and the match detail.
export default function BroadcastButtons({ keys }) {
  const list = orderServices(keys);
  if (!list.length) return <p className="text-center text-xs text-muted">Noch keine Angabe.</p>;

  const cls = "flex h-11 min-w-14 flex-1 items-center justify-center rounded-lg px-4 ring-1 ring-white/15 transition hover:brightness-110";

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((k) => {
        const b = broadcasterFor(k);
        const content = b.logo
          ? <img src={b.logo} alt={b.label} title={b.label} loading="lazy" className="max-h-5 w-auto" style={b.invert ? { filter: "brightness(0) invert(1)" } : undefined} />
          : <span className="text-sm font-bold text-white">{b.label}</span>;
        return b.url ? (
          <a key={k} href={b.url} target="_blank" rel="noopener noreferrer" title={b.label} className={cls} style={{ background: b.brand }}>
            {content}
          </a>
        ) : (
          <div key={k} className={cls} style={{ background: b.brand }} title={b.label}>{content}</div>
        );
      })}
    </div>
  );
}

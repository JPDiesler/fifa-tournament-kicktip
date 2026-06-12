import aw from "../assets/aw.png";
import fwc from "../assets/fwc26.jpg";

// Brand lockup: Albert-Weil monogram × FIFA World Cup 26 emblem.
export default function Logo({ size = "h-9" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-white/15">
        <img src={aw} alt="Albert Weil" className={`${size} w-auto`} />
      </span>
      <span className="text-xs font-bold text-muted">×</span>
      <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-white/15">
        <img src={fwc} alt="FIFA World Cup 26" className={`${size} w-auto`} />
      </span>
    </div>
  );
}

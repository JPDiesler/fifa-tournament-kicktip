import aw from "../assets/aw.png";
import fwc from "../assets/fwc26.jpg";

// Brand lockup: Albert-Weil monogram × FIFA World Cup 26 emblem.
// Both logo boxes get the same explicit height `h` (px); images fill it via
// h-full. The AW monogram keeps its 2px white frame (so its image sits slightly
// inset), the FWC emblem fills the box edge to edge — both boxes line up exactly.
export default function Logo({ h = 36 }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex overflow-hidden rounded-sm p-[2px] ring-1 ring-white/15 bg-white" style={{ height: h }}>
        <img src={aw} alt="Albert Weil" className="h-full w-auto object-contain" />
      </span>
      <span className="text-xs font-bold text-muted">×</span>
      <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-white/15" style={{ height: h }}>
        <img src={fwc} alt="FIFA World Cup 26" className="h-full w-auto object-contain" />
      </span>
    </div>
  );
}

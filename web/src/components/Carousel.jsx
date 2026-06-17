import { useEffect, useRef, useState } from "react";

// Horizontal swipe carousel (CSS scroll-snap) with clickable, centred label tabs.
// `sections` = [{ id, label, content }]. The viewport takes the ACTIVE slide's height
// (others don't inflate it), so the surrounding Drawer.Body can stay a normal block
// scroller — the whole sheet scrolls vertically while sections swipe horizontally.
export default function Carousel({ sections, initial = 0, className = "" }) {
  const ref = useRef(null);
  const slideRefs = useRef([]);
  const [active, setActive] = useState(initial);
  const [h, setH] = useState(null);

  const measure = (i) => { const el = slideRefs.current[i]; if (el) setH(el.scrollHeight); };
  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive((prev) => (prev === i ? prev : i));
  };
  const go = (i) => { const el = ref.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };

  useEffect(() => { setActive((p) => Math.min(p, sections.length - 1)); }, [sections.length]);
  // Size the viewport to the active slide (re-measure after layout + late image loads).
  useEffect(() => {
    measure(active);
    const t = setTimeout(() => measure(active), 180);
    const onR = () => measure(active);
    window.addEventListener("resize", onR);
    return () => { clearTimeout(t); window.removeEventListener("resize", onR); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sections.length]);

  if (!sections.length) return null;
  const cur = Math.min(active, sections.length - 1);
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="mb-2 flex flex-wrap justify-center gap-1">
        {sections.map((s, i) => (
          <button key={s.id} type="button" onClick={() => go(i)} aria-current={i === cur}
            className={`flex shrink-0 items-center justify-center rounded-full px-3 py-1 text-center text-xs font-semibold leading-none transition ${i === cur ? "bg-app-accent text-accent-foreground" : "bg-overlay text-muted hover:text-foreground"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div ref={ref} onScroll={onScroll} style={{ height: h ? `${h}px` : undefined }}
        className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain transition-[height] duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s, i) => (
          <div key={s.id} ref={(el) => (slideRefs.current[i] = el)} className="w-full shrink-0 snap-center self-start px-0.5">
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}

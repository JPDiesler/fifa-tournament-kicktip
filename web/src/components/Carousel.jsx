import { useEffect, useRef, useState } from "react";

const MAX_VH = 0.6; // viewport caps at 60% of the screen; taller sections scroll internally

// Horizontal swipe carousel (CSS scroll-snap) with clickable, centred label tabs.
// `sections` = [{ id, label, content }]. The viewport height is FIXED across slides
// (the tallest section, capped at MAX_VH) so switching tabs never resizes the
// surrounding drawer; a section taller than the cap scrolls vertically inside its slide.
export default function Carousel({ sections, initial = 0, className = "" }) {
  const ref = useRef(null);
  const slideRefs = useRef([]);
  const [active, setActive] = useState(initial);
  const [h, setH] = useState(null);

  const measure = () => {
    let max = 0;
    for (const el of slideRefs.current) if (el) max = Math.max(max, el.scrollHeight);
    if (!max) return;
    const cap = Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * MAX_VH);
    setH(Math.min(max, cap)); // React bails if unchanged → no churn when switching tabs
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive((prev) => (prev === i ? prev : i));
  };
  const go = (i) => { const el = ref.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };

  useEffect(() => { setActive((p) => Math.min(p, sections.length - 1)); }, [sections.length]);
  useEffect(measure); // re-measure after every render (content/length changes); height is the tallest slide, not the active one
  useEffect(() => {
    const t = setTimeout(measure, 180); // late image loads
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s, i) => (
          <div key={s.id} ref={(el) => (slideRefs.current[i] = el)}
            className="w-full shrink-0 snap-center self-start max-h-full overflow-y-auto overscroll-contain px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}

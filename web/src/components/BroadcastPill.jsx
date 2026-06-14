import { Tv } from "lucide-react";
import { orderServices } from "../lib/broadcasters.js";

// Tiny black pill (bottom-left of a match card). Click opens the broadcast drawer.
// stopPropagation so it doesn't also trigger the card's match-detail click.
export default function BroadcastPill({ keys, onOpen, className = "" }) {
  const list = orderServices(keys);
  if (!list.length) return null;
  return (
    <button type="button" title="Wo zu sehen?"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className={`inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-200 ring-1 ring-white/10 transition hover:bg-black ${className}`}>
      <Tv size={11} />{list.length}
    </button>
  );
}

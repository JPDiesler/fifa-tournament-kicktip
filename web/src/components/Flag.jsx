import { flagUrl } from "@/lib/scoring.js";

// Flags are bundled locally (downloaded at build time into assets/flags) so we
// never hotlink Wikimedia at runtime. Wikimedia stays only as a last-resort fallback.
const localFlags = import.meta.glob("../assets/flags/*.svg", { eager: true, query: "?url", import: "default" });
const FLAGS = {};
for (const p in localFlags) FLAGS[p.split("/").pop().replace(".svg", "")] = localFlags[p];

export default function Flag({ code, sm, lg }) {
  const cls = lg ? "h-7 w-11" : sm ? "h-3 w-5" : "h-4 w-6";
  const src = (code && FLAGS[code]) || flagUrl(code);
  if (!src) return <span className={`inline-block ${cls} rounded-sm bg-zinc-700`} />;
  return <img src={src} alt="" loading="lazy" className={`${cls} rounded-sm object-cover ring-1 ring-black/30`} />;
}

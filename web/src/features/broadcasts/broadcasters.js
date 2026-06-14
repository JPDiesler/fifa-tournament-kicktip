// Broadcaster registry: service key → display label + deep link to the service.
// The volatile "which match on which service" mapping comes from the server
// (st.broadcasts, fed by the EPG + rights layer); this file is the STABLE part —
// a small set of German services that rarely changes and is reused across
// tournaments. Logos are downloaded at build time (web/scripts/download-broadcasters.mjs)
// into assets/broadcasters/<key>.<ext> and resolved here by basename.

const logoFiles = import.meta.glob("../../assets/broadcasters/*.{svg,png,webp,jpg}", {
  eager: true, query: "?url", import: "default",
});
const LOGOS = {};
for (const p in logoFiles) LOGOS[p.split("/").pop().replace(/\.[^.]+$/, "")] = logoFiles[p];

// Insertion order = display order (free-to-air first, then pay/streaming).
// Each service is a button: `brand` background + logo, no label.
//   • invert:true  → single-colour logo rendered WHITE on the CI brand colour
//     (the classic "logo on brand colour" lockup).
//   • invert unset → the logo keeps its own colours (it uses knockout/own-colour
//     designs that can't be whitened from the free asset, e.g. ZDF/DAZN/Netflix/
//     RTL) and sits on its native dark/brand background.
// Drop an official white/negative SVG into assets/broadcasters and add invert:true
// to switch any of these to the uniform white-on-brand look.
export const SERVICES = {
  ard:       { label: "ARD",         url: "https://www.sportschau.de/fussball/",        brand: "#0F1D46", invert: true },
  zdf:       { label: "ZDF",         url: "https://www.zdf.de/live-tv",                 brand: "#18181b" },
  magentatv: { label: "MagentaTV",   url: "https://www.magentatv.de/",                  brand: "#E20074", invert: true },
  sky:       { label: "Sky",         url: "https://www.sky.de/sport",                   brand: "#0072C9", invert: true },
  dazn:      { label: "DAZN",        url: "https://www.dazn.com/de-DE/home",            brand: "#000000" },
  prime:     { label: "Prime Video", url: "https://www.amazon.de/gp/video/storefront",  brand: "#1399FF", invert: true },
  netflix:   { label: "Netflix",     url: "https://www.netflix.com/",                   brand: "#000000" },
  rtl:       { label: "RTL",         url: "https://plus.rtl.de/",                       brand: "#18181b" },
  eurosport: { label: "Eurosport",   url: "https://www.eurosport.de/",                  brand: "#141B4D", invert: true },
};
const ORDER = Object.keys(SERVICES);

// Resolve one service key → { key, label, url, logo, brand, invert } (logo may be undefined).
export function broadcasterFor(key) {
  const s = SERVICES[key] || { label: key, url: null };
  return { key, label: s.label, url: s.url, logo: LOGOS[key], brand: s.brand || "#27272a", invert: !!s.invert };
}

// Sort/keep only known service keys, in registry (display) order.
export function orderServices(keys) {
  return [...new Set(keys || [])].filter((k) => k in SERVICES).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

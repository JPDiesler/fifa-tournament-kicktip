// Build-time broadcaster-logo download: fetches each service's logo from Wikimedia
// Commons once into src/assets/broadcasters/<key>.<ext>, so the app never hotlinks
// at runtime. Mirrors download-flags.mjs.
//
// Idempotent: an existing <key>.* is skipped → committed logos = no network during
// the Docker build. Set FORCE=1 to re-download (e.g. to refresh/replace a logo).
//
// "More logos" = add a service here (and to web/src/lib/broadcasters.js + the
// server channel/rights config). Each entry may list several candidate Commons
// filenames; the first that resolves wins. A miss is non-fatal — the UI falls back
// to a text label — but is logged so you can drop in a correct filename/URL.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../src/assets/broadcasters");
fs.mkdirSync(OUT, { recursive: true });

// service key → candidate Wikimedia Commons file names (tried in order).
const LOGOS = {
  ard:       ["ARD logo.svg", "Das Erste Logo.svg"],
  zdf:       ["ZDF logo.svg", "ZDF logo (2021).svg"],
  // Magenta/Netflix/Prime use compact square-ish ICONS (the wide wordmarks waste space).
  magentatv: ["Deutsche Telekom 2022.svg", "Magenta Telekom.svg"],
  sky:       ["Sky Deutschland logo.svg", "Sky Group logo 2020.svg", "Sky logo 2020.svg"],
  dazn:      ["DAZN Logo.svg", "DAZN logo.svg"],
  prime:     ["Prime Video logo (2024).svg", "Amazon Prime Video blue logo 1.svg"],
  netflix:   ["Netflix icon.svg", "Netflix-icon.png"],
  rtl:       ["RTL Television Logo 2021.svg", "RTL Logo 2021.svg"],
  eurosport: ["Eurosport Logo 2015.svg", "Eurosport logo 2015.svg"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "wm-tippspiel-build/1.0 (broadcaster logo fetch; one-time)";
const force = process.env.FORCE === "1";
const existing = (key) => fs.readdirSync(OUT).some((f) => f.replace(/\.[^.]+$/, "") === key);

async function fetchLogo(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    return null; // 404 etc. → try next candidate
  }
  return null;
}

let dl = 0, skip = 0, fail = 0;
for (const [key, candidates] of Object.entries(LOGOS)) {
  if (!force && existing(key)) { skip++; continue; }
  let saved = false;
  for (const name of candidates) {
    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`;
    const buf = await fetchLogo(url);
    await sleep(400); // be gentle with Wikimedia
    if (buf) {
      const ext = path.extname(name).toLowerCase() || ".svg";
      for (const f of fs.readdirSync(OUT)) if (f.replace(/\.[^.]+$/, "") === key) fs.rmSync(path.join(OUT, f));
      fs.writeFileSync(path.join(OUT, `${key}${ext}`), buf);
      dl++; saved = true; break;
    }
  }
  if (!saved) { console.error("FAIL", key, "→ keine der Kandidaten-Dateien gefunden:", candidates.join(", ")); fail++; }
}
console.log(`Sender-Logos: ${dl} geladen, ${skip} vorhanden, ${fail} fehlend → ${OUT}`);
// Non-fatal: a missing logo just falls back to a text label in the UI.

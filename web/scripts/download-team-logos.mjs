// Build-time team-crest download: fetches each national team's federation crest once into
// src/assets/team-logos/<CODE>.<ext> (SVG/PNG), so the app never hotlinks at runtime.
// Mirrors download-flags.mjs / download-broadcasters.mjs.
//
// api-football's national-team "crest" is just the flag, and the real federation crests
// (DFB eagle, Three Lions, …) are fair-use files on the LANGUAGE Wikipedias (en/de), not
// on Commons, with idiosyncratic names. So instead of guessing filenames we read the crest
// the article itself shows: parse the "<Country> national football team" lead section,
// take the first infobox image that isn't a flag/kit/trend-icon (preferring crest/logo/
// federation names), and download that file via Special:FilePath on its host.
//
// CRESTS overrides force a specific {host, file} when the auto-pick is wrong. A miss is
// non-fatal — the UI falls back to the team initials, and the logo can be uploaded via the
// admin Mannschaften tab. Idempotent: an existing <CODE>.* is skipped (committed crests =
// no network during the Docker build). FORCE=1 re-downloads everything.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TEAMS } from "../src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../src/assets/team-logos");
fs.mkdirSync(OUT, { recursive: true });

// Manual overrides — code → { host, file } (host = en|de|commons). Fill when the auto-pick
// is wrong; takes precedence over article extraction.
const CRESTS = {
  // GER auto-picks DFBEagle (correct); add others here if a pick turns out wrong.
};
// Full article-title overrides where "<flag country> national football team" isn't right
// (e.g. the CONCACAF sides use "men's national soccer team").
const ARTICLE = {
  KOR: "South Korea national football team",
  USA: "United States men's national soccer team",
  CAN: "Canada men's national soccer team",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "wm-tippspiel-build/1.0 (team crest fetch; one-time)";
const force = process.env.FORCE === "1";
const existing = (code) => fs.readdirSync(OUT).some((f) => f.replace(/\.[^.]+$/, "") === code);
const countryOf = (wiki) => String(wiki || "").replace(/^Flag of (the )?/i, "").replace(/\.svg$/i, "").trim();

// junk that also lives in the infobox (kit diagrams, the flag, FIFA-ranking trend arrows,
// maintenance/UI icons) — never a crest.
const BAD = /Flag_of|Kit_|_arm\.|_body|_shorts|_socks|_pattern|Decrease|Increase|Steady|Question_book|Commons-logo|Wiki|Edit-icon|Padlock|lock|shackle|protect|Ambox|Symbol_|OOjs|_icon|Red_x|Green_check|Soccerball|pictogram|Gnome|Crystal/i;
const GOOD = /crest|logo|badge|seal|emblem|federation|association|eagle|escudo|escut|wappen|stemma|f[eé]d[eé]ration|federaci/i;

async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.json().catch(() => null);
    if (r.status === 429 || r.status === 503) { await sleep(2000 * (attempt + 1)); continue; }
    return null;
  }
  return null;
}
async function getBuf(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status === 503) { await sleep(2000 * (attempt + 1)); continue; }
    return null;
  }
  return null;
}

// Crest candidates {host, file} the article's infobox uses, best first (crest/logo names,
// then country-name matches, then the rest). Empty array if none.
async function findCrests(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&section=0&redirects=1&maxlag=5&page=${encodeURIComponent(title)}`;
  const j = await getJson(url);
  const html = j?.parse?.text?.["*"] || "";
  const seen = new Set();
  const all = [...html.matchAll(/\/\/upload\.wikimedia\.org\/wikipedia\/(en|commons|de)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^"\/]+\.(?:svg|png))/gi)]
    .map((x) => ({ host: x[1], file: decodeURIComponent(x[2]) }))
    .filter((x) => !BAD.test(x.file) && !seen.has(x.file) && seen.add(x.file));
  const tok = title.split(/\s+/)[0]; // country-name hint
  const rank = (x) => (GOOD.test(x.file) ? 0 : x.file.includes(tok) ? 1 : 2);
  return all.sort((a, b) => rank(a) - rank(b));
}
// Reject the Wikipedia protection padlock / other tiny placeholder SVGs that slip through.
const isJunk = (buf, file) => buf.length < 500 && /\.svg$/i.test(file) && /shackle|lock|<path id=/i.test(buf.toString("utf8"));

let dl = 0, skip = 0, fail = 0;
const missing = [];
for (const [code, t] of Object.entries(TEAMS)) {
  if (!force && existing(code)) { skip++; continue; }
  const title = ARTICLE[code] || `${countryOf(t.wiki)} national football team`;
  const candidates = CRESTS[code] ? [CRESTS[code]] : await findCrests(title);
  await sleep(1100); // be gentle with the API
  let saved = false;
  for (const crest of candidates) {
    const host = crest.host === "commons" ? "commons.wikimedia.org" : `${crest.host}.wikipedia.org`;
    const buf = await getBuf(`https://${host}/wiki/Special:FilePath/${encodeURIComponent(crest.file)}`);
    await sleep(400);
    if (!buf || buf.length < 300 || isJunk(buf, crest.file)) continue;
    const ext = path.extname(crest.file).toLowerCase() || ".svg";
    for (const f of fs.readdirSync(OUT)) if (f.replace(/\.[^.]+$/, "") === code) fs.rmSync(path.join(OUT, f));
    fs.writeFileSync(path.join(OUT, `${code}${ext}`), buf);
    dl++; saved = true; break;
  }
  if (!saved) { fail++; missing.push(code); }
}
console.log(`Team-Crests: ${dl} geladen, ${skip} vorhanden, ${fail} fehlend → ${OUT}`);
if (missing.length) console.log("Fehlend (per Admin-Tab hochladen):", missing.join(", "));
// Non-fatal: a missing crest just falls back to the team initials in the UI.

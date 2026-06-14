// "Where to watch (Germany)" data layer.
//
// Two complementary sources feed the broadcasts table:
//   • EPG  — a German TV guide (XMLTV) tells us which LINEAR channel airs which
//            match (ARD/ZDF/RTL/Sky/DAZN/Eurosport). Derived automatically by
//            matching programme title+time to our fixtures → fully generic across
//            tournaments/sports.
//   • RIGHTS — a small per-tournament config for pure STREAMING services that have
//            no EPG (MagentaTV/Prime/Netflix). Rights are coarse and stable, so a
//            handful of declarative rules cover them and stay future-proof.
//
// This module fetches/parses the EPG and declares the channel→service map and the
// rights rules. The fixture matching lives in index.js (it needs MATCHES/TEAMS).

import zlib from "zlib";

// Ready-made XMLTV dump for German(-language) channels. Override via env if needed.
export const EPG_URL = process.env.EPG_URL ||
  "https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz";

// Map an EPG channel id → our service key. German broadcasters only (the dump also
// carries ORF/SRF/ServusTV — Austria/Switzerland — which we deliberately skip for
// the "in Germany" view). Returns null for channels we don't care about.
export function channelToService(ch) {
  if (ch === "Das.Erste.de") return "ard";
  if (ch === "ZDF.de") return "zdf";
  if (ch === "RTL.de") return "rtl";
  if (/^Sky\.Sport\./.test(ch)) return "sky";
  if (/^DAZN/.test(ch)) return "dazn";
  if (/^Eurosport/.test(ch)) return "eurosport";
  return null;
}

// Per-tournament streaming/pay rights (no EPG). coverage:
//   "all" | { phase:[…] } | { matches:[…] } — evaluated by applyRights() in index.js.
// WM 2026 (DE): MagentaTV shows every match. Edit per tournament.
export const RIGHTS = [
  { service: "magentatv", coverage: "all" },
];

// Normalised German name variants where the EPG spelling differs from TEAMS[code].name
// (norm() already strips accents, so most names match directly).
export const TEAM_ALIASES_DE = {
  BIH: ["bosnienundherzegowina", "bosnien"],
  COD: ["drkongo", "demokratischerepublikkongo", "kongo"],
  KOR: ["korearepublik"],
  CIV: ["cotedivoire"],
  USA: ["vereinigtestaaten"],
};

const XMLTV_TIME = /^(\d{14})\s*([+-]\d{4})?/;
// "20260614190000 +0200" → epoch ms
export function parseXmltvTime(s) {
  const m = XMLTV_TIME.exec(s || "");
  if (!m) return NaN;
  const [, t, off] = m;
  const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}`;
  const offset = off ? `${off.slice(0, 3)}:${off.slice(3)}` : "+00:00";
  return Date.parse(`${iso}${offset}`);
}

const unescapeXml = (s) =>
  (s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&");

const PROGRAMME = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
const attrOf = (attrs, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(attrs); return m ? m[1] : ""; };
const tagOf = (body, tag) => { const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(body); return m ? unescapeXml(m[1]) : ""; };

// Parse an XMLTV string, keeping only programmes on channels we map to a service.
// Returns [{ service, startMs, stopMs, title, sub }].
export function parseProgrammes(xml) {
  const out = [];
  for (const m of xml.matchAll(PROGRAMME)) {
    const service = channelToService(attrOf(m[1], "channel"));
    if (!service) continue;
    out.push({
      service,
      startMs: parseXmltvTime(attrOf(m[1], "start")),
      stopMs: parseXmltvTime(attrOf(m[1], "stop")),
      title: tagOf(m[2], "title"),
      sub: tagOf(m[2], "sub-title"),
    });
  }
  return out;
}

// Download + gunzip + parse the EPG.
export async function fetchEpgProgrammes() {
  const res = await fetch(EPG_URL);
  if (!res.ok) throw new Error(`EPG HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  return parseProgrammes(zlib.gunzipSync(gz).toString("utf8"));
}

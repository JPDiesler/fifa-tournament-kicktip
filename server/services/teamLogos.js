// Bulk-refresh federation crests from football-logos.cc, stored as team_meta logo overrides
// (the same place an admin upload lands; served via /api/team-logo). The listing's filenames
// carry a content hash, so URLs can't be built blind — we scrape the listing once, map each WC
// team's country slug → the best PNG, download it and store a data URI. Progress is polled by the
// admin "Mannschaften" tab's refresh toast (spinner + Meter bar).
import { TEAMS } from "../data.js";
import { setTeamMeta } from "../db.js";

const LISTING = process.env.TEAM_LOGOS_URL || "https://football-logos.cc/national-teams/";
const UA = "wm-tippspiel/1.0 (admin team-logo refresh)";
const MAX_BYTES = 480 * 1024; // stay under the team_meta / admin 500 KB cap
const SIZE_PREF = ["512x512", "700x700", "256x256", "1500x1500", "3000x3000"]; // crisp but small
// football-logos.cc slugs that differ from slugify(English country name) — verified against the live listing.
const SLUG_ALIAS = { USA: "usa", CPV: "cabo-verde", COD: "congo-dr" };

const countryOf = (w) => String(w || "").replace(/^Flag of (the )?/i, "").replace(/\.svg$/i, "").trim();
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const slugFor = (code) => SLUG_ALIAS[code] || slugify(countryOf(TEAMS[code]?.wiki) || TEAMS[code]?.name || code);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let progress = { running: false, total: 0, done: 0, updated: 0, failed: 0, missing: [], startedAt: null, finishedAt: null };
export const getTeamLogoProgress = () => ({ ...progress, missing: [...progress.missing] });

// Parse the listing HTML → { slug: bestPngUrl }. A slug may appear in several sizes (srcset);
// pick the preferred size, falling back to whatever exists.
export function parseLogoListing(html) {
  const bySlug = {};
  for (const m of String(html).matchAll(/https?:\/\/assets\.football-logos\.cc\/logos\/([a-z0-9-]+)\/(\d+x\d+)\/[^"'\s)]+\.png/gi)) {
    (bySlug[m[1]] ||= {})[m[2]] = m[0];
  }
  const out = {};
  for (const slug in bySlug) { const sizes = bySlug[slug]; out[slug] = sizes[SIZE_PREF.find((s) => sizes[s]) || Object.keys(sizes)[0]]; }
  return out;
}

let running = false;
// Fire-and-forget bulk refresh of every WC team's crest. Re-entrant-safe.
export async function refreshTeamLogos() {
  if (running) return;
  running = true;
  const codes = Object.keys(TEAMS);
  progress = { running: true, total: codes.length, done: 0, updated: 0, failed: 0, missing: [], startedAt: Date.now(), finishedAt: null };
  try {
    const r = await fetch(LISTING, { headers: { "User-Agent": UA } });
    const urls = r.ok ? parseLogoListing(await r.text()) : {};
    for (const code of codes) {
      const url = urls[slugFor(code)];
      if (!url) { progress.missing.push(code); progress.done++; continue; }
      try {
        const ir = await fetch(url, { headers: { "User-Agent": UA } });
        if (!ir.ok) throw new Error(`HTTP ${ir.status}`);
        const buf = Buffer.from(await ir.arrayBuffer());
        if (buf.length < 200 || buf.length > MAX_BYTES) throw new Error(`bad size ${buf.length}`);
        setTeamMeta(code, { logo: `data:image/png;base64,${buf.toString("base64")}` });
        progress.updated++;
      } catch (e) { progress.failed++; console.error("team-logo", code, e?.message || e); }
      progress.done++;
      await sleep(120); // gentle on the CDN + makes the progress bar visibly move
    }
  } catch (e) { console.error("refreshTeamLogos", e?.message || e); }
  finally { running = false; progress.running = false; progress.finishedAt = Date.now(); }
}

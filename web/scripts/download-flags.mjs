// Build-time flag download: fetches every team's flag from Wikimedia Commons
// once into src/assets/flags/<CODE>.svg so the app never hotlinks Wikipedia at
// runtime. Idempotent — existing files are skipped (committed flags = no network
// needed during the Docker build).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TEAMS } from "../src/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../src/assets/flags");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "wm-tippspiel-build/1.0 (flag fetch; one-time)";

async function fetchFlag(url) {
  // Polite: throttle + retry on rate limit (429) with backoff.
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    throw new Error("HTTP " + r.status);
  }
  throw new Error("HTTP 429 (Limit nach Retries)");
}

let dl = 0, skip = 0, fail = 0;
for (const [code, t] of Object.entries(TEAMS)) {
  const dest = path.join(OUT, `${code}.svg`);
  if (fs.existsSync(dest)) { skip++; continue; }
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(t.wiki)}`;
  try {
    fs.writeFileSync(dest, await fetchFlag(url));
    dl++;
    await sleep(400); // be gentle with Wikimedia
  } catch (e) { console.error("FAIL", code, t.wiki, e.message); fail++; }
}
console.log(`Flaggen: ${dl} geladen, ${skip} vorhanden, ${fail} Fehler → ${OUT}`);
if (fail) process.exitCode = 1;

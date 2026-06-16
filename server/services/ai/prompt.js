// Loads the external KI-Spieler prompt files. mtime-cached: a file is re-read only
// when it changed on disk, so a mounted/edited prompt is picked up on the next job
// WITHOUT a code rebuild (Docker: bind-mount the prompts dir; otherwise restart).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/services/ai → server/prompts (overridable via AI_PROMPT_DIR).
export const PROMPT_DIR = process.env.AI_PROMPT_DIR || path.join(__dirname, "..", "..", "prompts");

const cache = new Map(); // absolute file path → { mtimeMs, text }

export function loadPrompt(name) {
  const file = path.join(PROMPT_DIR, name);
  const stat = fs.statSync(file); // throws if missing → surfaces as the job's error
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.text;
  const text = fs.readFileSync(file, "utf8").trim();
  cache.set(file, { mtimeMs: stat.mtimeMs, text });
  return text;
}

export const matchSystemPrompt = () => loadPrompt("aiPlayer.system.md");
export const championSystemPrompt = () => loadPrompt("champion.system.md");

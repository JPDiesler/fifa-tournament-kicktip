import { db } from "./connection.js";

// ---------- AI matchday recaps (one row per finished calendar day) ----------
export function setMatchdayRecap(day, { text, provider = null, model = null }) {
  db.prepare(`INSERT INTO matchday_recaps(day,text,provider,model) VALUES(?,?,?,?)
    ON CONFLICT(day) DO UPDATE SET text=excluded.text, provider=excluded.provider, model=excluded.model, created_at=datetime('now')`)
    .run(String(day), String(text), provider, model);
}
export const getMatchdayRecap = (day) =>
  db.prepare("SELECT day,text,provider,model,created_at FROM matchday_recaps WHERE day=?").get(String(day)) || null;
export const hasMatchdayRecap = (day) =>
  db.prepare("SELECT 1 FROM matchday_recaps WHERE day=?").get(String(day)) != null;
// Most recent recap (for /api/state) — only the day + text reach the client.
export function latestRecap() {
  const r = db.prepare("SELECT day,text,created_at FROM matchday_recaps ORDER BY day DESC LIMIT 1").get();
  return r ? { day: r.day, text: r.text, createdAt: r.created_at } : null;
}

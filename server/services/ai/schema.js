// Validation of the canonical LLM outputs (Anhang B). On success returns a small
// normalized object; on any violation throws with a German reason — the affected
// AI player then gets no tip for that match (exactly one attempt, no retry).
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const inUnit = (x) => isNum(x) && x >= 0 && x <= 1;
// Coerce a score to a non-negative integer: accepts a number, an integer-valued float
// (2.0) or a numeric string ("2") — some providers (e.g. Gemini) return scores as
// strings/floats. Returns null when it isn't a whole number >= 0.
const toScore = (x) => {
  const n = typeof x === "string" && x.trim() !== "" ? Number(x) : x;
  return Number.isInteger(n) && n >= 0 ? n : null;
};

// Match tip: integer scores >= 0, probabilities in [0,1] summing to ~1.
export function validateMatchPrediction(p) {
  if (!p || typeof p !== "object") throw new Error("Antwort ist kein JSON-Objekt");
  const tip = p.tip || {};
  const h = toScore(tip.home), a = toScore(tip.away);
  if (h == null || a == null)
    throw new Error("tip.home/away müssen ganze Zahlen >= 0 sein");
  const op = p.outcome_probabilities || {};
  const probs = [op.home_win, op.draw, op.away_win];
  if (!probs.every(inUnit)) throw new Error("outcome_probabilities müssen Zahlen in [0,1] sein");
  const sum = probs.reduce((s, x) => s + x, 0);
  if (Math.abs(sum - 1) > 0.05) throw new Error(`outcome_probabilities summieren nicht ~1 (${sum.toFixed(3)})`);
  if (p.tip_scoreline_probability != null && !inUnit(p.tip_scoreline_probability))
    throw new Error("tip_scoreline_probability muss in [0,1] liegen");
  return { tip: { h: String(h), a: String(a) } }; // app stores scores as strings
}

// Champion tip: a valid team code (must be one of the bundle's codes) + sane prob.
export function validateChampionPrediction(p, validCodes) {
  if (!p || typeof p !== "object") throw new Error("Antwort ist kein JSON-Objekt");
  const code = (p.champion_code || "").toString().trim().toUpperCase();
  if (!code) throw new Error("champion_code fehlt");
  if (validCodes && validCodes.length && !validCodes.includes(code))
    throw new Error(`champion_code '${code}' ist kein gültiger Team-Code`);
  if (p.win_probability != null && !inUnit(p.win_probability))
    throw new Error("win_probability muss in [0,1] liegen");
  return { code };
}

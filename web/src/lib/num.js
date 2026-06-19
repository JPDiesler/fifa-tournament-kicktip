// Parse a percent-ish value ("45%", "45", 45) to a plain number (45). Non-numeric → 0.
// Shared by the prognosis bars (PreMatch) and the odds card (OddsView).
export const parsePct = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

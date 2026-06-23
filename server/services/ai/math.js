// Deterministic pre-match math for the AI bundle (v2 "precomputed" path): de-vig the
// market, invert it to expected goals (lambda), build a Dixon-Coles score matrix, derive
// outcome probabilities, and score every candidate tip by EV under the real Kicktipp
// tiers. Handed to the LLM as GROUND TRUTH so it spends its effort on qualitative
// judgement + strategy instead of fragile Poisson/Dixon-Coles arithmetic. The market is
// the anchor (well-calibrated); venue/neutrality is already priced into the odds.

const RHO = -0.05; // Dixon-Coles low-score correction (rho in [-0.1, 0]; negative lifts 0:0 & 1:1)
const MAXG = 10;   // internal goal cap for the distribution (tail truncated + renormalized)
const GRID = 7;    // exposed/candidate score grid: goals 0..6

const FACT = (() => { const f = [1]; for (let i = 1; i <= MAXG; i++) f[i] = f[i - 1] * i; return f; })();
// Poisson pmf over 0..MAXG for a given mean (exp factored out once).
const pmfArr = (l) => { const e = Math.exp(-l); const out = []; for (let k = 0; k <= MAXG; k++) out[k] = (e * l ** k) / FACT[k]; return out; };

// Dixon-Coles tau low-score dependence (canonical 1997 parameterization; lh=home, la=away).
function tau(h, a, lh, la, rho) {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

// Normalized Dixon-Coles score matrix M[h][a] = P(home h : away a), goals 0..MAXG.
function matrix(lh, la, rho = RHO) {
  const ph = pmfArr(lh), pa = pmfArr(la);
  const M = []; let s = 0;
  for (let h = 0; h <= MAXG; h++) {
    M[h] = [];
    for (let a = 0; a <= MAXG; a++) { const p = Math.max(0, ph[h] * pa[a] * tau(h, a, lh, la, rho)); M[h][a] = p; s += p; }
  }
  for (let h = 0; h <= MAXG; h++) for (let a = 0; a <= MAXG; a++) M[h][a] /= s;
  return M;
}

// home/draw/away probabilities from a score matrix.
function outcomes(M) {
  let home = 0, draw = 0, away = 0;
  for (let h = 0; h < M.length; h++) for (let a = 0; a < M[h].length; a++) {
    if (h > a) home += M[h][a]; else if (h < a) away += M[h][a]; else draw += M[h][a];
  }
  return { home_win: home, draw, away_win: away };
}

// Remove the bookmaker overround from 1X2 decimal odds → fair probabilities (basic
// normalization; Shin not implemented). null if any leg is missing/invalid.
export function devig(home, draw, away) {
  if (![home, draw, away].every((x) => Number.isFinite(x) && x > 1)) return null;
  const inv = [1 / home, 1 / draw, 1 / away];
  const s = inv[0] + inv[1] + inv[2];
  return { home: inv[0] / s, draw: inv[1] / s, away: inv[2] / s };
}

// Invert de-vigged 1X2 probs to (lambda_home, lambda_away): the (lh,la) whose Dixon-Coles
// model best reproduces the market home/away win probs (draw is the residual). Coarse grid
// → local refine. The market is the anchor, so the fit is near-exact.
export function lambdaFromMarket(dv) {
  const err = (lh, la) => { const o = outcomes(matrix(lh, la)); return (o.home_win - dv.home) ** 2 + (o.away_win - dv.away) ** 2; };
  let best = { lh: 1.3, la: 1.1, e: Infinity };
  for (let lh = 0.2; lh <= 5.0; lh += 0.1) for (let la = 0.2; la <= 5.0; la += 0.1) {
    const e = err(lh, la); if (e < best.e) best = { lh, la, e };
  }
  const c = best;
  for (let lh = Math.max(0.05, c.lh - 0.1); lh <= c.lh + 0.1; lh += 0.02) for (let la = Math.max(0.05, c.la - 0.1); la <= c.la + 0.1; la += 0.02) {
    const e = err(lh, la); if (e < best.e) best = { lh, la, e };
  }
  return { home: +best.lh.toFixed(2), away: +best.la.toFixed(2) };
}

// EV grid: every candidate tip 0..6 scored by EV over the FULL result distribution, using
// the real (staggered, non-additive) Kicktipp tiers. Returns the top `top` tips, EV desc.
export function evGrid(M, scoring, top = 6) {
  const pts = (th, ta, rh, ra) => {
    if (th === rh && ta === ra) return scoring.exact;
    if (th - ta === rh - ra) return scoring.goal_diff;
    if (Math.sign(th - ta) === Math.sign(rh - ra)) return scoring.tendency;
    return 0;
  };
  const cands = [];
  for (let th = 0; th < GRID; th++) for (let ta = 0; ta < GRID; ta++) {
    let ev = 0;
    for (let rh = 0; rh < M.length; rh++) for (let ra = 0; ra < M[rh].length; ra++) ev += M[rh][ra] * pts(th, ta, rh, ra);
    cands.push({ home: th, away: ta, ev: +ev.toFixed(2), scoreline_probability: +(M[th]?.[ta] ?? 0).toFixed(3) });
  }
  return cands.sort((a, b) => b.ev - a.ev).slice(0, top);
}

// Full deterministic precompute for a match from its (cached) 1X2 odds + the scoring
// values. null when the market data is insufficient to anchor it.
export function precompute(odds, scoring) {
  const dv = devig(odds?.home, odds?.draw, odds?.away);
  if (!dv) return null;
  const lambda = lambdaFromMarket(dv);
  const M = matrix(lambda.home, lambda.away);
  const model = outcomes(M);
  const r3 = (x) => +x.toFixed(3);
  const score_matrix = [];
  for (let h = 0; h < GRID; h++) { score_matrix[h] = []; for (let a = 0; a < GRID; a++) score_matrix[h][a] = r3(M[h][a]); }
  return {
    lambda,
    devigged_probs: { home: r3(dv.home), draw: r3(dv.draw), away: r3(dv.away) },
    model_probs: { home_win: r3(model.home_win), draw: r3(model.draw), away_win: r3(model.away_win) },
    score_matrix,
    ev_grid: evGrid(M, scoring),
    rho: RHO,
    note: "Markt-verankert (de-vigged 1X2 → λ → Dixon-Coles). Als Grundwahrheit nutzen; nur qualitativ anpassen.",
  };
}

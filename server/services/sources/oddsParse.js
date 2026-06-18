// Shared parsing for api-football odds (pre-match /odds + in-play /odds/live) → a curated
// per-bookmaker shape: { name, mw:{home,draw,away}, ou25:{over,under}, btts:{yes,no},
//   nextGoal:{home,away,none} }. Live values carry `main`/`suspended` — prefer the main,
// then any non-suspended. The bundle/coordinator orient mw/nextGoal to our home/away.
const oddOf = (bet, re) => {
  if (!bet?.values) return null;
  const cands = bet.values.filter((e) => re.test(String(e.value).trim()));
  if (!cands.length) return null;
  const v = cands.find((c) => c.main) || cands.find((c) => !c.suspended) || cands[0];
  return v?.odd != null && Number.isFinite(Number(v.odd)) ? Number(v.odd) : null;
};

// Curated markets from a bets array (a bookmaker's `bets`, or the live `odds` feed).
export function pickMarkets(bets) {
  const find = (id, re) => (bets || []).find((b) => b.id === id || (re && re.test(String(b.name || ""))));
  const mw = find(1, /match winner|full ?time result|^1x2$/i);
  const ou = find(5, /^goals over\/under$/i) || find(null, /^over\/under$/i);
  const btts = find(8, /both teams (to )?score/i);
  const ng = find(null, /next goal/i);
  const out = {};
  const h = oddOf(mw, /^home$/i), d = oddOf(mw, /^draw$/i), a = oddOf(mw, /^away$/i);
  if (h != null || d != null || a != null) out.mw = { home: h, draw: d, away: a };
  const over = oddOf(ou, /^over 2\.5$/i), under = oddOf(ou, /^under 2\.5$/i);
  if (over != null || under != null) out.ou25 = { over, under };
  const yes = oddOf(btts, /^yes$/i), no = oddOf(btts, /^no$/i);
  if (yes != null || no != null) out.btts = { yes, no };
  const ngh = oddOf(ng, /^home$/i), nga = oddOf(ng, /^away$/i), ngn = oddOf(ng, /no goal|^draw$/i);
  if (ngh != null || nga != null) out.nextGoal = { home: ngh, away: nga, none: ngn };
  return out;
}

// Flip mw/nextGoal home↔away to our canonical orientation (O/U + BTTS are symmetric).
export function orientOdds(o, swap) {
  if (!o || !swap) return o;
  const sw = (m) => (m ? { ...m, home: m.away ?? null, away: m.home ?? null } : m);
  return { ...o, bookmakers: (o.bookmakers || []).map((bm) => ({ ...bm, mw: sw(bm.mw), nextGoal: sw(bm.nextGoal) })) };
}

// Compute a standard football group table from the played results.
// Group-stage matches carry real team codes in m.h / m.a.
export function groupStandings(groupCode, matches, results, teams) {
  const ms = matches.filter((m) => m.ph === groupCode);
  const tbl = {};
  const ensure = (c) => (tbl[c] ||= { code: c, name: teams[c]?.name || c, sp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

  for (const m of ms) { ensure(m.h); ensure(m.a); }
  for (const m of ms) {
    const r = results[m.n];
    if (!r || r.h === "" || r.a === "") continue;
    const gh = +r.h, ga = +r.a;
    const h = ensure(m.h), a = ensure(m.a);
    h.sp++; a.sp++;
    h.gf += gh; h.ga += ga; a.gf += ga; a.ga += gh;
    if (gh > ga) { h.w++; a.l++; h.pts += 3; }
    else if (gh < ga) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }

  return Object.values(tbl)
    .map((t) => ({ ...t, gd: t.gf - t.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
}

// Realistic maximum goal-difference swing per remaining match. A group position is only
// "clinched" when the lead survives EVERY remaining result combination AND any goal margin
// up to this bound — so a points-tie that goal difference would decide counts as settled
// only when the GD gap is bigger than a normal final-round scoreline could erase. A freak
// blow-out beyond ±3 per game could still theoretically flip it; in practice it can't.
const REALISTIC_SWING = 3;

// Clinched group placements, GOAL-DIFFERENCE aware (with the safety margin above). Returns
// { winner, runnerUp } as team codes (or null). A slot is named only when that exact final
// position holds across every remaining result combination within realistic margins — so it
// never shows a team a normal scoreline could still overtake on goal difference. (FIFA also
// uses head-to-head / fair-play / lots, which we don't compute; those only matter on an
// exact GD+goals tie, which the margin guard already refuses to clinch.) api-football's
// resolved pairing is the authoritative correction once it lands.
export function groupClinch(groupCode, matches, results) {
  const ms = matches.filter((m) => m.ph === groupCode);
  const codes = [...new Set(ms.flatMap((m) => [m.h, m.a]))];
  if (codes.length < 2) return { winner: null, runnerUp: null };
  const open = (n) => { const r = results[n]; return !r || r.h === "" || r.a === ""; };
  const pts0 = {}, gd0 = {}; // points + goal difference from the matches already played
  for (const c of codes) { pts0[c] = 0; gd0[c] = 0; }
  for (const m of ms) if (!open(m.n)) {
    const h = +results[m.n].h, a = +results[m.n].a;
    gd0[m.h] += h - a; gd0[m.a] += a - h;
    if (h > a) pts0[m.h] += 3; else if (a > h) pts0[m.a] += 3; else { pts0[m.h]++; pts0[m.a]++; }
  }
  const rem = ms.filter((m) => open(m.n));
  const S = REALISTIC_SWING, total = 3 ** rem.length;
  const wins = new Set(codes), seconds = new Set(codes); // eliminate as completions disprove them
  for (let mask = 0; mask < total; mask++) {
    const pts = { ...pts0 }, lo = { ...gd0 }, hi = { ...gd0 }; // GD band per team in this completion
    let x = mask;
    for (const m of rem) {
      const o = x % 3; x = (x / 3) | 0;
      if (o === 0) { pts[m.h] += 3; lo[m.h] += 1; hi[m.h] += S; lo[m.a] -= S; hi[m.a] -= 1; }      // home win
      else if (o === 1) { pts[m.a] += 3; lo[m.a] += 1; hi[m.a] += S; lo[m.h] -= S; hi[m.h] -= 1; } // away win
      else { pts[m.h]++; pts[m.a]++; }                                                              // draw (GD unchanged)
    }
    const above = (c, r) => pts[c] > pts[r] || (pts[c] === pts[r] && lo[c] > hi[r]); // c surely above r
    for (const c of codes) {
      const rivals = codes.filter((r) => r !== c);
      const ahead = rivals.filter((r) => above(r, c)).length;  // rivals surely above c
      const behind = rivals.filter((r) => above(c, r)).length; // rivals surely below c
      if (!(ahead === 0 && behind === rivals.length)) wins.delete(c);        // not guaranteed 1st
      if (!(ahead === 1 && behind === rivals.length - 1)) seconds.delete(c); // not guaranteed 2nd
    }
  }
  return { winner: [...wins][0] || null, runnerUp: [...seconds][0] || null };
}

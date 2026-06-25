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

// A group is finished once all four teams have played their three matches.
export const groupFinished = (table) => table.length === 4 && table.every((t) => t.sp >= 3);

// Ranking of the third-placed teams across all finished groups (48-team format: the best 8 of 12
// advance). Compared directly in one table by the standard criteria (Pkt → +/- → Tore); they never
// met, so there is no head-to-head tiebreak. Only finished groups contribute (D3: a third place is
// entered once its group is decided). `group` carries the source-group letter for display.
export function thirdPlaceTable(groupCodes, matches, results, teams) {
  const thirds = [];
  for (const code of groupCodes) {
    const table = groupStandings(code, matches, results, teams);
    if (!groupFinished(table) || !table[2]) continue;
    thirds.push({ ...table[2], group: code });
  }
  return thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
}

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

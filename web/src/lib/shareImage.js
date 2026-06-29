// Generate a shareable PNG (standings / Bilanz) on a <canvas> with explicit hex
// colours — independent of the app's oklch theme, so it renders in every browser.
// Then share via the Web Share API (ideal for WhatsApp on mobile) or, as a
// fallback, download the file.

const BG = "#0d0d0d", FG = "#fafafa", MUTED = "#a1a1aa", LINE = "#27272a";
const DIST = { 4: "#8b5cf6", 3: "#10b981", 2: "#0ea5e9", 1: "#f59e0b", 0: "#52525b" }; // matches PT colours

// Resolve a CSS custom property (e.g. the configurable app accent) to an rgb()
// string the canvas can use.
function cssColor(value, fallback) {
  try {
    const el = document.createElement("span");
    el.style.cssText = "position:absolute;opacity:0;pointer-events:none";
    el.style.color = value;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c && c !== "rgba(0, 0, 0, 0)" ? c : fallback;
  } catch { return fallback; }
}

function makeCanvas(w, h) {
  const dpr = Math.min(3, (window.devicePixelRatio || 1) * 1.5);
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "alphabetic";
  return { cv, ctx };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

async function exportCanvas(cv, filename, title) {
  const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
  if (!blob) throw new Error("Bild konnte nicht erzeugt werden");
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; }
    catch (e) { if (e.name === "AbortError") return; } // user cancelled → done; else fall back
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function header(ctx, w, subtitle) {
  ctx.fillStyle = FG; ctx.font = "700 24px system-ui, -apple-system, sans-serif";
  ctx.fillText("WM 2026 · Tippspiel", 28, 44);
  ctx.fillStyle = MUTED; ctx.font = "500 14px system-ui, -apple-system, sans-serif";
  ctx.fillText(subtitle, 28, 68);
}

// Standings → PNG. `totals` = leaderboard rows ({ p, name, sum }); `me` is highlighted.
export async function shareStandings(totals, { me, date } = {}) {
  const accent = cssColor("var(--app-accent)", "#22c55e");
  const rows = totals.slice(0, 24);
  const W = 620, padX = 28, top0 = 96, rowH = 40, footH = 44;
  const H = top0 + rows.length * rowH + footH;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  header(ctx, W, `Rangliste${date ? ` · ${date}` : ""}`);

  rows.forEach((t, i) => {
    const top = top0 + i * rowH;
    if (t.p === me) { ctx.fillStyle = "rgba(255,255,255,0.06)"; roundRect(ctx, padX - 12, top + 3, W - 2 * (padX - 12), rowH - 6, 8); ctx.fill(); }
    ctx.fillStyle = i < 3 ? accent : MUTED; ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.fillText(`${i + 1}`, padX, top + 26);
    ctx.fillStyle = FG; ctx.font = `${t.p === me ? 700 : 500} 16px system-ui, sans-serif`;
    ctx.fillText(fit(ctx, t.name || t.p, W - padX - 40 - 80), padX + 36, top + 26);
    ctx.fillStyle = accent; ctx.font = "800 18px system-ui, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(`${t.sum}`, W - padX, top + 26);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX - 12, top + rowH); ctx.lineTo(W - (padX - 12), top + rowH); ctx.stroke();
  });

  ctx.textAlign = "left"; ctx.fillStyle = MUTED; ctx.font = "500 12px system-ui, sans-serif";
  ctx.fillText("Albert Weil · WM-Tippspiel", padX, H - 18);
  await exportCanvas(cv, "wm-tippspiel-rangliste.png", "WM-Tippspiel · Rangliste");
}

// Personal Bilanz → PNG. `s` = playerStats() result; meta carries name/rank/total.
export async function shareBilanz(s, { name, rank, total, boardLen, date } = {}) {
  const accent = cssColor("var(--app-accent)", "#22c55e");
  const W = 560, padX = 28;
  const H = 408;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  header(ctx, W, `Meine Bilanz${date ? ` · ${date}` : ""}`);

  // player name
  ctx.fillStyle = FG; ctx.font = "700 20px system-ui, sans-serif"; ctx.textAlign = "left";
  ctx.fillText(fit(ctx, name || "—", W - 2 * padX), padX, 104);

  // hero: total + rank
  ctx.fillStyle = accent; ctx.font = "800 52px system-ui, sans-serif";
  ctx.fillText(`${total ?? s.sum}`, padX, 168);
  ctx.fillStyle = MUTED; ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillText("PUNKTE", padX, 188);
  if (rank) {
    ctx.fillStyle = FG; ctx.font = "800 52px system-ui, sans-serif"; ctx.textAlign = "right";
    ctx.fillText(`#${rank}`, W - padX, 168);
    ctx.fillStyle = MUTED; ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillText(boardLen ? `PLATZ / ${boardLen}` : "PLATZ", W - padX, 188);
    ctx.textAlign = "left";
  }

  // 4 stat tiles
  const tiles = [
    ["Getippt", `${s.tipped}`],
    ["Volltreffer", `${s.counts[3]}`],
    ["Trefferquote", `${s.hitRate}%`],
    ["Ø / Spiel", s.avg.toFixed(2)],
  ];
  const gap = 12, tw = (W - 2 * padX - gap) / 2, th = 56, ty0 = 208;
  tiles.forEach(([label, val], i) => {
    const x = padX + (i % 2) * (tw + gap), y = ty0 + Math.floor(i / 2) * (th + gap);
    ctx.fillStyle = "#18181b"; roundRect(ctx, x, y, tw, th, 10); ctx.fill();
    ctx.fillStyle = MUTED; ctx.font = "500 11px system-ui, sans-serif"; ctx.fillText(label.toUpperCase(), x + 12, y + 22);
    ctx.fillStyle = FG; ctx.font = "800 22px system-ui, sans-serif"; ctx.fillText(val, x + 12, y + 46);
  });

  // distribution bar
  const by = ty0 + 2 * (th + gap) + 6, bx = padX, bw = W - 2 * padX, bh = 14;
  const scored = s.scored || 1;
  let cx = bx;
  [4, 3, 2, 1, 0].forEach((k) => {
    const seg = (s.counts[k] / scored) * bw;
    if (seg > 0) { ctx.fillStyle = DIST[k]; ctx.fillRect(cx, by, seg, bh); cx += seg; }
  });
  ctx.fillStyle = MUTED; ctx.font = "500 11px system-ui, sans-serif";
  ctx.fillText(`Verteilung · ${s.scored} gewertet · ${s.counts[4] ? `Exakt+Sieger ${s.counts[4]} · ` : ""}Volltreffer ${s.counts[3]} · Tordiff ${s.counts[2]} · Tendenz ${s.counts[1]} · daneben ${s.counts[0]}`, bx, by + bh + 18);

  ctx.fillStyle = MUTED; ctx.font = "500 12px system-ui, sans-serif";
  ctx.fillText("Albert Weil · WM-Tippspiel", padX, H - 18);
  await exportCanvas(cv, "wm-tippspiel-bilanz.png", "WM-Tippspiel · Meine Bilanz");
}

// Head-to-head duel → PNG. `d` = head2head() result (names, sums, stats, record).
export async function shareDuel(d, { date } = {}) {
  const accent = cssColor("var(--app-accent)", "#22c55e");
  const W = 560, padX = 28, lx = W * 0.3, rx = W * 0.7, cc = W / 2;
  const rows = [
    { label: "Volltreffer", a: d.SA.counts[3], b: d.SB.counts[3] },
    { label: "Trefferquote", a: d.SA.hitRate, b: d.SB.hitRate, fmt: (v) => `${v}%` },
    { label: "Ø / Spiel", a: d.SA.avg, b: d.SB.avg, fmt: (v) => v.toFixed(2) },
    { label: "Längste Serie", a: d.SA.longest, b: d.SB.longest },
  ];
  const H = 96 + 188 + rows.length * 38 + 44;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  header(ctx, W, `Duell${date ? ` · ${date}` : ""}`);
  ctx.textAlign = "center";
  ctx.fillStyle = FG; ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillText(fit(ctx, d.aName, 180), lx, 116);
  ctx.fillText(fit(ctx, d.bName, 180), rx, 116);
  ctx.fillStyle = MUTED; ctx.font = "700 12px system-ui, sans-serif"; ctx.fillText("VS", cc, 116);
  ctx.fillStyle = accent; ctx.font = "800 46px system-ui, sans-serif";
  ctx.fillText(`${d.sumA}`, lx, 166); ctx.fillText(`${d.sumB}`, rx, 166);
  ctx.fillStyle = MUTED; ctx.font = "500 11px system-ui, sans-serif"; ctx.fillText("PUNKTE", cc, 158);
  ctx.fillText(`DIREKTER VERGLEICH · ${d.duels.length} SPIELE BEIDE GETIPPT`, cc, 196);
  ctx.fillStyle = FG; ctx.font = "800 22px system-ui, sans-serif";
  ctx.fillText(`${d.aw} : ${d.bw}${d.tie ? `   ${d.tie}×` : ""}`, cc, 224);
  let ry = 252;
  rows.forEach((r) => {
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.fillStyle = r.a > r.b ? accent : MUTED; ctx.fillText(r.fmt ? r.fmt(r.a) : `${r.a}`, lx, ry);
    ctx.fillStyle = r.b > r.a ? accent : MUTED; ctx.fillText(r.fmt ? r.fmt(r.b) : `${r.b}`, rx, ry);
    ctx.fillStyle = MUTED; ctx.font = "500 10px system-ui, sans-serif"; ctx.fillText(r.label.toUpperCase(), cc, ry);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padX, ry + 12); ctx.lineTo(W - padX, ry + 12); ctx.stroke();
    ry += 38;
  });
  ctx.textAlign = "left"; ctx.fillStyle = MUTED; ctx.font = "500 12px system-ui, sans-serif";
  ctx.fillText("Albert Weil · WM-Tippspiel", padX, H - 18);
  await exportCanvas(cv, "wm-tippspiel-duell.png", "WM-Tippspiel · Duell");
}

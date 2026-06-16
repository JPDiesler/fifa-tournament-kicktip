// Derive a representative colour from a team's flag (bundled SVG) for the lineup
// dots. Picks the most saturated hue by area, so a mostly-white flag yields its
// emblem/stripe colour instead of white. Async (rasterises the flag once via canvas)
// and cached per team code; falls back to null when no flag / extraction fails.
const localFlags = import.meta.glob("../assets/flags/*.svg", { eager: true, query: "?url", import: "default" });
const FLAGS = {};
for (const p in localFlags) FLAGS[p.split("/").pop().replace(".svg", "")] = localFlags[p];

const cache = new Map();   // code → hex | null (resolved)
const pending = new Map(); // code → Promise

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let s = 0, h = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = h * 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}

// Most prominent saturated colour: bucket pixels by hue, weight by saturation², drop
// near-white/black and greys, average the winning bucket's RGB.
function pickColor(data) {
  const N = 12, w = Array(N).fill(0), rs = Array(N).fill(0), gs = Array(N).fill(0), bs = Array(N).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.15 || l < 0.05 || l > 0.95) continue;
    const wt = s * s, k = Math.min(N - 1, Math.floor(h / (360 / N)));
    w[k] += wt; rs[k] += r * wt; gs[k] += g * wt; bs[k] += b * wt;
  }
  let best = -1, bi = -1;
  for (let k = 0; k < N; k++) if (w[k] > best) { best = w[k]; bi = k; }
  if (bi < 0 || best <= 0) return null;
  const r = Math.round(rs[bi] / w[bi]), g = Math.round(gs[bi] / w[bi]), b = Math.round(bs[bi] / w[bi]);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function flagColor(code) {
  if (!code) return Promise.resolve(null);
  if (cache.has(code)) return Promise.resolve(cache.get(code));
  if (pending.has(code)) return pending.get(code);
  const url = FLAGS[code];
  if (!url) { cache.set(code, null); return Promise.resolve(null); }
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = 32; c.height = 21;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 32, 21);
        const hex = pickColor(ctx.getImageData(0, 0, 32, 21).data);
        cache.set(code, hex); resolve(hex);
      } catch { cache.set(code, null); resolve(null); }
    };
    img.onerror = () => { cache.set(code, null); resolve(null); };
    img.src = url;
  });
  pending.set(code, p);
  return p;
}

// Readable number colour (near-black or white) for a given dot background.
export function textOn(hex) {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111827" : "#ffffff";
}

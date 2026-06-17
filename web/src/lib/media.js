// api-sports media CDN — logos/photos by entity id. These image calls are free and
// do NOT count toward the API daily quota (only a per-second/minute rate). Returns
// null when no id is known so callers can fall back (flag, initials, …).
const BASE = "https://media.api-sports.io/football";
export const playerPhoto = (id) => (id ? `${BASE}/players/${id}.png` : null);
export const teamCrest = (id) => (id ? `${BASE}/teams/${id}.png` : null);
export const coachPhoto = (id) => (id ? `${BASE}/coachs/${id}.png` : null); // api-sports uses "coachs"

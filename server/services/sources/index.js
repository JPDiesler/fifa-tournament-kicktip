// Result-source adapter registry. The sole provider is API-Football
// (v3.football.api-sports.io) — it supplies every feature (results, live minute,
// scorers, cards, lineups, statistics, predictions, odds). The coordinator
// (coordinator.js) drives all fetches within the provider's per-minute/daily budget.
import { apifootball, mapApiFootballFixture } from "./apifootball.adapter.js";

export const ADAPTERS = { apifootball };
export const getAdapter = (id) => ADAPTERS[id] || null;
export const listAdapters = () => Object.values(ADAPTERS);

export const DEFAULT_SOURCE = "apifootball";
export function activeSource() { return apifootball; }

// Re-exported for tests.
export { mapApiFootballFixture };

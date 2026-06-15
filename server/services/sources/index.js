// Result-source adapter registry. Each adapter normalises one provider's fixtures
// to a common shape and declares/probes its capabilities. The coordinator (see
// coordinator.js) fans out across adapters per feature; activeSource() is the
// single-provider compat path (chosen via DATA_SOURCE).
import { footballdata, mapFootballDataMatch } from "./footballdata.adapter.js";
import { apifootball, mapApiFootballFixture } from "./apifootball.adapter.js";

export const ADAPTERS = { footballdata, apifootball };
export const getAdapter = (id) => ADAPTERS[id] || null;
export const listAdapters = () => Object.values(ADAPTERS);

export const DEFAULT_SOURCE = (process.env.DATA_SOURCE || "footballdata").toLowerCase();
export function activeSource() { return ADAPTERS[DEFAULT_SOURCE] || ADAPTERS.footballdata; }

// Compat: probe the active source (admin "test" button, single-provider path).
export function probeSource() { return activeSource().probe(); }

// Re-exported for tests.
export { mapFootballDataMatch, mapApiFootballFixture };

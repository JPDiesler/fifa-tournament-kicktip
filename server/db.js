// Thin barrel over the focused db/ submodules. The public API (every named export
// below) is unchanged, so consumers keep importing from "./db.js" / "../db.js".
// Submodules NEVER import from here — they import the shared instance from
// "./db/connection.js" — so there is no circular dependency.
export { db, getSetting, setSetting } from "./db/connection.js";
export * from "./db/users.js";
export * from "./db/tips.js";
export * from "./db/matches.js";
export * from "./db/ai.js";
export * from "./db/push.js";
export * from "./db/settings.js";
export * from "./db/state.js";

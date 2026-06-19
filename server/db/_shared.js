import { db } from "./connection.js";

// Cross-cutting private helpers shared by more than one submodule. NOT re-exported
// by the db.js barrel (it only `export *`s the thematic modules), so the public API
// stays unchanged.

// Find-or-create a (deactivated) player account by kuerzel — used by the tip/champ writes.
export const ensureUserByKuerzel = (k) => {
  let u = db.prepare("SELECT * FROM users WHERE kuerzel=?").get(k);
  if (!u) {
    const info = db.prepare("INSERT INTO users(kuerzel,name,kind,is_active) VALUES(?,?,?,0)").run(k, k, "basic");
    u = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  }
  return u;
};

// id → kuerzel map for the real players (excludes the superadmin operator account).
export const kuerzelById = () => {
  const map = {};
  for (const u of db.prepare("SELECT id,kuerzel FROM users WHERE kuerzel IS NOT NULL AND is_superadmin=0").all()) map[u.id] = u.kuerzel;
  return map;
};

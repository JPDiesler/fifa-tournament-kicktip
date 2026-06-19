import { db } from "./connection.js";

// ---------- users ----------
export const getUserByKuerzel = (k) => db.prepare("SELECT * FROM users WHERE kuerzel=?").get(k);

// ---------- user CRUD (auth + admin management) ----------
export const getUserById = (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id);
export const getUserByUsername = (u) => db.prepare("SELECT * FROM users WHERE username=?").get(u);
export const getUserByEntraOid = (oid) => db.prepare("SELECT * FROM users WHERE entra_oid=?").get(oid);
export const getUserByEntraUpn = (upn) => db.prepare("SELECT * FROM users WHERE lower(entra_upn)=lower(?)").get(upn);
export const listUsers = () =>
  db.prepare("SELECT * FROM users ORDER BY (kuerzel IS NULL), kuerzel, username, entra_upn").all();
export const countAdmins = () => db.prepare("SELECT COUNT(*) c FROM users WHERE is_admin=1 AND is_active=1").get().c;

export function createUser({
  kuerzel = null, name = null, kind = "basic", username = null, pass_hash = null,
  entra_oid = null, entra_upn = null, is_admin = 0, is_active = 1, is_superadmin = 0,
}) {
  const info = db
    .prepare(`INSERT INTO users(kuerzel,name,kind,username,pass_hash,entra_oid,entra_upn,is_admin,is_active,is_superadmin)
              VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(kuerzel, name, kind, username, pass_hash, entra_oid, entra_upn, is_admin ? 1 : 0, is_active ? 1 : 0, is_superadmin ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}
export function updateUser(id, fields) {
  const allowed = ["kuerzel", "name", "username", "pass_hash", "entra_oid", "entra_upn", "is_admin", "is_active", "is_superadmin",
    "is_ai", "ai_provider", "ai_model", "ai_key_enc", "ai_logo"];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return getUserById(id);
  const vals = { id };
  for (const k of keys) vals[k] = typeof fields[k] === "boolean" ? (fields[k] ? 1 : 0) : fields[k];
  db.prepare(`UPDATE users SET ${keys.map((k) => `${k}=@${k}`).join(", ")} WHERE id=@id`).run(vals);
  return getUserById(id);
}
export const deleteUser = (id) => db.prepare("DELETE FROM users WHERE id=?").run(id);

import bcrypt from "bcryptjs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  getUserById, getUserByUsername, getUserByEntraOid, getUserByEntraUpn,
  createUser, updateUser, countAdmins,
} from "../db.js";

// ---------- passwords ----------
export const hashPassword = (pw) => bcrypt.hashSync(pw, 10);
export const verifyPassword = (pw, hash) => !!hash && bcrypt.compareSync(pw, hash);

// ---------- Entra config / public client config ----------
const TENANT = process.env.ENTRA_TENANT_ID || "";
const CLIENT_ID = process.env.ENTRA_CLIENT_ID || "";
export const entraConfigured = () => !!(TENANT && CLIENT_ID);

export function publicConfig() {
  return {
    appName: "WM 2026 · Tippspiel",
    accent: process.env.ACCENT_COLOR || "", // CSS color; empty = default (leaderboard green)
    entra: entraConfigured()
      ? { clientId: CLIENT_ID, tenantId: TENANT, authority: `https://login.microsoftonline.com/${TENANT}` }
      : null,
  };
}

// ---------- Entra ID-token verification (JWKS) ----------
let _jwks = null;
const jwks = () => (_jwks ||= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`)));
export async function verifyEntraIdToken(idToken) {
  if (!entraConfigured()) throw new Error("Entra ist nicht konfiguriert");
  const { payload } = await jwtVerify(idToken, jwks(), {
    audience: CLIENT_ID,
    issuer: `https://login.microsoftonline.com/${TENANT}/v2.0`,
  });
  return payload; // { oid, preferred_username, name, email, ... }
}

// ---------- DTO + middleware ----------
export const userDto = (u) =>
  u && {
    id: u.id,
    kuerzel: u.kuerzel,
    name: u.name || u.kuerzel || u.username || u.entra_upn,
    kind: u.kind,
    username: u.username,
    upn: u.entra_upn,
    isAdmin: !!u.is_admin,
    isSuperadmin: !!u.is_superadmin,
    isActive: !!u.is_active,
  };

// Richer DTO for the admin user-management table.
export const adminUserDto = (u) =>
  u && {
    id: u.id,
    kuerzel: u.kuerzel,
    name: u.name,
    kind: u.kind,
    username: u.username,
    upn: u.entra_upn,
    isAdmin: !!u.is_admin,
    isSuperadmin: !!u.is_superadmin,
    isActive: !!u.is_active,
    createdAt: u.created_at,
    hasPassword: !!u.pass_hash,
  };

export function requireAuth(req, res, next) {
  const id = req.session?.userId;
  const u = id ? getUserById(id) : null;
  if (!u || !u.is_active) {
    if (req.session) req.session.destroy(() => {});
    return res.status(401).json({ error: "nicht angemeldet" });
  }
  req.user = u;
  next();
}
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => (req.user.is_admin ? next() : res.status(403).json({ error: "kein Admin" })));
}

// ---------- the .env operator account (superadmin: admin, but never a player) ----------
// Reconciled on every boot: always present, active, kuerzel cleared (so it never
// shows up in the leaderboard / tip overviews and can't tip).
export function bootstrapAdmin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || process.env.ADMIN_PIN || "wm2026";
  const existing = getUserByUsername(username);
  if (existing) {
    updateUser(existing.id, { is_admin: 1, is_superadmin: 1, is_active: 1, kuerzel: null });
  } else {
    createUser({ username, name: "Administrator", kind: "basic", pass_hash: hashPassword(password), is_admin: 1, is_superadmin: 1, is_active: 1 });
    console.log(`Superadmin angelegt: username="${username}" (Passwort via ADMIN_PASSWORD/ADMIN_PIN, Default "wm2026").`);
  }
}

export { getUserByEntraOid, getUserByEntraUpn };

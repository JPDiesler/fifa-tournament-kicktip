import crypto from "crypto";
import PDFDocument from "pdfkit";

// Unambiguous alphabet (no 0/O/1/l/I) for human-typeable passwords.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function genPassword(len = 14) {
  const b = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

// Plaintext passwords are never stored (only the bcrypt hash). We keep a freshly
// created/reset password in memory just long enough for the admin to download the
// PDF once.
const TTL_MS = 15 * 60 * 1000;
const cache = new Map();
export function cacheCredential(userId, data) {
  cache.set(userId, { ...data, exp: Date.now() + TTL_MS });
}
export function getCredential(userId) {
  const c = cache.get(userId);
  if (!c) return null;
  if (Date.now() > c.exp) { cache.delete(userId); return null; }
  return c;
}

export function streamCredentialsPdf(res, { appUrl, username, password, name, kuerzel }) {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="wm-tippspiel-${username}.pdf"`);
  doc.pipe(res);

  doc.fontSize(22).fillColor("#111").text("WM 2026 · Tippspiel");
  doc.moveDown(0.3).fontSize(12).fillColor("#666").text("Deine persönlichen Zugangsdaten");
  doc.moveDown(1.5);

  const row = (label, value) => {
    doc.fontSize(11).fillColor("#888").text(label);
    doc.fontSize(15).fillColor("#111").text(value || "—");
    doc.moveDown(0.8);
  };
  if (name) row("Name", name);
  if (kuerzel) row("Kürzel", kuerzel);
  row("Login-Adresse", appUrl || "(siehe Einladung)");
  row("Benutzername", username);
  row("Passwort", password);

  doc.moveDown(1).fontSize(10).fillColor("#888")
    .text("Bitte bewahre diese Daten sicher auf. Das Passwort kann aus Sicherheitsgründen später nicht mehr angezeigt, sondern nur neu gesetzt werden.", { width: 440 });

  doc.end();
}

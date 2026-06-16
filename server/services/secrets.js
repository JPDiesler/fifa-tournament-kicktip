// AES-256-GCM encryption for secrets at rest — currently the per-AI-player LLM
// provider API keys. The 32-byte key is derived (scrypt, deterministic) from
// AI_KEY_SECRET, falling back to SESSION_SECRET. Ciphertext is stored as
// "iv:tag:ciphertext" (all base64). Plaintext keys exist only in memory during a
// provider call — they are NEVER serialised to the client and NEVER logged.
import crypto from "node:crypto";
import { SESSION_SECRET } from "../config.js";

const SECRET = process.env.AI_KEY_SECRET || SESSION_SECRET;
if (!process.env.AI_KEY_SECRET)
  console.warn("⚠  AI_KEY_SECRET nicht gesetzt — KI-Keys werden aus SESSION_SECRET abgeleitet; eine Rotation von SESSION_SECRET würde gespeicherte Keys unlesbar machen.");

// scrypt is deterministic for the same (secret, salt) → a stable key across restarts.
const KEY = crypto.scryptSync(SECRET, "wm-tippspiel-ai", 32);

// Encrypt a plaintext secret → "iv:tag:ct" (base64). Empty/nullish → null.
export function encryptSecret(plain) {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

// Decrypt "iv:tag:ct" → plaintext, or null if the data is missing/corrupt or the
// key no longer matches (e.g. SESSION_SECRET was rotated without AI_KEY_SECRET set).
export function decryptSecret(enc) {
  if (!enc) return null;
  try {
    const [ivB, tagB, ctB] = String(enc).split(":");
    if (!ivB || !tagB || !ctB) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

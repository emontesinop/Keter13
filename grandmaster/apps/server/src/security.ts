import crypto from "node:crypto";
import { config } from "./config";

// ---- Passwords (scrypt, N=2^15) ----
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, s, h] = stored.split("$");
  if (alg !== "scrypt") return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, "base64"), 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(h, "base64");
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

// ---- Session tokens (JWT HS256) ----
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
export function signJwt(payload: Record<string, unknown>, ttlSeconds = 60 * 60 * 24 * 30): string {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
export function verifyJwt<T = Record<string, unknown>>(token: string): T | null {
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  const sig = crypto.createHmac("sha256", config.jwtSecret).update(`${h}.${b}`).digest();
  const given = Buffer.from(s, "base64url");
  if (given.length !== sig.length || !crypto.timingSafeEqual(given, sig)) return null;
  const payload = JSON.parse(Buffer.from(b, "base64url").toString());
  if (typeof payload.exp === "number" && payload.exp < Date.now() / 1000) return null;
  return payload as T;
}

// ---- Encryption at rest for third-party tokens (AES-256-GCM) ----
function encKey(): Buffer {
  const raw = config.tokenEncKey;
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes (hex or base64)");
    return buf;
  }
  // Dev fallback derived from JWT secret (never used in production — see assertProductionSecrets)
  return crypto.createHash("sha256").update("enc:" + config.jwtSecret).digest();
}
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}
export function decrypt(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const d = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

// ---- PKCE ----
export function pkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
export const randomId = (n = 24) => crypto.randomBytes(n).toString("base64url");

export class WrongPassword extends Error {
  constructor() {
    super("Contraseña incorrecta o archivo dañado");
  }
}

const ITERATIONS = 210_000;
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function chunkedB64(u: Uint8Array): string {
  let out = "";
  for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(out);
}

export async function encryptJSON(obj: unknown, pass: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(pass, salt), enc.encode(JSON.stringify(obj))),
  );
  return JSON.stringify({ maljut: 1, kdf: "PBKDF2-SHA256", iter: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: chunkedB64(ct) });
}

export async function decryptJSON<T = unknown>(payload: string, pass: string): Promise<T> {
  let p: { salt: string; iv: string; ct: string };
  try {
    p = JSON.parse(payload);
  } catch {
    throw new Error("El archivo no es una copia de Maljut");
  }
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p.iv) }, await key(pass, unb64(p.salt)), unb64(p.ct));
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    throw new WrongPassword();
  }
}

/**
 * Honest Money Seed Vault — open, documented encrypted seed backup.
 * Spec: docs/seed-vault-format.md. Uses only WebCrypto (works offline,
 * in any modern browser, no app or licence needed to recover).
 *
 * Text form:  HMVAULT1.<iterations>.<salt b64url>.<iv b64url>.<ciphertext b64url>
 * Key:        PBKDF2-HMAC-SHA512(password NFKD, salt 16 bytes, iterations) -> 32 bytes
 * Cipher:     AES-256-GCM, 12-byte IV, AAD = "HMVAULT1"
 * Plaintext:  the seed phrase, words separated by single spaces (UTF-8)
 */
import { assessPassword } from "../security/password-strength";

export const VAULT_PREFIX = "HMVAULT1";
export const DEFAULT_ITERATIONS = 1_000_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKD")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-512", salt: salt as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function normalizeSeed(seed: string): string {
  return seed.trim().toLowerCase().split(/\s+/).join(" ");
}

export async function lockSeed(seed: string, password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  return lockTypedText(normalizeSeed(seed), password, iterations);
}

/** Lock any UTF-8 text (a seed phrase, or a JSON vault/backup payload). */
export async function lockText(text: string, password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 10_000_000) throw new Error("Invalid encryption iteration count.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(VAULT_PREFIX) }, key, enc.encode(text)),
  );
  return [VAULT_PREFIX, String(iterations), b64u(salt), b64u(iv), b64u(ct)].join(".");
}

/**
 * Lock with a password the owner TYPED (transfer pages, recovery-page seeds).
 * Enforces the same strength rule as the app UI at the format boundary.
 * Coin-QR credentials are exempt by design and go through lockText directly.
 */
export async function lockTypedText(text: string, password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const v = assessPassword(password);
  if (!v.ok) throw new Error(v.message);
  return lockText(text, password, iterations);
}

export const unlockSeed = unlockText;

export async function unlockText(vault: string, password: string): Promise<string> {
  if (vault.length > 3 * 1024 * 1024) throw new Error("Encrypted backup must be under 3 MB.");
  const parts = vault.trim().replace(/\s+/g, "").split(".");
  if (parts.length !== 5 || parts[0] !== VAULT_PREFIX) throw new Error("That isn't a Seed Vault code.");
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 10_000_000) throw new Error("That isn't a Seed Vault code.");
  const key = await deriveKey(password, unb64u(parts[2]), iterations);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64u(parts[3]) as BufferSource, additionalData: enc.encode(VAULT_PREFIX) },
      key,
      unb64u(parts[4]) as BufferSource,
    );
    return dec.decode(pt);
  } catch {
    throw new Error("Wrong password, or the code was damaged.");
  }
}

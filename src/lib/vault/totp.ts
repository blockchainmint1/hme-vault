/** Offline TOTP (RFC 6238) authenticator. Pure functions; no network, no storage. */

export interface TotpParams {
  label: string;
  issuer: string;
  /** Base32 secret, uppercase, no padding. */
  secret: string;
  digits: number;
  period: number;
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32ToBytes(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) throw new Error("Invalid base32 secret.");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Accepts an otpauth://totp/... URI or a bare base32 secret. */
export function parseOtpAuth(text: string): TotpParams {
  const t = text.trim();
  if (t.length > 2048) throw new Error("That isn't an authenticator code.");
  if (!t.toLowerCase().startsWith("otpauth://")) {
    const bytes = base32ToBytes(t);
    if (bytes.length < 10) throw new Error("That setup code is too short to be safe.");
    return { label: "", issuer: "", secret: t.toUpperCase().replace(/=+$/, "").replace(/\s+/g, ""), digits: 6, period: 30 };
  }
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    throw new Error("That isn't a valid authenticator QR.");
  }
  if (url.protocol !== "otpauth:" || url.host !== "totp") throw new Error("Only time-based (TOTP) authenticator codes are supported.");
  const secret = (url.searchParams.get("secret") ?? "").toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  const bytes = base32ToBytes(secret);
  if (bytes.length < 10) throw new Error("That setup code is too short to be safe.");
  const algorithm = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
  if (algorithm !== "SHA1") throw new Error("This account uses " + algorithm + " codes, which Vault does not support yet.");
  const digits = Number(url.searchParams.get("digits") ?? "6");
  const period = Number(url.searchParams.get("period") ?? "30");
  if (digits !== 6 && digits !== 8) throw new Error("Only 6 or 8 digit codes are supported.");
  if (!Number.isInteger(period) || period < 5 || period > 300) throw new Error("Unsupported code interval.");
  const label = decodeURIComponent(url.pathname.replace(/^\//, "")).slice(0, 200);
  const issuer = (url.searchParams.get("issuer") ?? "").slice(0, 200);
  return { label, issuer, secret, digits, period };
}

/** Serialize back to a canonical otpauth URI for storage. */
export function toOtpAuthUri(p: TotpParams): string {
  const q = new URLSearchParams({ secret: p.secret, digits: String(p.digits), period: String(p.period) });
  if (p.issuer) q.set("issuer", p.issuer);
  return `otpauth://totp/${encodeURIComponent(p.label)}?${q.toString()}`;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, message as BufferSource));
}

/** Current 6/8-digit code for a given time (RFC 6238, SHA-1). */
export async function totpCode(p: TotpParams, nowMs: number): Promise<string> {
  const counter = Math.floor(nowMs / 1000 / p.period);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setUint32(4, counter >>> 0, false);
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 0x100000000), false);
  const h = await hmacSha1(base32ToBytes(p.secret), msg);
  const offset = h[h.length - 1] & 0x0f;
  const n = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(n % 10 ** p.digits).padStart(p.digits, "0");
}

export function secondsRemaining(p: TotpParams, nowMs: number): number {
  return p.period - (Math.floor(nowMs / 1000) % p.period);
}

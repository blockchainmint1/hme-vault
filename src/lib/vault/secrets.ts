/** Browser-safe secret validation and merging. Never writes plaintext to disk. */
import { parseOtpAuth, toOtpAuthUri } from "./totp";

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_VAULT_CHARS = 2 * 1024 * 1024;
export interface SecretEntry {
  id: string;
  name: string;
  type: "password" | "note" | "file" | "totp";
  content: string;
  filename?: string;
  createdAt: number;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}
export function base64ToBytes(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export function validateSecret(value: unknown): SecretEntry {
  if (!value || typeof value !== "object") throw new Error("Invalid secret entry.");
  const s = value as SecretEntry;
  if (
    typeof s.id !== "string" ||
    !s.id ||
    typeof s.name !== "string" ||
    !s.name.trim() ||
    s.name.length > 200 ||
    typeof s.content !== "string" ||
    !Number.isFinite(s.createdAt) ||
    !["password", "note", "file", "totp"].includes(s.type)
  )
    throw new Error("Invalid secret entry.");
  if (s.type === "totp") {
    // Normalizes to a canonical otpauth URI; throws on anything invalid.
    return {
      id: s.id,
      name: s.name.trim(),
      type: s.type,
      content: toOtpAuthUri(parseOtpAuth(s.content)),
      createdAt: s.createdAt,
    };
  }
  if (s.type === "file") {
    if (
      typeof s.filename !== "string" ||
      !s.filename ||
      s.filename.length > 200 ||
      /[\\/\x00-\x1f]/.test(s.filename) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s.content)
    )
      throw new Error("Invalid secret file.");
    if (
      s.content.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
      base64ToBytes(s.content).length > MAX_FILE_BYTES
    )
      throw new Error("Files must be 256 KB or smaller.");
  } else if (new TextEncoder().encode(s.content).length > MAX_FILE_BYTES)
    throw new Error("Secrets must be 256 KB or smaller.");
  return {
    id: s.id,
    name: s.name.trim(),
    type: s.type,
    content: s.content,
    ...(s.type === "file" ? { filename: s.filename } : {}),
    createdAt: s.createdAt,
  };
}
export function mergeSecrets(existing: SecretEntry[], incoming: SecretEntry[]) {
  const secrets = [...existing];
  let added = 0,
    skipped = 0;
  for (const raw of incoming) {
    const s = validateSecret(raw);
    if (
      secrets.some((e) => e.type === s.type && e.content === s.content && e.filename === s.filename)
    )
      skipped++;
    else {
      secrets.push(secrets.some((e) => e.id === s.id) ? { ...s, id: crypto.randomUUID() } : s);
      added++;
    }
  }
  return { secrets, added, skipped };
}

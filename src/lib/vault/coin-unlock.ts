import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { base58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { wordsFromScan } from "./scan-seed";

const wif = base58check(sha256);

/** Old-style coin private key: WIF (any coin prefix, checksum verified) or 64-char hex. */
function privateKeyFromScan(text: string): string | null {
  const t = text.replace(/^(wif:|privkey:|texitcoin:|txc:|isk:|bitcoin:|btc:)/i, "").trim();
  const hex = t.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    if (/^0+$/.test(hex)) throw new Error("That private key is empty.");
    return hex.toLowerCase();
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{50,53}$/.test(t)) {
    let bytes: Uint8Array;
    try { bytes = wif.decode(t); } catch { throw new Error("That private key QR is damaged (checksum failed)."); }
    if (bytes.length !== 33 && !(bytes.length === 34 && bytes[33] === 1)) throw new Error("That isn't a valid private key.");
    return t; // WIF is case-sensitive: keep exactly as printed
  }
  return null;
}

/** Coin credential: whatever the coin QR holds. Seeds and keys are normalized so rescans match; anything else is used exactly as scanned. */
export function coinPasswordFromScan(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("That QR code is empty.");
  if (trimmed.length > 4096) throw new Error("That QR code is too large to use as a password.");
  try { const key = privateKeyFromScan(trimmed); if (key) return key; } catch { /* not a key: use as scanned */ }
  if (/^[a-zA-Z\s]+$/.test(trimmed) || /^\d+$/.test(trimmed)) {
    try { const words = wordsFromScan(trimmed); if (validateMnemonic(words, wordlist)) return words; } catch { /* not a seed */ }
  }
  return trimmed;
}

export function confirmCoinPassword(first: string, second: string, acknowledged: boolean): string {
  if (!acknowledged) throw new Error("Confirm the coin unlock risks first.");
  const a = coinPasswordFromScan(first);
  const b = coinPasswordFromScan(second);
  if (a !== b) throw new Error("The two scans are different. Scan the same coin twice.");
  return a;
}

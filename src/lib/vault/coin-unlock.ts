import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { base58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { wordsFromScan } from "./scan-seed";

const wif = base58check(sha256);

/** Old-style coin private key: WIF (any coin prefix, checksum verified) or 64-char hex. */
function privateKeyFromScan(text: string): string | null {
  const t = text.replace(/^(wif:|privkey:)/i, "").trim();
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

/** Coin credential: hidden BIP39 seed words or an old-style private key. Never a public ID/address. */
export function coinPasswordFromScan(text: string): string {
  if (text.length > 1024) throw new Error("That isn't a hidden seed or private key QR.");
  const trimmed = text.trim();
  const key = privateKeyFromScan(trimmed);
  if (key) return key;
  if (!/^[a-zA-Z\s]+$/.test(trimmed) && !/^\d+$/.test(trimmed)) {
    throw new Error("Scan the hidden seed or private key QR, not an address, link or public coin label.");
  }
  const words = wordsFromScan(trimmed);
  if (!validateMnemonic(words, wordlist)) throw new Error("Scan a valid hidden seed or private key QR, not the public coin QR.");
  return words;
}

export function confirmCoinPassword(first: string, second: string, acknowledged: boolean): string {
  if (!acknowledged) throw new Error("Confirm the coin unlock risks first.");
  const a = coinPasswordFromScan(first);
  const b = coinPasswordFromScan(second);
  if (a !== b) throw new Error("The two scans are different. Scan the same coin twice.");
  return a;
}

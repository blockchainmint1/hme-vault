import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { wordsFromScan } from "./scan-seed";

/** The existing sealed coin QR contains BIP39 words, not a public coin ID. */
export function coinPasswordFromScan(text: string): string {
  if (text.length > 1024) throw new Error("That isn't a hidden seed QR.");
  const trimmed = text.trim();
  if (!/^[a-zA-Z\s]+$/.test(trimmed) && !/^\d+$/.test(trimmed)) {
    throw new Error("Scan the hidden seed QR, not an address, link or public coin label.");
  }
  const words = wordsFromScan(trimmed);
  if (!validateMnemonic(words, wordlist)) throw new Error("Scan a valid hidden seed QR, not the public coin QR.");
  return words;
}

export function confirmCoinPassword(first: string, second: string, acknowledged: boolean): string {
  if (!acknowledged) throw new Error("Confirm the coin unlock risks first.");
  const a = coinPasswordFromScan(first);
  const b = coinPasswordFromScan(second);
  if (a !== b) throw new Error("The two scans are different. Scan the same coin twice.");
  return a;
}
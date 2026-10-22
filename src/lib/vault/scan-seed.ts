import { wordlist } from "@scure/bip39/wordlists/english.js";

/** Turn a scanned QR into recovery words. Accepts plain words or a Standard SeedQR (4 digits per word). */
export function wordsFromScan(text: string): string {
  const t = text.trim();
  if (/^\d+$/.test(t) && t.length % 4 === 0) {
    const idx = t.match(/\d{4}/g)!.map(Number);
    if ([12, 15, 18, 21, 24].includes(idx.length) && idx.every((i) => i < 2048))
      return idx.map((i) => wordlist[i]).join(" ");
  }
  return t
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

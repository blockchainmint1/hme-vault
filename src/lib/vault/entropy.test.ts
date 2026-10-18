import { describe, it, expect } from "vitest";
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { newSeedWords, isValidSeed } from "./seeds";

describe("new seed entropy", () => {
  it("12 words carry 128 bits and 24 words carry 256 bits", () => {
    expect(mnemonicToEntropy(newSeedWords(12), wordlist)).toHaveLength(16);
    expect(mnemonicToEntropy(newSeedWords(24), wordlist)).toHaveLength(32);
  });
  it("produces valid, never-repeating seeds", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const w = newSeedWords(24);
      expect(isValidSeed(w)).toBe(true);
      expect(seen.has(w)).toBe(false);
      seen.add(w);
    }
  });
});

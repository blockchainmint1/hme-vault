import { describe, expect, it } from "vitest";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  mergeSeeds,
  parsePayload,
  seedFingerprint,
  singleSeedTransferPayload,
  type SeedEntry,
} from "./seeds";

function makeEntry(name: string, passphrase?: string): SeedEntry {
  const words = generateMnemonic(wordlist);
  return {
    id: crypto.randomUUID(),
    name,
    words,
    ...(passphrase ? { passphrase } : {}),
    fingerprint: seedFingerprint(words, passphrase ?? ""),
    createdAt: 1,
  };
}
import { lockTypedText, unlockText } from "./format";

describe("single-seed transfer", () => {
  it("contains exactly one seed, no secrets, and only allowlisted fields", async () => {
    const seed = { ...makeEntry("Gift", "pp"), extra: "leak" };
    const p = singleSeedTransferPayload(seed);
    expect(p.kind).toBe("hm-seed-vault");
    expect(p.seeds).toHaveLength(1);
    expect(p.secrets).toEqual([]);
    expect(Object.keys(p.seeds[0]).sort()).toEqual(
      ["createdAt", "fingerprint", "id", "name", "passphrase", "words"].sort(),
    );
  });

  it("omits passphrase when the seed has none", async () => {
    const seed = makeEntry("Plain");
    expect("passphrase" in singleSeedTransferPayload(seed).seeds[0]).toBe(false);
  });

  it("rejects a weak transfer password", async () => {
    const seed = makeEntry("Gift");
    await expect(
      lockTypedText(JSON.stringify(singleSeedTransferPayload(seed)), "password", 1000),
    ).rejects.toThrow();
  });

  it("round-trips and merges additively, skipping a duplicate", async () => {
    const seed = makeEntry("Gift");
    const pw = "Orbit-Walnut-Glacier-73!";
    const code = await lockTypedText(JSON.stringify(singleSeedTransferPayload(seed)), pw, 1000);
    const parsed = parsePayload(await unlockText(code, pw));
    const mine = makeEntry("Mine");
    const once = mergeSeeds([mine], parsed.seeds);
    expect(once.added).toBe(1);
    expect(once.seeds.map((s) => s.fingerprint)).toContain(seed.fingerprint);
    expect(mergeSeeds(once.seeds, parsed.seeds).added).toBe(0);
  });
});

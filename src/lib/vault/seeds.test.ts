import { describe, expect, it } from "vitest";
import { deriveKeys, lockoutMs, mergeSeeds, shouldAutoLock, type SeedEntry } from "./seeds";

const SEED = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const e = (id: string, words: string, passphrase?: string): SeedEntry => ({ id, name: id, words, passphrase, fingerprint: "x", createdAt: 0 });

describe("vault rules", () => {
  it("restore skips a seed already in the vault", () => {
    const r = mergeSeeds([e("a", SEED)], [e("b", SEED), e("c", "zoo zoo")]);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.seeds).toHaveLength(2);
  });
  it("same words with a different passphrase count as a different seed", () => {
    expect(mergeSeeds([e("a", SEED)], [e("b", SEED, "extra")]).added).toBe(1);
  });
  it("no wait for the first 10 wrong passwords, then 30s doubling, capped at 1 hour", () => {
    expect(lockoutMs(9)).toBe(0);
    expect(lockoutMs(10)).toBe(30_000);
    expect(lockoutMs(11)).toBe(60_000);
    expect(lockoutMs(40)).toBe(3_600_000);
  });
  it("auto-locks after 2 minutes idle", () => {
    expect(shouldAutoLock(0, 119_999)).toBe(false);
    expect(shouldAutoLock(0, 120_000)).toBe(true);
  });
  it("derives the known fingerprint and Ethereum address for the test seed", async () => {
    const k = await deriveKeys(SEED);
    expect(k.fingerprint).toBe("73c5da0a");
    expect(k.evmAddress.toLowerCase()).toBe("0x9858effd232b4033e47d90003d41ec34ecaeda94");
  });
});

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

describe("give-a-copy extras", () => {
  it("never puts the shared date in the copy, and renames only the copy", async () => {
    const { singleSeedTransferPayload: p } = await import("./seeds");
    const s = { ...makeEntry("Mine"), sharedAt: 123 };
    const copy = p(s, "  Theirs ")!.seeds[0];
    expect(copy.name).toBe("Theirs");
    expect(copy).not.toHaveProperty("sharedAt");
    expect(p(s, "")!.seeds[0].name).toBe("Mine");
  });
  it("records the shared date for only that seed and keeps it through the locked vault", async () => {
    const { markSeedShared } = await import("./seeds");
    const a = makeEntry("A");
    const b = makeEntry("B");
    const out = markSeedShared([a, b], a.id, 1762776000000);
    expect(out[0].sharedAt).toBe(1762776000000);
    expect(out[1].sharedAt).toBeUndefined();
    const back = parsePayload(JSON.stringify({ v: 1, kind: "hm-seed-vault", seeds: out }));
    expect(back.seeds[0].sharedAt).toBe(1762776000000);
  });
  it("generates six wordlist words that pass the strength check", async () => {
    const { generateTransferPassphrase } = await import("./seeds");
    const { assessPassword } = await import("../security/password-strength");
    const g = generateTransferPassphrase();
    expect(g.split(" ")).toHaveLength(6);
    for (const w of g.split(" ")) expect(wordlist).toContain(w);
    expect(assessPassword(g).ok).toBe(true);
  });
});

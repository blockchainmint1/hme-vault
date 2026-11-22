/** Private record of which trading pockets were shown to which service (audit item 6). */
import { describe, expect, it } from "vitest";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  exportablePayload,
  MAX_POCKET_SHARES,
  parsePayload,
  recordPocketShare,
  seedFingerprint,
  singleSeedTransferPayload,
  type SeedEntry,
} from "./seeds";

function entry(name: string): SeedEntry {
  const words = generateMnemonic(wordlist);
  return {
    id: crypto.randomUUID(),
    name,
    words,
    fingerprint: seedFingerprint(words),
    createdAt: 1,
  };
}

const SHARE = { service: "Seeds Exchange", pocket: 1106, at: 1763820000000 };
const vault = (seeds: unknown[]) => JSON.stringify({ v: 1, kind: "hm-seed-vault", seeds });

describe("pocket sharing record", () => {
  it("records only on the chosen seed and survives the locked vault round trip", () => {
    const a = entry("A");
    const b = entry("B");
    const out = recordPocketShare([a, b], a.id, SHARE);
    expect(out[0]!.pocketShares).toEqual([SHARE]);
    expect(out[1]!.pocketShares).toBeUndefined();
    expect(parsePayload(vault(out)).seeds[0]!.pocketShares).toEqual([SHARE]);
  });

  it("is never copied into a shared seed", () => {
    const [s] = recordPocketShare([entry("A")], "", SHARE);
    const withRecord = { ...s!, pocketShares: [SHARE] };
    expect(singleSeedTransferPayload(withRecord).seeds[0]).not.toHaveProperty("pocketShares");
  });

  it("travels in the owner's own backups", () => {
    const a = entry("A");
    const [s] = recordPocketShare([a], a.id, SHARE);
    expect(exportablePayload({ seeds: [s!], secrets: [] }).seeds[0]!.pocketShares).toEqual([SHARE]);
  });

  it(`keeps only the newest ${MAX_POCKET_SHARES} records`, () => {
    const a = entry("A");
    let seeds = [a];
    for (let i = 0; i < MAX_POCKET_SHARES + 5; i++)
      seeds = recordPocketShare(seeds, a.id, { ...SHARE, at: i });
    const shares = seeds[0]!.pocketShares!;
    expect(shares).toHaveLength(MAX_POCKET_SHARES);
    expect(shares[0]!.at).toBe(5);
    expect(shares.at(-1)!.at).toBe(MAX_POCKET_SHARES + 4);
  });

  it("refuses a malformed record in a backup", () => {
    const a = entry("A");
    for (const bad of [
      "x",
      [{ service: 1, pocket: 1106, at: 1 }],
      [{ service: "S", pocket: 1.5, at: 1 }],
      [{ service: "S", pocket: -1, at: 1 }],
      [{ service: "S", pocket: 1106, at: "soon" }],
      [null],
    ])
      expect(() => parsePayload(vault([{ ...a, pocketShares: bad }]))).toThrow();
  });

  it("cleans look-alike characters out of the service name", () => {
    const a = entry("A");
    const out = parsePayload(
      vault([{ ...a, pocketShares: [{ ...SHARE, service: "Seeds\u202e Exchange\u0000" }] }]),
    );
    expect(out.seeds[0]!.pocketShares![0]!.service).toBe("Seeds Exchange");
  });

  it("older vaults without the record still open unchanged", () => {
    const a = entry("A");
    expect(parsePayload(vault([a])).seeds[0]).not.toHaveProperty("pocketShares");
  });
});

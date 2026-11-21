import { describe, expect, it } from "vitest";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  assertImportAllowed,
  canRevealSeed,
  exportablePayload,
  parsePayload,
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

describe("hands-off seeds", () => {
  it("refuses hands-off imports in the browser", () => {
    const payload = parsePayload(
      JSON.stringify(singleSeedTransferPayload(entry("Gift"), "Theirs", true)),
    );
    expect(() => assertImportAllowed(payload, false)).toThrow(
      "Hands-off copies can only be received in the phone app.",
    );
  });

  it("allows hands-off imports in the phone app without dropping the flag", () => {
    const payload = parsePayload(
      JSON.stringify(singleSeedTransferPayload(entry("Gift"), "Theirs", true)),
    );
    expect(() => assertImportAllowed(payload, true)).not.toThrow();
    expect(payload.seeds[0]?.handsOff).toBe(true);
  });

  it("allows ordinary browser imports", () => {
    const payload = singleSeedTransferPayload(entry("Ordinary"));
    expect(() => assertImportAllowed(payload, false)).not.toThrow();
    expect(payload.seeds).toHaveLength(1);
  });

  it("refuses a mixed browser import as a whole before merging", () => {
    const ordinary = entry("Ordinary");
    const restricted = { ...entry("Hands-off"), handsOff: true as const };
    const payload = { seeds: [ordinary, restricted] };
    expect(() => assertImportAllowed(payload, false)).toThrow(
      "Hands-off copies can only be received in the phone app.",
    );
    expect(payload.seeds).toEqual([ordinary, restricted]);
  });

  it("a hands-off copy keeps the flag through transfer parsing", () => {
    const p = singleSeedTransferPayload(entry("Gift"), "Theirs", true);
    const got = parsePayload(JSON.stringify(p)).seeds[0];
    expect(got?.handsOff).toBe(true);
    expect(got && canRevealSeed(got)).toBe(false);
  });

  it("an ordinary copy has no flag", () => {
    const got = parsePayload(JSON.stringify(singleSeedTransferPayload(entry("Gift")))).seeds[0];
    expect(got?.handsOff).toBeUndefined();
    expect(got && canRevealSeed(got)).toBe(true);
  });

  it("a received hands-off seed can't be shared again", () => {
    const s = { ...entry("Gift"), handsOff: true as const };
    expect(() => singleSeedTransferPayload(s)).toThrow();
    expect(() => singleSeedTransferPayload(s, "x", true)).toThrow();
  });

  it("backups leave hands-off seeds out", () => {
    const mine = entry("Mine");
    const theirs = { ...entry("Theirs"), handsOff: true as const };
    const out = exportablePayload({ seeds: [mine, theirs], secrets: [] });
    expect(out.seeds.map((s) => s.id)).toEqual([mine.id]);
  });

  it("rejects a tampered flag value", () => {
    const p = singleSeedTransferPayload(entry("Gift"));
    const bad = { ...p, seeds: [{ ...p.seeds[0], handsOff: "no" }] };
    expect(() => parsePayload(JSON.stringify(bad))).toThrow();
  });
});

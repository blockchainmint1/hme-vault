/** One test per refusal the auditor asked for (2026-11-22 opinion, item 2). */
import { describe, expect, it } from "vitest";
import {
  assertExportableNode,
  assertNoAncestors,
  assertPolicySound,
  assertScopeWithinPolicy,
  parseHardenedPath,
} from "./branch-policy";
import { SEEDS_POCKET_PATHS } from "./seeds-request";

const POLICY = { pockets: [1106], paths: SEEDS_POCKET_PATHS };

describe("exportable node", () => {
  it("accepts a hardened account node and the hardened Solana leaf", () => {
    expect(() => assertExportableNode("m/44'/696969'/1106'", [1106])).not.toThrow();
    expect(() => assertExportableNode("m/44'/501'/1106'/0'", [1106])).not.toThrow();
  });
  it("refuses account 0 (the savings account)", () => {
    expect(() => assertExportableNode("m/44'/696969'/0'", [0, 1106])).toThrow();
  });
  it("refuses depth below 3", () => {
    expect(() => assertExportableNode("m/44'/696969'", [1106])).toThrow();
    expect(() => assertExportableNode("m/44'", [1106])).toThrow();
    expect(() => assertExportableNode("m", [1106])).toThrow();
  });
  it("refuses a non-hardened account index", () => {
    expect(() => assertExportableNode("m/44'/696969'/1106", [1106])).toThrow();
  });
  it("refuses any non-hardened component, including below the account", () => {
    expect(() => assertExportableNode("m/44/696969'/1106'", [1106])).toThrow();
    expect(() => assertExportableNode("m/44'/696969'/1106'/0/0", [1106])).toThrow();
  });
  it("refuses an account the policy does not allow", () => {
    expect(() => assertExportableNode("m/44'/696969'/1107'", [1106])).toThrow();
  });
  it("refuses malformed or out-of-range paths", () => {
    expect(() => parseHardenedPath("m/44'/696969'/2147483648'")).toThrow();
    expect(() => parseHardenedPath("m/44'/0696969'/1106'")).toThrow();
    expect(() => parseHardenedPath("44'/696969'/1106'")).toThrow();
    expect(() => parseHardenedPath("m/44h/696969h/1106h")).toThrow();
  });
});

describe("no parents", () => {
  it("refuses a scope that includes a parent of an approved node", () => {
    expect(() => assertNoAncestors(["m/44'/501'/1106'/0'", "m/44'/501'/1106'"])).toThrow();
  });
  it("refuses duplicates", () => {
    expect(() => assertNoAncestors(["m/44'/60'/1106'", "m/44'/60'/1106'"])).toThrow();
  });
  it("accepts siblings across coins", () => {
    expect(() => assertNoAncestors(SEEDS_POCKET_PATHS)).not.toThrow();
  });
});

describe("scope is decided before the approval screen", () => {
  it("accepts the exact frozen v2 list for pocket 1106", () => {
    expect(() => assertScopeWithinPolicy(SEEDS_POCKET_PATHS, 1106, POLICY)).not.toThrow();
  });
  it("refuses a widened scope", () => {
    expect(() =>
      assertScopeWithinPolicy([...SEEDS_POCKET_PATHS, "m/44'/0'/1106'"], 1106, POLICY),
    ).toThrow();
  });
  it("refuses a partial scope", () => {
    expect(() => assertScopeWithinPolicy(SEEDS_POCKET_PATHS.slice(1), 1106, POLICY)).toThrow();
  });
  it("refuses a reordered scope", () => {
    const swapped = [...SEEDS_POCKET_PATHS];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(() => assertScopeWithinPolicy(swapped, 1106, POLICY)).toThrow();
  });
  it("refuses a pocket outside the policy", () => {
    expect(() => assertScopeWithinPolicy(SEEDS_POCKET_PATHS, 0, POLICY)).toThrow();
  });
});

describe("a profile's own policy must be sound to load", () => {
  it("the Seeds policy is sound", () => {
    expect(() => assertPolicySound(POLICY)).not.toThrow();
  });
  it("a policy allowing pocket 0 is refused", () => {
    expect(() => assertPolicySound({ pockets: [0], paths: ["m/44'/60'/0'"] })).toThrow();
  });
  it("a policy with a shallow path is refused", () => {
    expect(() => assertPolicySound({ pockets: [1106], paths: ["m/44'/60'"] })).toThrow();
  });
  it("a policy containing a parent and child is refused", () => {
    expect(() =>
      assertPolicySound({ pockets: [1106], paths: ["m/44'/501'/1106'", "m/44'/501'/1106'/0'"] }),
    ).toThrow();
  });
  it("an empty policy is refused", () => {
    expect(() => assertPolicySound({ pockets: [], paths: [] })).toThrow();
  });
});

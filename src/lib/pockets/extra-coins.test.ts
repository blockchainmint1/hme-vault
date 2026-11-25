import { describe, expect, it } from "vitest";
import { hex } from "@scure/base";
import { ed25519 } from "@noble/curves/ed25519.js";
import vectors from "./extra-coins-reference-vectors.json";
import { accountPath, parseAccountPath, receivePath } from "./coins";
import { pocketsFromMnemonic, pocketKeysMatch, pocketReceiveAddress } from "./derive";
import { edKeysMatch, edReceiveAddress, tonAddress, xlmDecodeAddress } from "./ed25519-chains";

describe("Stellar, TON W5 and Sui match independent chain-library vectors", () => {
  for (const fixture of vectors.cases) {
    const label = fixture.passphrase || "no extra password";
    for (const coin of ["XLM", "TON", "SUI"] as const) {
      it(`${coin}, ${label}: exact path, public/private pair and receive address`, () => {
        const expected = fixture.coins[coin];
        const bundle = pocketsFromMnemonic(vectors.words, {
          passphrase: fixture.passphrase.normalize("NFKD"),
        });
        expect(accountPath(coin, 1106)).toBe(expected.path);
        expect(receivePath(coin, 1106)).toBe(expected.path);
        expect(parseAccountPath(expected.path)).toEqual({ coin, account: 1106 });
        expect(bundle.paths).toHaveLength(19);
        expect(bundle.xpubs[coin]).toBe(expected.publicHalf);
        expect(bundle.xprvs[coin]).toBe(expected.privateHalf);
        expect(bundle.addresses[coin]).toBe(expected.address);
        expect(pocketReceiveAddress(coin, expected.publicHalf)).toBe(expected.address);
        expect(pocketKeysMatch(coin, expected.privateHalf, expected.publicHalf)).toBe(true);
        expect(edKeysMatch(coin, "00".repeat(32), expected.publicHalf)).toBe(false);
      });
    }
  }

  it("Stellar strkey checksum rejects a changed address", () => {
    const address = "GARWV2LPPTIXJYVWMINIZHNKNUCR3FDVANOPTZXGYV3765UZKSHWV5AI";
    expect(xlmDecodeAddress(address)).toHaveLength(32);
    expect(() => xlmDecodeAddress(address.slice(0, -1) + "A")).toThrow();
  });

  it("TON uses W5 mainnet workchain zero and the pinned non-bounceable vector", () => {
    const fixture = vectors.cases[0];
    if (!fixture) throw new Error("Missing vector");
    expect(tonAddress(ed25519.getPublicKey(hex.decode(fixture.coins.TON.privateHalf)))).toBe(
      "UQCsq4rzqzuJvOOkCj00SPdMru6-SHmeDuGf2_ecmdjlNwcm",
    );
  });

  it("TON public half refuses uppercase hex", () => {
    const fixture = vectors.cases[0];
    if (!fixture) throw new Error("Missing vector");
    expect(() => edReceiveAddress("TON", fixture.coins.TON.publicHalf.toUpperCase())).toThrow();
  });

  it("Sui public half refuses uppercase address hex", () => {
    expect(() =>
      edReceiveAddress("SUI", "0xC103715616f6451c7d969ef90d20d1016924dad27e9c36cd3c1bd5ee5c36b8a1"),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  DISPERSE_ADDRESS,
  DISPERSE_CHAINS,
  DISPERSE_CODE_CHECKED_AT,
  DISPERSE_CODE_HASHES,
  DISPERSE_STRIPPED_CODE_HASHES,
} from "./evm";

/**
 * Release evidence, not a runtime lookup: eth_getCode at DISPERSE_ADDRESS on 2026-11-17.
 * Ethereum: PublicNode. BNB Chain: official BNB endpoint and PublicNode independently agreed.
 * Base: the official endpoint and PublicNode independently agreed. Every result was 1,780 bytes.
 * Ethereum PublicNode and Base's official endpoint were fetched again for the metadata check:
 * the last a165627a7a72305820 marker began at byte 1,737 on both. Removing that 43-byte CBOR
 * suffix left identical 1,737-byte executable code with Keccak-256
 * 0xab5361a2ceb73b9f4ae4dc31c9079082571483cbd6115cc3010aa93963634d6b. BNB's full code already
 * matches Ethereum byte for byte, so its stripped code and hash are identical too.
 */
describe("pinned Disperse contract code", () => {
  it("keeps the verified address, date and supported chains together", () => {
    expect(DISPERSE_ADDRESS).toBe("0xD152f549545093347A162Dce210e7293f1452150");
    expect(DISPERSE_CODE_CHECKED_AT).toBe("2026-11-17");
    expect(DISPERSE_CHAINS).toEqual([1, 56, 8453]);
  });

  it.each([
    [1, "0x65660051e320731a70b9ddcd5ec9fd4f565cf85e2f6caf0eb71589fb544b9996"],
    [56, "0x65660051e320731a70b9ddcd5ec9fd4f565cf85e2f6caf0eb71589fb544b9996"],
    [8453, "0xc0a38c227d2c70248fc51ed0dd3a72df3adf5b41494c7f3cc19c16c38523244d"],
  ] as const)("pins the eth_getCode Keccak-256 for chain %i", (chainId, hash) => {
    expect(DISPERSE_CODE_HASHES[chainId]).toBe(hash);
  });

  it.each([1, 56, 8453] as const)(
    "pins the same metadata-stripped executable code on chain %i",
    (chainId) => {
      expect(DISPERSE_STRIPPED_CODE_HASHES[chainId]).toBe(
        "0xab5361a2ceb73b9f4ae4dc31c9079082571483cbd6115cc3010aa93963634d6b",
      );
    },
  );
});

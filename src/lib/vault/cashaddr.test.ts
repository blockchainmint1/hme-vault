import { describe, expect, it } from "vitest";
import { base58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { encodeCashAddrP2PKH } from "./cashaddr";

describe("Bitcoin Cash mainnet P2PKH encoding", () => {
  it("matches the published CashAddr reference vector", () => {
    const hash = base58check(sha256).decode("1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu").slice(1);
    expect(encodeCashAddrP2PKH(hash)).toBe(
      "bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
    );
  });
  it("rejects every unsupported hash length", () => {
    for (const length of [0, 19, 21, 24, 28, 32, 40, 48, 56, 64]) {
      expect(() => encodeCashAddrP2PKH(new Uint8Array(length))).toThrow("20-byte hash");
    }
  });
  it("pads the final group with zero bits for the all-zero reference hash", () => {
    expect(encodeCashAddrP2PKH(new Uint8Array(20))).toBe(
      "bitcoincash:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqfnhks603",
    );
  });
});

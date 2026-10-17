import { describe, expect, it } from "vitest";
import { coinPasswordFromScan, confirmCoinPassword } from "./coin-unlock";
import { lockText, unlockText } from "./format";

const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const other = "legal winner thank year wave sausage worth useful legal winner thank yellow";
describe("hidden coin credential", () => {
  it("uses the existing hidden BIP39 words as the password", () => {
    expect(coinPasswordFromScan(`  ${seed.toUpperCase().replaceAll(" ", "\n")}  `)).toBe(seed);
    expect(coinPasswordFromScan("0000".repeat(11) + "0003")).toBe(seed);
  });
  it("never accepts public coin QR or payment addresses", () => {
    for (const value of ["https://coins.honest.money/coin/123", "0x9858effd232b4033e47d90003d41ec34ecaeda94", "coin-id-123", "abandon ".repeat(12)]) expect(() => coinPasswordFromScan(value)).toThrow();
  });
  it("requires explicit acknowledgement", () => {
    expect(() => confirmCoinPassword(seed, seed, false)).toThrow();
  });
  it("requires the same coin twice", () => {
    expect(() => confirmCoinPassword(seed, other, true)).toThrow();
    expect(confirmCoinPassword(seed, seed, true)).toBe(seed);
  });
  it("keeps the standard HMVAULT1 recovery password unchanged", async () => {
    const blob = await lockText("dummy recovery payload", confirmCoinPassword(seed, seed, true), 1000);
    expect(blob.startsWith("HMVAULT1.")).toBe(true);
    expect(await unlockText(blob, seed)).toBe("dummy recovery payload");
    await expect(unlockText(blob, other)).rejects.toThrow();
  });
});
describe("old-style private key coins", () => {
  const wifKey = "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ";
  it("accepts a checksum-valid WIF key verbatim", () => {
    expect(coinPasswordFromScan(` ${wifKey}\n`)).toBe(wifKey);
    expect(coinPasswordFromScan("KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617")).toBe("KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617");
  });
  it("rejects a WIF key with a typo", () => {
    expect(() => coinPasswordFromScan(wifKey.slice(0, -1) + "K")).toThrow();
  });
  it("accepts 64-char hex keys, normalized", () => {
    const hex = "0C28FCA386C7A227600B2FE50B7CAE11EC86D3BF1FBE471BE89827E19D72AA1D";
    expect(coinPasswordFromScan("0x" + hex)).toBe(hex.toLowerCase());
  });
  it("still rejects addresses", () => {
    expect(() => coinPasswordFromScan("1GAehh7TsJAHuUAeKZcXf5CnwuGuGgyX2S")).toThrow();
  });
});

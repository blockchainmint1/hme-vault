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
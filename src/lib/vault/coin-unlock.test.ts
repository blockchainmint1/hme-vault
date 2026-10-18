import { describe, expect, it } from "vitest";
import { coinPasswordFromScan, combineCoinPassword, confirmCoinPassword } from "./coin-unlock";
import { lockText, unlockText } from "./format";

const seed = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const other = "legal winner thank year wave sausage worth useful legal winner thank yellow";
describe("hidden coin credential", () => {
  it("uses the existing hidden BIP39 words as the password", () => {
    expect(coinPasswordFromScan(`  ${seed.toUpperCase().replaceAll(" ", "\n")}  `)).toBe(seed);
    expect(coinPasswordFromScan("0000".repeat(11) + "0003")).toBe(seed);
  });
  it("accepts any other QR content exactly as scanned", () => {
    for (const value of ["https://coins.honest.money/coin/123", "coin-id-123", "Some Random Secret!"]) expect(coinPasswordFromScan(`  ${value} `)).toBe(value);
    expect(() => coinPasswordFromScan("   ")).toThrow();
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
  it("treats a non-checksum key-like string as raw text", () => {
    expect(coinPasswordFromScan(wifKey.slice(0, -1) + "K")).toBe(wifKey.slice(0, -1) + "K");
  });
  it("accepts 64-char hex keys, normalized", () => {
    const hex = "0C28FCA386C7A227600B2FE50B7CAE11EC86D3BF1FBE471BE89827E19D72AA1D";
    expect(coinPasswordFromScan("0x" + hex)).toBe(hex.toLowerCase());
  });
  it("accepts address-looking QR content as scanned", () => {
    expect(coinPasswordFromScan("1GAehh7TsJAHuUAeKZcXf5CnwuGuGgyX2S")).toBe("1GAehh7TsJAHuUAeKZcXf5CnwuGuGgyX2S");
  });
});
describe("coin plus extra secret word", () => {
  it("combines coin and word so both are required", async () => {
    const combined = combineCoinPassword(seed, "  correct horse  ");
    expect(combined).toBe(`${seed}\ncorrect horse`);
    const blob = await lockText("payload", combined, 1000);
    await expect(unlockText(blob, seed)).rejects.toThrow();
    await expect(unlockText(blob, "correct horse")).rejects.toThrow();
    expect(await unlockText(blob, combined)).toBe("payload");
  });
  it("leaves the coin credential unchanged without a word", () => {
    expect(combineCoinPassword(seed, "")).toBe(seed);
    expect(combineCoinPassword(seed, "   ")).toBe(seed);
  });
  it("rejects the wrong extra word even with the correct scanned coin", async () => {
    const coin = coinPasswordFromScan("txc:KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617");
    const blob = await lockText("sensitive vault data", combineCoinPassword(coin, "my secret word"), 1000);
    await expect(unlockText(blob, combineCoinPassword(coin, "wrong word"))).rejects.toThrow();
    expect(await unlockText(blob, combineCoinPassword(coin, "my secret word"))).toBe("sensitive vault data");
  });
  it("requires the sender's extra word for backups, not the receiver's", async () => {
    const blob = await lockText("source backup", combineCoinPassword(seed, "sender word"), 1000);
    await expect(unlockText(blob, combineCoinPassword(seed, "receiver word"))).rejects.toThrow();
    expect(await unlockText(blob, combineCoinPassword(seed, "sender word"))).toBe("source backup");
  });
});
describe("TXC key labels", () => {
  it("accepts txc:/bitcoin:-prefixed WIF", () => {
    expect(coinPasswordFromScan("bitcoin:5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ")).toBe("5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ");
    const k = "KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617";
    expect(coinPasswordFromScan("txc:" + k)).toBe(k);
  });
});

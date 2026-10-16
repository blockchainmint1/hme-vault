import { describe, expect, it } from "vitest";
import { lockSeed, unlockSeed } from "./format";

const SEED = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("seed vault", () => {
  it("round-trips a seed with the right password", async () => {
    const v = await lockSeed(SEED, "correct horse", 2000);
    expect(v.startsWith("HMVAULT1.2000.")).toBe(true);
    expect(await unlockSeed(v, "correct horse")).toBe(SEED);
  });
  it("rejects the wrong password", async () => {
    const v = await lockSeed(SEED, "correct horse", 2000);
    await expect(unlockSeed(v, "wrong horse")).rejects.toThrow(/Wrong password/);
  });
  it("refuses passwords shorter than 8 characters", async () => {
    await expect(lockSeed(SEED, "short", 2000)).rejects.toThrow();
  });
  it("defaults to 600,000 iterations", async () => {
    const v = await lockSeed(SEED, "correct horse");
    expect(v.split(".")[1]).toBe("600000");
  });
});

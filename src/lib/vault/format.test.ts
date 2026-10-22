import { describe, expect, it } from "vitest";
import { lockSeed, unlockSeed } from "./format";

const SEED =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("seed vault", () => {
  it("round-trips a seed with the right password", async () => {
    const v = await lockSeed(SEED, "Cobalt-Willow-Harbor-29", 2000);
    expect(v.startsWith("HMVAULT1.2000.")).toBe(true);
    expect(await unlockSeed(v, "Cobalt-Willow-Harbor-29")).toBe(SEED);
  });
  it("rejects the wrong password", async () => {
    const v = await lockSeed(SEED, "Cobalt-Willow-Harbor-29", 2000);
    await expect(unlockSeed(v, "wrong horse")).rejects.toThrow(/Wrong password/);
  });
  it("refuses passwords shorter than 8 characters", async () => {
    await expect(lockSeed(SEED, "short", 2000)).rejects.toThrow();
  });
  it("defaults to 1,000,000 iterations", async () => {
    const v = await lockSeed(SEED, "Cobalt-Willow-Harbor-29");
    expect(v.split(".")[1]).toBe("1000000");
  });
  it("never writes an iteration count the offline reader refuses", async () => {
    await expect(lockSeed(SEED, "Cobalt-Willow-Harbor-29", 999)).rejects.toThrow();
    await expect(lockSeed(SEED, "Cobalt-Willow-Harbor-29", 10_000_001)).rejects.toThrow();
  });
});

describe("typed-password boundary", () => {
  it("rejects a weak typed password at the format layer (10+ chars, same rule as the UI)", async () => {
    const { lockTypedText } = await import("./format");
    await expect(lockTypedText("x", "abcdefgh", 1000)).rejects.toThrow(/at least 10/);
    await expect(lockTypedText("x", "password123", 1000)).rejects.toThrow();
  });
  it("still opens backups made with 600,000 iterations", async () => {
    const { lockText, unlockText } = await import("./format");
    const old = await lockText("legacy", "Cobalt-Willow-Harbor-29", 600_000);
    expect(await unlockText(old, "Cobalt-Willow-Harbor-29")).toBe("legacy");
  });
});

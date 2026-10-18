import { describe, expect, it, vi, beforeEach } from "vitest";
import { lockText, unlockText } from "../vault/format";

const plugin = vi.hoisted(() => ({
  enroll: vi.fn(async (_options: { secret: string }) => ({ strongBox: true })),
  unlock: vi.fn(async () => ({ secret: "" })),
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => plugin }));
vi.mock("./platform", () => ({ isNative: () => true }));
vi.mock("@aparajita/capacitor-secure-storage", () => ({ SecureStorage: { remove: vi.fn(async () => undefined) } }));

import { enableBiometric, unlockWithBiometric } from "./biometric";

beforeEach(() => vi.clearAllMocks());

describe("fingerprint enrollment credential", () => {
  it("seals coin plus extra password and recovers that complete credential", async () => {
    const coin = "dummy-secret-coin-key";
    const combined = `${coin}\nsecret word`;
    await enableBiometric(coin, "  secret word  ");
    expect(plugin.enroll).toHaveBeenCalledWith({ secret: combined });
    plugin.unlock.mockResolvedValueOnce({ secret: combined });
    const recovered = await unlockWithBiometric();
    expect(recovered).toBe(combined);
    const backup = await lockText("dummy vault", combined, 1000);
    await expect(unlockText(backup, coin)).rejects.toThrow();
    if (recovered === null) throw new Error("Missing fingerprint credential");
    expect(await unlockText(backup, recovered)).toBe("dummy vault");
  });

  it("keeps password-only and coin-only enrollment unchanged", async () => {
    await enableBiometric("existing password");
    expect(plugin.enroll).toHaveBeenCalledWith({ secret: "existing password" });
  });
});
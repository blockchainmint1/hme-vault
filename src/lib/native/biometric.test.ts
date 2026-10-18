import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ on: true }));
const plugin = vi.hoisted(() => ({
  status: vi.fn(), unlock: vi.fn(), enroll: vi.fn(), remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ registerPlugin: () => plugin }));
vi.mock("./platform", () => ({ isNative: () => native.on }));
vi.mock("@aparajita/capacitor-secure-storage", () => ({ SecureStorage: { remove: vi.fn().mockResolvedValue(undefined) } }));
import { confirmWithBiometric, enableBiometric, getBiometricStatus } from "./biometric";

describe("fingerprint confirmation for the current Vault", () => {
  beforeEach(async () => {
    native.on = true;
    plugin.status.mockResolvedValue({ available: true, enrolled: true, strongBox: true });
    await getBiometricStatus();
  });
  it("seals the full coin-plus-word credential", async () => {
    await enableBiometric("dummy coin", "extra word");
    expect(plugin.enroll).toHaveBeenCalledWith({ secret: "dummy coin\nextra word" });
  });
  it("requires the released combined credential to match this Vault", async () => {
    const verify = (credential: string) => credential === "dummy coin\nextra word";
    plugin.unlock.mockResolvedValue({ secret: "dummy coin" });
    expect(await confirmWithBiometric("Reveal", verify)).toBe(false);
    plugin.unlock.mockResolvedValue({ secret: "dummy coin\nwrong word" });
    expect(await confirmWithBiometric("Reveal", verify)).toBe(false);
    plugin.unlock.mockResolvedValue({ secret: "dummy coin\nextra word" });
    expect(await confirmWithBiometric("Reveal", verify)).toBe(true);
  });
  it("never approves when fingerprint is unavailable or cancelled", async () => {
    plugin.unlock.mockRejectedValue({ code: "CANCELLED" });
    expect(await confirmWithBiometric("Reveal", () => true)).toBe(false);
    native.on = false;
    expect(await confirmWithBiometric("Reveal", () => true)).toBe(false);
  });
});
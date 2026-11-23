import { describe, expect, it } from "vitest";
import asset from "@/assets/vault-apk.apk.asset.json";
import { APK_VERSION, versionBuiltOn } from "./release";

describe("published APK fingerprint", () => {
  it("matches the APK the footer links to", () => {
    expect(asset.original_filename).toContain(APK_VERSION);
  });
});

describe("versionBuiltOn", () => {
  it("reads the build day from a stamped APK version", () => {
    expect(versionBuiltOn("0.1.202611230057")).toBe("23 Nov 2026");
  });
  it("refuses versions that are not build stamps", () => {
    expect(versionBuiltOn("1.0")).toBeNull();
    expect(versionBuiltOn("0.1.202613010000")).toBeNull();
  });
});

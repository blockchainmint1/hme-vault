import { describe, expect, it } from "vitest";
import asset from "@/assets/vault-apk.apk.asset.json";
import pkg from "../../package.json";
import { APK_VERSION, compareVersions, versionBuiltOn } from "./release";

describe("published APK fingerprint", () => {
  it("links a real versioned APK that is never newer than the announced version", () => {
    // The announced APK_VERSION may run ahead of the downloadable file while a new APK
    // awaits its build and swap, but the file on offer must never claim to be newer.
    const m = /(\d+\.\d+\.\d+)/.exec(asset.original_filename);
    expect(m, "APK file name carries a dotted version").toBeTruthy();
    expect(compareVersions(m![1], APK_VERSION)).toBeLessThanOrEqual(0);
  });
});

describe("our own version numbering", () => {
  it("is a plain three-part number like 1.0.0", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("is never older than the APK on the website", () => {
    expect(compareVersions(pkg.version, APK_VERSION)).toBeGreaterThanOrEqual(0);
  });
  it("compares part by part, not as text", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.1.202611230057")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBeLessThan(0);
  });
});

describe("versionBuiltOn", () => {
  it("reads the build day from a legacy stamped APK version", () => {
    expect(versionBuiltOn("0.1.202611230057")).toBe("23 Nov 2026");
  });
  it("refuses versions that are not build stamps", () => {
    expect(versionBuiltOn("1.0.0")).toBeNull();
    expect(versionBuiltOn("0.1.202613010000")).toBeNull();
  });
});

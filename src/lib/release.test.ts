import { describe, expect, it } from "vitest";
import asset from "@/assets/vault-apk.apk.asset.json";
import { APK_VERSION } from "./release";

describe("published APK fingerprint", () => {
  it("matches the APK the footer links to", () => {
    expect(asset.original_filename).toContain(APK_VERSION);
  });
});

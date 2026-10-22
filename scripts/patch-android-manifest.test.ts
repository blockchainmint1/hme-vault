import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
it("keeps network and cloud backups disabled and registers the USB picker idempotently", () => {
  const root = mkdtempSync(join(tmpdir(), "vault-manifest-"));
  try {
    const main = join(root, "android/app/src/main");
    const java = join(main, "java/money/honest/seedvault");
    mkdirSync(java, { recursive: true });
    mkdirSync(join(main, "res/values"), { recursive: true });
    mkdirSync(join(root, "scripts/native"), { recursive: true });
    for (const f of [
      "VaultDocumentsPlugin.java",
      "VaultBiometricKeyPlugin.java",
      "VaultRadioCheckPlugin.java",
    ])
      copyFileSync(resolve("scripts/native", f), join(root, "scripts/native", f));
    mkdirSync(join(root, "android/app"), { recursive: true });
    writeFileSync(join(root, "android/app/build.gradle"), "dependencies {\n}\n");
    writeFileSync(
      join(main, "AndroidManifest.xml"),
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET" /><application android:allowBackup="true"></application></manifest>',
    );
    writeFileSync(
      join(java, "MainActivity.java"),
      "package money.honest.seedvault; import com.getcapacitor.BridgeActivity; public class MainActivity extends BridgeActivity {}",
    );
    writeFileSync(
      join(main, "res/values/strings.xml"),
      '<resources><string name="app_name">HME Seed Vault</string></resources>',
    );
    for (let i = 0; i < 2; i++)
      execFileSync("node", [resolve("scripts/patch-android-manifest.mjs")], { cwd: root });
    const xml = readFileSync(join(main, "AndroidManifest.xml"), "utf8");
    const act = readFileSync(join(java, "MainActivity.java"), "utf8");
    for (const p of ["INTERNET", "CHANGE_WIFI_STATE", "CHANGE_NETWORK_STATE"])
      expect(xml).toContain(`android.permission.${p}" tools:node="remove"`);
    for (const p of ["ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE"]) {
      expect(xml).toContain(`<uses-permission android:name="android.permission.${p}" />`);
      expect(xml).not.toContain(`${p}" tools:node="remove"`);
    }
    expect(act.match(/registerPlugin\(VaultRadioCheckPlugin.class\)/g)).toHaveLength(1);
    expect(xml).toContain('android:allowBackup="false"');
    expect(xml).not.toContain('android:allowBackup="true"');
    expect(
      readFileSync(join(java, "MainActivity.java"), "utf8").match(
        /registerPlugin\(VaultDocumentsPlugin.class\)/g,
      ),
    ).toHaveLength(1);
    expect(act.match(/registerPlugin\(VaultBiometricKeyPlugin.class\)/g)).toHaveLength(1);
    const bio = readFileSync(join(java, "VaultBiometricKeyPlugin.java"), "utf8");
    expect(bio).toContain("setUserAuthenticationRequired(true)");
    expect(bio).toContain("setInvalidatedByBiometricEnrollment(true)");
    expect(
      readFileSync(join(root, "android/app/build.gradle"), "utf8").match(
        /androidx\.biometric:biometric/g,
      ),
    ).toHaveLength(1);
    expect(readFileSync(join(java, "VaultDocumentsPlugin.java"), "utf8")).toContain(
      "Intent.ACTION_CREATE_DOCUMENT",
    );
    expect(xml.match(/android:dataExtractionRules="@xml\/data_extraction_rules"/g)).toHaveLength(1);
    const rules = readFileSync(join(main, "res/xml/data_extraction_rules.xml"), "utf8");
    expect(rules).toContain("<device-transfer>");
    expect(rules).toContain("<cloud-backup>");
    expect(readFileSync(join(main, "res/xml/file_paths.xml"), "utf8")).not.toContain('path="."');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

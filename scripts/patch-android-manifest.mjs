#!/usr/bin/env node
/**
 * HME Seed Vault Android manifest tweaks, run after `bunx cap add android`. Idempotent.
 *
 *  - REMOVES every network permission (INTERNET, CHANGE_*, ACCESS_NETWORK_STATE,
 *    ACCESS_WIFI_STATE), even ones a plugin's own manifest merges in, via
 *    tools:node="remove". The APK provably ships with zero network permissions;
 *    the pre-unlock offline checklist reads Settings.Global instead, which needs
 *    no permission at all.
 *  - Adds CAMERA (QR scanning) and USE_BIOMETRIC (fingerprint unlock).
 *  - Disables Android cloud backup so the vault is never copied off the phone.
 *  - Sets the app name.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
if (!existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}. Run \`bunx cap add android\` first.`);
  process.exit(1);
}

let xml = readFileSync(manifestPath, "utf8");

if (!xml.includes("xmlns:tools=")) {
  xml = xml.replace(/<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"');
}

// Drop any existing network permission lines, then block them from being merged back.
const NET = [
  "INTERNET",
  "CHANGE_WIFI_STATE",
  "CHANGE_NETWORK_STATE",
  "ACCESS_NETWORK_STATE",
  "ACCESS_WIFI_STATE",
];
for (const p of NET) {
  xml = xml.replace(
    new RegExp(`\\s*<uses-permission[^>]*android\\.permission\\.${p}"[^>]*/>`, "g"),
    "",
  );
}

const lines = [
  ...NET.map(
    (p) => `<uses-permission android:name="android.permission.${p}" tools:node="remove" />`,
  ),
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-permission android:name="android.permission.USE_BIOMETRIC" />',
];
for (const line of lines) {
  if (!xml.includes(line)) xml = xml.replace(/<application\b/, `    ${line}\n\n    <application`);
}

// No cloud / device-transfer backups of app data.
xml = xml.replace(/android:allowBackup="true"/, 'android:allowBackup="false"');
if (!xml.includes("android:allowBackup"))
  xml = xml.replace(/<application\b/, '<application android:allowBackup="false"');
if (!xml.includes("android:fullBackupContent"))
  xml = xml.replace(/<application\b/, '<application android:fullBackupContent="false"');

// Android 12+: exclude every file from cloud backup and phone-to-phone transfer.
const xmlDir = resolve(process.cwd(), "android/app/src/main/res/xml");
mkdirSync(xmlDir, { recursive: true });
writeFileSync(
  resolve(xmlDir, "data_extraction_rules.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" path="." /><exclude domain="file" path="." /><exclude domain="database" path="." /><exclude domain="sharedpref" path="." /><exclude domain="external" path="." />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" path="." /><exclude domain="file" path="." /><exclude domain="database" path="." /><exclude domain="sharedpref" path="." /><exclude domain="external" path="." />
    </device-transfer>
</data-extraction-rules>
`,
);
if (!xml.includes("android:dataExtractionRules"))
  xml = xml.replace(
    /<application\b/,
    '<application android:dataExtractionRules="@xml/data_extraction_rules"',
  );
// Narrow the file-sharing provider to one cache subfolder.
writeFileSync(
  resolve(xmlDir, "file_paths.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="vault_share" path="vault-share/" />
</paths>
`,
);

writeFileSync(manifestPath, xml);
console.log("Patched AndroidManifest.xml (no network, camera, biometric, no backups).");

const stringsPath = resolve(process.cwd(), "android/app/src/main/res/values/strings.xml");
if (existsSync(stringsPath)) {
  const strings = readFileSync(stringsPath, "utf8");
  const next = strings
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, "$1HME Vault$2")
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, "$1HME Vault$2");
  if (next !== strings) writeFileSync(stringsPath, next);
}

// Install the local SAF plugin into the generated Android project on every build.
const javaDir = resolve(process.cwd(), "android/app/src/main/java/money/honest/seedvault");
const mainPath = resolve(javaDir, "MainActivity.java");
if (!existsSync(mainPath)) throw new Error("Expected Vault MainActivity.java was not found.");
for (const name of [
  "VaultDocumentsPlugin.java",
  "VaultBiometricKeyPlugin.java",
  "VaultRadioCheckPlugin.java",
]) {
  writeFileSync(
    resolve(javaDir, name),
    readFileSync(resolve(process.cwd(), "scripts/native", name), "utf8"),
  );
}
let main = readFileSync(mainPath, "utf8");
if (!main.includes("registerPlugin(VaultDocumentsPlugin.class)")) {
  if (main.includes("void onCreate("))
    throw new Error("Review existing MainActivity.onCreate before registering document plugin.");
  main = main.replace(
    /extends BridgeActivity\s*\{/,
    `extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(VaultDocumentsPlugin.class);
        super.onCreate(savedInstanceState);
    }`,
  );
  if (!main.includes("registerPlugin(VaultDocumentsPlugin.class)"))
    throw new Error("Document plugin registration failed.");
}
if (!main.includes("registerPlugin(VaultBiometricKeyPlugin.class)")) {
  main = main.replace(
    "registerPlugin(VaultDocumentsPlugin.class);",
    "registerPlugin(VaultDocumentsPlugin.class);\n        registerPlugin(VaultBiometricKeyPlugin.class);",
  );
  if (!main.includes("registerPlugin(VaultBiometricKeyPlugin.class)"))
    throw new Error("Biometric key plugin registration failed.");
}
if (!main.includes("registerPlugin(VaultRadioCheckPlugin.class)")) {
  main = main.replace(
    "registerPlugin(VaultDocumentsPlugin.class);",
    "registerPlugin(VaultDocumentsPlugin.class);\n        registerPlugin(VaultRadioCheckPlugin.class);",
  );
  if (!main.includes("registerPlugin(VaultRadioCheckPlugin.class)"))
    throw new Error("Radio check plugin registration failed.");
}
writeFileSync(mainPath, main);

// The hardware-bound fingerprint plugin compiles against androidx.biometric.
const gradlePath = resolve(process.cwd(), "android/app/build.gradle");
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, "utf8");
  const dep = 'implementation "androidx.biometric:biometric:1.1.0"';
  if (!gradle.includes(dep)) {
    gradle = gradle.replace(/dependencies\s*\{/, `dependencies {\n    ${dep}`);
    if (!gradle.includes(dep)) throw new Error("Could not add androidx.biometric dependency.");
    writeFileSync(gradlePath, gradle);
  }
}

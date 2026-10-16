#!/usr/bin/env node
/**
 * HME Seed Vault Android manifest tweaks, run after `bunx cap add android`. Idempotent.
 *
 *  - REMOVES all network permissions (INTERNET, ACCESS_NETWORK_STATE, Wi-Fi state),
 *    even ones a plugin's own manifest merges in, via tools:node="remove".
 *    With no INTERNET permission Android itself blocks every socket.
 *  - Adds CAMERA (QR scanning) and USE_BIOMETRIC (fingerprint unlock).
 *  - Disables Android cloud backup so the vault is never copied off the phone.
 *  - Sets the app name.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
if (!existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}. Run \`bunx cap add android\` first.`);
  process.exit(1);
}

let xml = readFileSync(manifestPath, "utf8");

if (!xml.includes('xmlns:tools=')) {
  xml = xml.replace(/<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"');
}

// Drop any existing plain network permission lines.
const NET = ["INTERNET", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE", "CHANGE_WIFI_STATE", "CHANGE_NETWORK_STATE"];
for (const p of NET) {
  xml = xml.replace(new RegExp(`\\s*<uses-permission[^>]*android\\.permission\\.${p}"[^>]*/>`, "g"), "");
}

const lines = [
  ...NET.map((p) => `<uses-permission android:name="android.permission.${p}" tools:node="remove" />`),
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-permission android:name="android.permission.USE_BIOMETRIC" />',
];
for (const line of lines) {
  if (!xml.includes(line)) xml = xml.replace(/<application\b/, `    ${line}\n\n    <application`);
}

// No cloud / device-transfer backups of app data.
xml = xml.replace(/android:allowBackup="true"/, 'android:allowBackup="false"');
if (!xml.includes("android:allowBackup")) xml = xml.replace(/<application\b/, '<application android:allowBackup="false"');
if (!xml.includes("android:fullBackupContent")) xml = xml.replace(/<application\b/, '<application android:fullBackupContent="false"');

writeFileSync(manifestPath, xml);
console.log("Patched AndroidManifest.xml (no network, camera, biometric, no backups).");

const stringsPath = resolve(process.cwd(), "android/app/src/main/res/values/strings.xml");
if (existsSync(stringsPath)) {
  const strings = readFileSync(stringsPath, "utf8");
  const next = strings
    .replace(/(<string name="app_name">)[^<]*(<\/string>)/, "$1HME Seed Vault$2")
    .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, "$1HME Seed Vault$2");
  if (next !== strings) writeFileSync(stringsPath, next);
}

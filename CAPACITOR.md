# HME Vault — native Android build (Capacitor)

HME Vault ships as an offline Android APK built with Capacitor. The iOS app is discontinued.
The same web bundle also runs at vault.honest.money as a **demo only** (a banner says so on every screen).

## Fixed settings (`capacitor.config.ts`)

- App ID `money.honest.seedvault`, name "HME Vault".
- Always bundled: no `server.url` in a release. `HME_REMOTE_URL` is for local development only.
- `hostname: "vault.local"` fixes the storage origin. Changing it after release orphans every installed vault.
- PrivacyScreen on app-wide: no screenshots, no screen recording, blank in the app switcher.

## Manifest patch (`scripts/patch-android-manifest.mjs`)

Runs after `cap sync` and must keep:

- removing INTERNET, ACCESS_NETWORK_STATE and every other network permission with `tools:node="remove"`;
- `allowBackup="false"` plus `dataExtractionRules` that exclude all data;
- minSdk 28;
- installing the local `VaultBiometricKeyPlugin` (hardware-sealed fingerprint) and `VaultDocumentsPlugin` (USB save/open through the system file picker, no storage permissions).

## Building

GitHub Actions (`.github/workflows/android-apk.yml`) builds the signed APK. Before building it runs the
formatting check, lint, typecheck and unit tests, and stops if any of them fail. See `ANDROID.md` for local builds.

## Verifying a downloaded APK

The website footer publishes the APK's SHA-256 and the signing certificate's SHA-256
(`src/lib/release.ts`). Check with `sha256sum` and `apksigner verify --print-certs` before installing.
